// Explicit local acceptance only; all writes/processes stay in an owned fixture.
// Seed the older portable's manifest with the new binary to exercise the newly
// added transition, then let real Velopack download/apply the actual new package.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {launchApp,until,sleep} from './app-session.mjs';
import {root} from './source.mjs';
import {listenBrowserLoopback} from './browser-loopback.mjs';
if(process.platform!=='win32'||process.argv.length!==4)throw Error('Usage: node scripts/testing/update-transition-e2e.mjs OLDER-PORTABLE.zip NEW-RELEASE-DIRECTORY');
const previous=path.resolve(process.argv[2]),release=path.resolve(process.argv[3]);
const directory=fs.mkdtempSync(path.join(root,'test-artifacts','update transition 测试-'));
const installation=path.join(directory,'installation'),exe=path.join(installation,'current','RHFiles.exe');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const receipt={scope:'New helper code in an isolated older manifest; real Velopack apply of the final package, not the live installation',directory,previousSHA256:hash(previous)};
const extraction=spawnSync(path.join(root,'src-tauri/thirdparty/7z.exe'),['x','-y','-o'+installation,previous],{windowsHide:true,encoding:'utf8'});
if(extraction.status!==0)throw Error('Could not extract owned fixture');
fs.copyFileSync(path.join(root,'target/release/rhfiles.exe'),exe);
const expectedHash=hash(exe),feed=JSON.parse(fs.readFileSync(path.join(release,'releases.win.json')));
const version=feed.Assets.find(a=>a.Type==='Full').Version;
receipt.targetVersion=version;receipt.expectedMainSHA256=expectedHash;
process.env.RHFILES_TEST_EXECUTABLE=exe;
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1);
  if(!name||path.basename(name)!==name||!fs.existsSync(path.join(release,name))){res.writeHead(404).end();return;}
  const file=path.join(release,name);res.writeHead(200,{'Content-Length':fs.statSync(file).size});fs.createReadStream(file).pipe(res);
});
await listenBrowserLoopback(server);
const source='http://127.0.0.1:'+server.address().port+'/';
let app,socket;const profile=path.join(directory,'private profile');
const stopOwned=()=>{
  // Resolve exact absolute image paths, never kill a name shared with live apps.
  const paths=[exe,path.join(installation,'Update.exe')];
  if(fs.existsSync(profile)){
    const splash=path.join(profile,'local','RHFiles','update-splash');
    if(fs.existsSync(splash))for(const dir of fs.readdirSync(splash))if(dir.startsWith('session-'))paths.push(path.join(splash,dir,'RHFiles.UpdateSplash.exe'));
  }
  const expression='$targets=@('+paths.map(p=>"'"+p.replaceAll("'","''")+"'").join(',')+'); Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $targets -contains $_.ExecutablePath } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(expression,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:15000});
};
try{
  app=await launchApp({profileDirectory:profile});
  await app.evaluate("G.settings.autoUpdateEnabled=false;saveSettings();applyTheme('sand');true");
  const status=await app.evaluate("call('check_updates',{source:"+JSON.stringify(source)+"})");
  if(status.availableVersion!==version)throw Error('Fixture did not detect the final new package');
  receipt.startVersion=status.currentVersion;
  await app.evaluate("call('download_update',{source:"+JSON.stringify(source)+"})");
  const updaterFile=path.join(installation,'Update.exe'),savedUpdater=fs.readFileSync(updaterFile);
  try {
    // Fault injection is limited to the disposable installation. A failed
    // installer spawn must close the helper and release update admission.
    fs.writeFileSync(updaterFile,'synthetic invalid executable');
    const failure=await app.evaluate("call('apply_update',{source:"+JSON.stringify(source)+",appearance:updateTransitionAppearance()}).then(()=>null,e=>String(e))");
    if(!failure)throw Error('Invalid updater unexpectedly succeeded');
    const splash=path.join(profile,'local','RHFiles','update-splash');
    if(fs.readdirSync(splash).some(p=>p.startsWith('session-')))throw Error('Failed apply left an orphan helper session');
    receipt.spawnFailureCleaned=true;
  }finally{fs.writeFileSync(updaterFile,savedUpdater);}
  // Do not await a promise on the WebView that is intentionally being destroyed.
  await app.evaluate("window.__applyReceipt={requested:true};call('apply_update',{source:"+JSON.stringify(source)+",appearance:updateTransitionAppearance()}).catch(e=>window.__applyReceipt.error=String(e));true");
  const splashBase=path.join(profile,'local','RHFiles','update-splash');
  const session=await until(()=>{
    if(!fs.existsSync(splashBase))return false;
    return fs.readdirSync(splashBase).map(p=>path.join(splashBase,p)).find(p=>fs.existsSync(path.join(p,'ready')));
  },'actual embedded helper ready',10000);
  receipt.ready=true;
  receipt.helperSHA256=hash(path.join(session,'RHFiles.UpdateSplash.exe'));
  await Promise.race([app.closed,sleep(60000).then(()=>{throw Error('Original isolated application did not exit for update');})]);
  const target=await until(async()=>{
    const response=await fetch(`http://127.0.0.1:${app.port}/json/list`,{signal:AbortSignal.timeout(1000)});
    return (await response.json()).find(p=>p.type==='page'&&/\/(index\.html)?$/.test(new URL(p.url).pathname));
  },'restarted application CDP',150000);
  socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open');
  let id=0;const pending=new Map();
  socket.addEventListener('message',e=>{const value=JSON.parse(e.data),done=pending.get(value.id);if(done){pending.delete(value.id);done(value);}});
  const evaluate=async expression=>{
    const n=++id;
    const result=await Promise.race([new Promise(resolve=>{pending.set(n,resolve);socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));}),sleep(10000).then(()=>{throw Error('Restarted UI response timeout');})]);
    if(result.error||result.result.exceptionDetails)throw Error(JSON.stringify(result));return result.result.result.value;
  };
  await until(()=>evaluate('typeof G!=="undefined"&&G.startupReady===true'),'new production UI ready',45000);
  const after=await evaluate("call('check_updates',{source:"+JSON.stringify(source)+"})");
  if(after.currentVersion!==version||after.pendingRestart)throw Error('Actual update did not commit the target manifest');
  if(hash(exe)!==expectedHash)throw Error('Applied main binary differs from final build');
  const theme=await evaluate('G.theme');if(theme!=='sand')throw Error('Theme configuration was lost');
  const failures=await evaluate("call('get_last_update_failure')");
  if(failures)throw Error('Update diagnostics reported failure: '+JSON.stringify(failures));
  // Helper must hand off, not merely expire its timeout.
  await until(()=>{
    const probe=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$f='"+path.join(session,'RHFiles.UpdateSplash.exe').replaceAll("'","''")+"'; @(Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq $f).Count"],{windowsHide:true,encoding:'utf8',timeout:15000});
    return probe.status===0&&probe.stdout.trim()==='0';
  },'helper closes after real new window',15000);
  Object.assign(receipt,{appliedVersion:after.currentVersion,configurationPreserved:true,helperHandedOff:true,passed:true});
  console.log(JSON.stringify(receipt,null,2));
}finally{
  socket?.close();await app?.close();stopOwned();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2));
}
