import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import https from 'node:https';import net from 'node:net';import {spawn} from 'node:child_process';
import {launchApp,until} from '../testing/app-session.mjs';
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const freePort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
function request(gateway,method,resource,credentials,body=''){
  return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',servername:gateway.domain,port:gateway.port,path:resource,method,headers:{...(credentials?{Authorization:'Basic '+Buffer.from(credentials.username+':'+credentials.password).toString('base64')}:{ }),...(method==='PROPFIND'?{Depth:'1'}:{}),'Content-Length':Buffer.byteLength(body)}},res=>{let text='';res.setEncoding('utf8');res.on('data',part=>{text+=part});res.on('end',()=>resolve({status:res.statusCode,text}));});req.setTimeout(10000,()=>req.destroy(Error('DAV timeout')));req.on('error',reject);req.end(body);});
}
async function actualWindowsRedirector(gateway,credentials){
  // Credentials travel over SSH stdin, not argv, a command log or a file.
  const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class RhFilesDavQa {
[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Resource {public int scope,type,display,usage;public string local,remote,comment,provider;}
[DllImport("mpr.dll",CharSet=CharSet.Unicode)] public static extern int WNetAddConnection2W(ref Resource resource,string password,string username,int flags);
[DllImport("mpr.dll",CharSet=CharSet.Unicode)] public static extern int WNetCancelConnection2W(string name,int flags,bool force);
}
'@
$resource=New-Object RhFilesDavQa+Resource;$resource.type=1;$resource.remote=$payload.unc
$code=[RhFilesDavQa]::WNetAddConnection2W([ref]$resource,$payload.password,$payload.username,0)
if($code -ne 0){[pscustomobject]@{connected=$false;code=$code}|ConvertTo-Json -Compress;exit 1}
try{$content=[IO.File]::ReadAllText(($payload.unc+'\\Files\\'+[char]0x4e2d+[char]0x6587+'.txt'));[pscustomobject]@{connected=$true;content=$content}|ConvertTo-Json -Compress}finally{[void][RhFilesDavQa]::WNetCancelConnection2W($payload.unc,0,$false)}`;
  const encoded=Buffer.from(script,'utf16le').toString('base64');
  const result=await new Promise((resolve,reject)=>{const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5','-l','40608','railgunhamster','powershell','-NoProfile','-EncodedCommand',encoded],{windowsHide:true});let out='',err='';child.stdout.on('data',p=>out+=p);child.stderr.on('data',p=>err+=p);child.on('error',reject);const timer=setTimeout(()=>{child.kill();reject(Error('Windows redirector QA timed out'));},45000);child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error('Windows redirector failed: '+out+' '+err.slice(0,2048)));else resolve(JSON.parse(out.trim()));});child.stdin.end(JSON.stringify({unc:gateway.unc,username:credentials.username,password:credentials.password}));});
  assert.equal(result.connected,true);assert.equal(result.content,'original');console.log('PASS: actual RAILGUNHAMSTER Windows WebClient/UNC file read with system CA validation; no registry/trust changes, temporary connection removed.');
}
test('trusted HTTPS DAV supports Windows-style Basic auth, real file operations and group removal/restart revocation', {skip:process.env.RHFILES_TEST_REAL_TAILSCALE_TLS!=='1'},async()=>{
  const app=await launchApp({desktopId:'trusted-webdav-qa',emulateFocus:true});const files=path.join(app.directory,'owned-share');fs.mkdirSync(files);fs.writeFileSync(path.join(files,'中文.txt'),'original');
  try{
    const group=await api(app,'groups.create',{name:'Owned DAV QA',deviceName:'TLS host',permissions:{write:true,delete:true}});const state=await api(app,'groups.state');const peer=state.deviceId;
    await api(app,'server.start',{config:{port:0,shares:[{name:'Files',path:files}]}});
    const gateway=await api(app,'server.webdavConfigure',{enabled:true,confirmed:true,port:await freePort()});
    await api(app,'settings.open',{section:'lan'});await until(()=>app.evaluate("document.getElementById('lan-service-settings')?.textContent.includes('39129')||document.getElementById('lan-service-settings')?.textContent.includes('https://winserver.')"),'actual compatibility settings');
    await app.screenshot('trusted-webdav-settings');await app.evaluate('closeSettings();true');
    assert.equal((await request(gateway,'PROPFIND','/dav/')).status,401);
    const credentials=await api(app,'server.webdavCredentials',{group,peer});
    assert.equal((await request(gateway,'PROPFIND','/dav/',credentials)).status,207);
    assert.equal((await request(gateway,'GET','/api/v1/groups/state',credentials)).status,404);
    assert.equal((await request(gateway,'GET','/dav/Files/'+encodeURIComponent('中文.txt'),credentials)).text,'original');
    if(process.env.RHFILES_WEBDAV_REDIRECTOR_QA==='1')await actualWindowsRedirector(gateway,credentials);
    assert([200,201,204].includes((await request(gateway,'PUT','/dav/Files/new.txt',credentials,'owned upload')).status));
    assert.equal(fs.readFileSync(path.join(files,'new.txt'),'utf8'),'owned upload');assert([200,204].includes((await request(gateway,'DELETE','/dav/Files/new.txt',credentials)).status));assert(!fs.existsSync(path.join(files,'new.txt')));
    await api(app,'server.stop');await api(app,'server.start',{config:{port:0,shares:[{name:'Files',path:files}]}});const restored=(await api(app,'server.state')).status.webdavCompatibility;
    assert.equal((await request(restored,'GET','/dav/Files/'+encodeURIComponent('中文.txt'),credentials)).status,200);
    await api(app,'groups.remove',{id:group,peer});assert([400,401,403].includes((await request(restored,'GET','/dav/Files/'+encodeURIComponent('中文.txt'),credentials)).status));
    await api(app,'groups.restore',{id:group,peer,confirmed:true});assert.equal((await request(restored,'GET','/dav/Files/'+encodeURIComponent('中文.txt'),credentials)).status,401);
    const fresh=await api(app,'server.webdavCredentials',{group,peer});assert.equal((await request(restored,'PROPFIND','/dav/',fresh)).status,207);
    await api(app,'server.webdavRevoke',{group,peer});assert.equal((await request(restored,'PROPFIND','/dav/',fresh)).status,401);
    await api(app,'server.webdavConfigure',{enabled:false});await assert.rejects(request(restored,'GET','/dav/',fresh));
    console.log('PASS: CA-trusted Tailscale TLS (no trust bypass), Basic DAV list/read/write/delete, service restart, group-remove/restore and explicit-revocation checks; synthetic share only. Artifacts: '+app.artifactDir);
  }finally{try{await api(app,'server.stop')}catch{}await app.close();}
});
