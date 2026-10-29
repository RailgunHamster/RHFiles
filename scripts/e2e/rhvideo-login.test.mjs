// Real process/DPAPI/packaged UI, not a mocked localStorage login model.
import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
import{launchApp,until}from'../testing/app-session.mjs';import{cdpSession}from'../rhfiles-api.mjs';import{rhvideoFixture}from'../testing/rhvideo-fixture.mjs';import{realRhVideoService}from'../testing/rhvideo-real-service.mjs';
import{fileURLToPath}from'node:url';
const windows={skip:process.platform!=='win32'};
const realSource=process.env.RHVIDEO_SOURCE||path.resolve(fileURLToPath(new URL('../../..',import.meta.url)),'RHVideo');
async function library(app){
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const rows=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return rows.find(row=>new URL(row.url).pathname==='/rhvideo.html');},'native login library');
  const view=await cdpSession(target,30000);await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(v=>v.id==="rhvideo.connection.restore")'),'packaged restore API');
  const served=await view.evaluate('fetch("js/rhvideo-client.js").then(r=>r.text())');assert.equal(createHash('sha256').update(served).digest('hex'),createHash('sha256').update(fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url))).digest('hex'),'Run current embedded login code');
  return {view,invoke:(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')')};
}
const nativeState=app=>app.evaluate("call('rhvideo_request',{action:'state',args:{}})");
async function restored(app,lib){await until(async()=>{const value=await nativeState(app);return value.connected&&!value.restoring;},'native restored login',30000);return until(async()=>{const value=await lib.invoke('state');return value.connected&&!value.loading?value:null;},'actual restored library',30000);}
const logins=fixture=>fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/auth/login').length;

test('actual RHVideo login survives process restart, profile copies cannot sign in, and logout stays signed out',{skip:process.platform!=='win32'||!fs.existsSync(path.join(realSource,'app/main.py'))},async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rhvideo-login-native-')),profile=path.join(temp,'profile');let app,lib,fixture;
  try{
    const video=path.join(temp,'source.mp4');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=12','-t','1','-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p',video],{windowsHide:true,timeout:30000});fixture=await realRhVideoService({directory:path.join(temp,'actual-service'),video,source:realSource});
    app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.open');
    await assert.rejects(lib.invoke('account.register',{server:fixture.url,username:'x',password:'short'}),/用户名至少/);assert.match(await lib.view.evaluate('document.getElementById("connection-error").textContent'),/用户名至少/);
    assert.equal((await lib.invoke('account.register',{server:fixture.url,username:'registration-native',password:'fixture-only'})).registered,true);assert.equal((await nativeState(app)).connected,false);assert.equal(logins(fixture),0,'Registration cannot silently issue a login');assert.equal(await lib.view.evaluate('document.getElementById("connection-dialog").open'),true);assert.equal(await lib.view.evaluate('document.getElementById("connection-error").textContent'),'注册成功，请登录');
    await lib.invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});assert.equal((await nativeState(app)).credentialsPersisted,true);
    const dataDirectory=app.profile.dataDirectory,vault=path.join(dataDirectory,'rhvideo-login.dpapi'),encrypted=fs.readFileSync(vault);assert(!encrypted.includes(Buffer.from('fixture-only')));assert(!encrypted.includes(Buffer.from(fixture.url)));
    assert.equal((await lib.invoke('account.register',{server:fixture.url,username:'registration-secondary',password:'fixture-only'})).registered,true);await assert.rejects(lib.invoke('account.register',{server:fixture.url,username:'registration-secondary',password:'fixture-only'}),/HTTP 400/);assert.deepEqual(fs.readFileSync(vault),encrypted,'Neither successful nor failed registration can replace the active login');assert.equal((await nativeState(app)).username,'preview');assert.equal(logins(fixture),1);
    lib.view.close();await app.close();app=null;
    // A second real profile receives identical ciphertext, not a plaintext
    // fixture that could accidentally exercise a different login path.
    app=await launchApp({profileDirectory:path.join(temp,'other-profile')});fs.copyFileSync(vault,path.join(app.profile.dataDirectory,'rhvideo-login.dpapi'));lib=await library(app);await lib.invoke('connection.restore');assert.equal((await nativeState(app)).connected,false);assert((await nativeState(app)).loginWarning);assert.equal(logins(fixture),1);lib.view.close();await app.close();app=null;
    app=await launchApp({profileDirectory:profile});assert.equal(app.profile.dataDirectory,dataDirectory);lib=await library(app);assert.equal((await restored(app,lib)).username,'preview');assert.equal(logins(fixture),1,'Restart must validate the protected bearer, never replay password login');
    const pictures=await lib.invoke('category',{kind:'picture'});assert.equal(pictures.total,1);await until(()=>lib.view.evaluate('!!document.querySelector(".cover-button img")?.naturalWidth'),'restored real authenticated picture');
    const visibleActions=()=>lib.view.evaluate('[...document.querySelectorAll(".library-main > .wb-toolbar:not([hidden]) button:not([hidden])")].map(n=>n.textContent)');let controls=await visibleActions();assert(controls.includes('连续浏览'));assert(!controls.some(v=>v.includes('连播')));assert.equal(await lib.view.evaluate('document.querySelector(".wb-select").hidden'),true);
    await lib.invoke('selection.mode',{enabled:true});await lib.view.evaluate('document.querySelector(".cover-button").click()');assert.equal((await lib.invoke('workbench.diagnostics')).selected,1);assert.equal(await lib.view.evaluate('document.getElementById("image-dialog").open'),false,'Selecting a cover must not open a viewer');await lib.view.evaluate('document.querySelector(".card-title").click()');assert.equal((await lib.invoke('workbench.diagnostics')).selected,0);assert.equal(await lib.view.evaluate('document.getElementById("wb-selection").hidden'),false,'An empty active selection remains usable');await lib.invoke('selection.mode',{enabled:false});
    await lib.invoke('category',{kind:'novel'});controls=await visibleActions();assert(!controls.some(v=>/连播|放映|连续浏览/.test(v)));await lib.invoke('category',{kind:'video'});controls=await visibleActions();assert(controls.includes('按列表顺序连播'));assert(!controls.includes('连续浏览'));await lib.invoke('category',{kind:'picture'});
    const shot=await lib.view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'library-after-login-restore.png'),Buffer.from(shot.data,'base64'));
    const backup=await app.evaluate('collectAllLocalData()');assert(!JSON.stringify(backup).includes('rhvideo-login'));assert(!JSON.stringify(backup).includes('fixture-bearer'));assert(!JSON.stringify(backup).includes('fixture-only'));
    await lib.invoke('connection.logout');assert(!fs.existsSync(vault));lib.view.close();await app.close();app=null;
    app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.restore');assert.equal((await nativeState(app)).connected,false);assert.equal((await lib.invoke('state')).connected,false);assert.equal(logins(fixture),1);assert(!fixture.requests.some(r=>r.path.startsWith('/api/v1/trash/')));
  }finally{lib?.view.close();await app?.close();await fixture?.close();}
});
test('temporary validation failure retains one protected attempt; a later 401 revokes it across processes',windows,async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rhvideo-login-revoke-')),profile=path.join(temp,'profile'),authState={};const fixture=await rhvideoFixture({videoCount:0,pictureCount:0,authState});let app,lib;
  try{
    app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});const vault=path.join(app.profile.dataDirectory,'rhvideo-login.dpapi'),saved=fs.readFileSync(vault);lib.view.close();await app.close();app=null;
    authState.validationStatus=503;app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.restore');assert.equal((await nativeState(app)).connected,false);assert.deepEqual(fs.readFileSync(vault),saved,'Transient failure cannot forget or rewrite a saved login');assert.match((await nativeState(app)).loginWarning,/HTTP 503/);assert.equal(await lib.view.evaluate('!document.getElementById("notice").hidden'),true);const count=fixture.requests.length;await lib.invoke('connection.restore');assert.equal(fixture.requests.length,count,'No loop or repeated restore on a new API observation');
    delete authState.validationStatus;assert.equal((await lib.invoke('refresh')).connected,true,'An explicit ordinary refresh recovers the saved login without a password');assert.equal(logins(fixture),1);lib.view.close();await app.close();app=null;
    authState.active=false;app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.restore');assert.equal((await nativeState(app)).connected,false);assert(!fs.existsSync(vault));assert.match((await nativeState(app)).loginWarning,/失效/);lib.view.close();await app.close();app=null;
    app=await launchApp({profileDirectory:profile});lib=await library(app);const reads=fixture.requests.length;await lib.invoke('connection.restore');assert.equal((await nativeState(app)).connected,false);assert.equal(fixture.requests.length,reads);assert.equal(logins(fixture),1);
  }finally{lib?.view.close();await app?.close();await fixture.close();}
});
test('a late 401 from native restore cannot undo logout or revoke a newly connected server',windows,async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rhvideo-login-late-')),profile=path.join(temp,'profile'),authState={};const fixture=await rhvideoFixture({videoCount:0,pictureCount:0,authState}),other=await rhvideoFixture({videoCount:0,pictureCount:0});let app,lib,release;
  try{
    app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});lib.view.close();await app.close();app=null;
    let entered;const gate=new Promise(r=>entered=r),wait=new Promise(r=>release=r);authState.beforeIdentity=async()=>{entered();await wait;};
    app=await launchApp({profileDirectory:profile});lib=await library(app);let timer;try{await Promise.race([gate,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Actual saved identity request did not start')),10000))]);}finally{clearTimeout(timer);}
    await lib.invoke('connection.logout');assert.equal((await nativeState(app)).connected,false);await lib.invoke('connection.connect',{server:other.url,username:'preview',password:'fixture-only'});authState.validationStatus=401;release();
    // A direct native restore joins the process-owned restore lock. Merely
    // reading the new UI snapshot and killing the process could hide a late
    // persistence bug by stopping the old request before it returned.
    await app.evaluate("call('rhvideo_request',{action:'restore',args:{}})");
    const value=await lib.invoke('connection.restore');assert.equal(value.server,other.url+'/');assert.equal((await nativeState(app)).server,other.url+'/');lib.view.close();await app.close();app=null;
    app=await launchApp({profileDirectory:profile});lib=await library(app);assert.equal((await restored(app,lib)).server,other.url+'/');assert.equal(logins(other),1);
  }finally{release?.();lib?.view.close();await app?.close();await fixture.close();await other.close();}
});
test('a refreshed native bearer is protected and survives another process without reusing the old token',windows,async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rhvideo-login-refresh-')),profile=path.join(temp,'profile'),authState={expiresIn:61,refreshToken:'fixture-refreshed-native-only'};const fixture=await rhvideoFixture({videoCount:0,pictureCount:0,authState});let app,lib;
  try{
    app=await launchApp({profileDirectory:profile});lib=await library(app);await lib.invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await new Promise(resolve=>setTimeout(resolve,1500));await lib.invoke('refresh');assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/auth/refresh').length,1);assert.equal((await nativeState(app)).credentialsPersisted,true);lib.view.close();await app.close();app=null;
    app=await launchApp({profileDirectory:profile});lib=await library(app);await restored(app,lib);const identity=fixture.requests.filter(r=>r.path==='/api/v1/auth/me').at(-1);assert.equal(identity.authorization,'Bearer fixture-refreshed-native-only');assert.equal(logins(fixture),1);assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/auth/refresh').length,1);
    const vault=fs.readFileSync(path.join(app.profile.dataDirectory,'rhvideo-login.dpapi'));assert(!vault.includes(Buffer.from(authState.refreshToken)));assert(!JSON.stringify(await lib.invoke('state')).includes(authState.refreshToken));
  }finally{lib?.view.close();await app?.close();await fixture.close();}
});
