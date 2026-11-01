// Opt-in real Windows integration QA on the user's explicitly authorized host.
// Installs nothing, uses a fresh isolated profile, and terminates only its PID.
import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import path from 'node:path';import fs from 'node:fs';import {randomBytes,createHash} from 'node:crypto';
import {root} from './source.mjs';import {until,sleep} from './app-session.mjs';
const sshArgs=['-o','BatchMode=yes','-o','ConnectTimeout=5','-l','40608','railgunhamster'];
function run(file,args,input='',timeout=60000){return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('Owned Windows QA command timed out'));},timeout);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code)reject(Error('Owned Windows QA command failed: '+err.slice(0,4096)));else resolve(out.replace(/^\uFEFF/,''));});child.stdin.end(input);});}
function ps(source,input=''){return run('ssh',[...sshArgs,'powershell','-NoProfile','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],input);}
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
export async function launchRemoteWindowsApp(){
  if(process.env.RHFILES_REMOTE_WINDOWS_QA!=='1')throw Error('Real remote Windows QA requires explicit opt-in');
  const id=randomBytes(16).toString('hex'),directory=`C:\\Users\\40608\\AppData\\Local\\Temp\\rhfiles-windows-qa-${id}`.replaceAll('\\\\','\\'),task='RHFiles-owned-windows-qa-'+id;
  const executable=process.env.RHFILES_TEST_EXECUTABLE?path.resolve(process.env.RHFILES_TEST_EXECUTABLE):path.join(root,'target/debug/rhfiles.exe');
  const expected=createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  console.log('Owned remote Windows QA directory: '+directory+'; binary SHA256: '+expected);
  await ps(`$ErrorActionPreference='Stop';New-Item -ItemType Directory -Path '${directory}'|Out-Null`);
  for(const[source,name]of [[executable,'RHFiles.exe'],[path.join(root,'scripts/testing/remote-windows-app.ps1'),'bootstrap.ps1']])await run('scp',['-q','-o','BatchMode=yes','-o','ConnectTimeout=5',source,'40608@railgunhamster:'+directory.replaceAll('\\','/')+'/'+name],'',120000);
  const hash=(await ps(`(Get-FileHash -Algorithm SHA256 -LiteralPath '${directory}\\RHFiles.exe').Hash`)).trim().toLowerCase();if(hash!==expected)throw Error('Remote QA executable hash mismatch');
  let remote,tunnel,socket;const pending=new Map();let sequence=0;
  const close=async()=>{
    socket?.close();tunnel?.kill();
    for(const value of pending.values()){clearTimeout(value.timer);value.reject(Error('Owned QA session closed'));}pending.clear();
    await ps(`$ErrorActionPreference='Stop';Unregister-ScheduledTask -TaskName '${task}' -Confirm:$false -ErrorAction SilentlyContinue;if(Test-Path -LiteralPath '${directory}\\ready.json'){$s=Get-Content -Raw -LiteralPath '${directory}\\ready.json'|ConvertFrom-Json;$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$s.pid);if($p -and $p.ExecutablePath -eq '${directory}\\RHFiles.exe'){& taskkill.exe /PID $s.pid /T /F|Out-Null}}`).catch(()=>{});
  };
  try{
    // Execute our reviewed bootstrap as an encoded command. Do not change
    // the machine/user ExecutionPolicy just to run a test script file.
    const bootstrap=fs.readFileSync(path.join(root,'scripts/testing/remote-windows-app.ps1'),'utf8');
    const encoded=Buffer.from(`& {\n${bootstrap}\n} -Directory '${directory}'`,'utf16le').toString('base64');
    await ps(`$ErrorActionPreference='Stop';$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json;$a=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $payload.arguments -WorkingDirectory '${directory}';$p=New-ScheduledTaskPrincipal -UserId 'RAILGUNHAMSTER\\40608' -LogonType Interactive -RunLevel Limited;Register-ScheduledTask -TaskName '${task}' -Action $a -Principal $p|Out-Null;Start-ScheduledTask -TaskName '${task}'`,JSON.stringify({arguments:'-NoProfile -WindowStyle Hidden -EncodedCommand '+encoded}));
    remote=await until(async()=>{const value=await ps(`if(Test-Path -LiteralPath '${directory}\\ready.json'){Get-Content -Raw -LiteralPath '${directory}\\ready.json'}`);return value.trim()?JSON.parse(value):false;},'owned remote QA process startup',30000);
    const port=await free();tunnel=spawn('ssh',[...sshArgs,'-N','-o','ExitOnForwardFailure=yes','-L',`127.0.0.1:${port}:127.0.0.1:${remote.port}`],{windowsHide:true,stdio:'ignore'});
    const target=await until(async()=>{const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)});return(await response.json()).find(t=>t.type==='page'&&/\/(index\.html)?$/.test(new URL(t.url).pathname));},'owned remote WebView',30000);
    const url=new URL(target.webSocketDebuggerUrl);url.port=String(port);socket=new WebSocket(url);await Promise.race([once(socket,'open'),sleep(5000).then(()=>{throw Error('Remote CDP timeout')})]);
    socket.addEventListener('message',e=>{const message=JSON.parse(e.data),item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Owned remote API timeout: '+method));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.exception?.value||response.exceptionDetails.text);return response.result?.value;};
    await until(()=>evaluate('typeof G!=="undefined"&&G.startupReady===true'),'remote frontend ready',30000);
    const profile=await evaluate('call("get_instance_profile",{})');for(const folder of [profile.dataDirectory,profile.webviewDirectory]){const relative=path.win32.relative(directory,folder||'');if(path.win32.isAbsolute(relative)||relative==='..'||relative.startsWith('..\\'))throw Error('Remote profile isolation failed: '+JSON.stringify({dataDirectory:profile.dataDirectory,webviewDirectory:profile.webviewDirectory}));}
    await evaluate('G.settings.autoUpdateEnabled=false;true');await ps(`Unregister-ScheduledTask -TaskName '${task}' -Confirm:$false`);
    let writes=0;
    const writeNative=async(file,bytes)=>{
      // WNet authentication belongs to the interactive Windows logon. An SSH
      // session with the same username is a different logon, not that app.
      const output=directory+'\\write-'+(++writes)+'.json',name=task+'-write';
      const source=`$ErrorActionPreference='Stop';try{[IO.File]::WriteAllBytes('${file.replaceAll("'","''")}',[Convert]::FromBase64String('${Buffer.from(bytes).toString('base64')}'));$result=@{ok=$true}}catch{$result=@{ok=$false;message=$_.Exception.Message}};$result|ConvertTo-Json -Compress|Set-Content -LiteralPath '${output}' -Encoding UTF8`;
      const value=await ps(`$ErrorActionPreference='Stop';$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json;$a=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $payload.arguments -WorkingDirectory '${directory}';$p=New-ScheduledTaskPrincipal -UserId 'RAILGUNHAMSTER\\40608' -LogonType Interactive -RunLevel Limited;try{Register-ScheduledTask -TaskName '${name}' -Action $a -Principal $p|Out-Null;Start-ScheduledTask -TaskName '${name}';for($attempt=0;$attempt -lt 40;$attempt++){if(Test-Path -LiteralPath '${output}'){Get-Content -Raw -LiteralPath '${output}';exit 0};Start-Sleep -Milliseconds 500};throw 'Owned Windows write timed out'}finally{Stop-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction SilentlyContinue}`,JSON.stringify({arguments:'-NoProfile -WindowStyle Hidden -EncodedCommand '+Buffer.from(source,'utf16le').toString('base64')}));
      const result=JSON.parse(value);if(!result.ok)throw Error(result.message);
    };
    return {evaluate,writeNative,close,directory,hash:expected};
  }catch(error){await close();throw error;}
}
