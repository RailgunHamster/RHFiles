import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {launchApp,until}from '../testing/app-session.mjs';import {listenBrowserLoopback}from '../testing/browser-loopback.mjs';import {root}from '../testing/source.mjs';

test('the shared Windows/Android contract imports every network favorite and round-trips edits/deletions without changing its protocol or leaking passwords',async()=>{
  let doc=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/shared-config.contract.json'),'utf8')),revision=1,writes=0;
  const server=http.createServer(async(req,res)=>{
    assert.equal(req.url,'/shared/rhfiles-settings-v1.json');
    if(req.method==='GET')return res.writeHead(200,{ETag:`"r${revision}"`}).end(JSON.stringify(doc));
    assert.equal(req.method,'PUT');assert.equal(req.headers['if-match'],`"r${revision}"`);
    let body='';for await(const chunk of req)body+=chunk;
    assert(!/password|token|fingerprint|needsPassword/i.test(body));doc=JSON.parse(body);revision++;writes++;res.writeHead(204).end();
  });await listenBrowserLoopback(server);let app;
  try{
    app=await launchApp({desktopId:'shared-config-contract',emulateFocus:true});
    const api=(action,args={})=>app.evaluate(`RHFilesAPI.invoke(${JSON.stringify(action)},${JSON.stringify(args)})`);
    // The folder URL intentionally has no slash: it must resolve to the same
    // fixed file as Android, not an app-specific PC document or sibling file.
    await api('configSync.save',{enabled:false,url:`http://127.0.0.1:${server.address().port}/shared`,username:'',password:'',insecure:true});
    await api('configSync.run');let pins=await api('favorites.list');
    assert.deepEqual(pins.map(p=>p.name),doc.favorites.map(f=>f.label));
    assert.equal(pins[0].path,doc.favorites[0].path);assert.equal(pins[1].path,'\\\\nas.example.invalid\\Public\\照片');
    await until(()=>app.evaluate('document.querySelectorAll("#network-locations-list > button").length===5'),'all imported protocols visible in sidebar');
    const profiles=(await api('networkLocations.list')).profiles;assert.deepEqual(profiles.map(p=>p.config.type),['smb','webdav','ftp','ftps','sftp']);assert(profiles.every(p=>!p.hasPassword));
    await api('configSync.run');assert.equal(writes,0,'Importing and materializing a bookmark is not an edit or deletion');
    const target=pins[0].path;await api('favorites.rename',{path:target,name:'PC 改名: 保持路径'});await api('configSync.run');assert.equal(doc.favorites[0].label,'PC 改名: 保持路径');
    // Exercise actual sidebar removal through its normal stored-pins boundary;
    // neither the remaining SFTP record nor its bookmark may be swept away.
    pins=await api('favorites.list');await app.evaluate(`call('db_save_pinned',{paths:${JSON.stringify(pins.filter(p=>p.path!==target).map(p=>[p.path,p.name]))}}).then(()=>loadPinnedFolders())`);
    await api('configSync.run');assert(!doc.favorites.some(f=>f.path===target));assert.equal(doc.profiles.length,5);assert.equal(doc.favorites.length,2);
    doc.favorites.reverse();revision++;await api('configSync.run');assert.deepEqual((await api('favorites.list')).map(p=>p.name),doc.favorites.map(f=>f.label));
    await app.screenshot('shared-config-cross-platform');
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('ordinary Windows WebDAV sync interoperates with Android schema, preserves names/order/local paths and rejects unsafe races',async()=>{
  const id='11111111-1111-4111-8111-111111111111';let revision=1,writes=0,mode='normal',requests=0;
  let doc={schemaVersion:1,profiles:[{id,config:{type:'smb',name:'Synthetic cloud',host:'qa-cloud.invalid',share:'Public',username:'qa-cloud'}}],favorites:['Z','A','M'].map(name=>({name,path:`remote://${id}/${name}`,isDir:true,label:name==='Z'?'云端别名':name}))};
  const server=http.createServer(async(req,res)=>{
    requests++;if(req.url!=='/sync/rhfiles-settings-v1.json')return res.writeHead(404).end();
    if(req.headers.authorization!=='Basic '+Buffer.from('sync-user:synthetic-sync-password').toString('base64'))return res.writeHead(401).end();
    if(mode==='auth')return res.writeHead(401).end();
    if(mode==='redirect')return res.writeHead(302,{Location:'http://should-not-connect.invalid/leak'}).end();
    if(req.method==='GET')return res.writeHead(200,{'Content-Type':'application/json',ETag:(mode==='weak'?'W/':'')+`"qa-${revision}"`}).end(JSON.stringify(doc));
    if(req.method!=='PUT')return res.writeHead(405).end();
    if(mode==='race'){revision++;return res.writeHead(412).end();}
    if(req.headers['if-match']!==`"qa-${revision}"`)return res.writeHead(412).end();
    let text='';for await(const chunk of req){text+=chunk;if(text.length>1024*1024)return res.writeHead(413).end();}
    assert(!/"password"\s*:|synthetic-sync-password|rhfiles-device|rhfiles\.theme/.test(text),'No secrets, local settings or device group information in cloud writes');
    doc=JSON.parse(text);revision++;writes++;res.writeHead(204,{ETag:`"qa-${revision}"`}).end();
  });
  await listenBrowserLoopback(server);let app;
  try{
    app=await launchApp({desktopId:'windows-webdav-config',emulateFocus:true});
    const api=(action,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(action)+','+JSON.stringify(args)+')');
    const local=path.join(app.directory,'local-only-folder');fs.mkdirSync(local);
    await app.evaluate("call('db_save_pinned',"+JSON.stringify({paths:[[local,'Local only'],['\\\\qa-local.invalid\\Public\\本机','本机网络收藏']]})+").then(()=>loadPinnedFolders())");
    await api('configSync.save',{enabled:false,url:`http://127.0.0.1:${server.address().port}/sync/`,username:'sync-user',password:'synthetic-sync-password',insecure:true});
    assert.equal((await api('configSync.status')).config.hasPassword,true);assert.equal((await api('configSync.status')).config.password,undefined);
    assert.equal((await api('configSync.run')).state,'success');assert(writes>=1);
    let pins=await api('favorites.list');assert.equal(pins[0].path,local);assert.equal(pins[0].name,'Local only');assert.deepEqual(pins.filter(p=>p.path.startsWith('\\\\qa-cloud.invalid')).map(p=>p.name),['云端别名','A','M']);
    const cloudPath='\\\\qa-cloud.invalid\\Public\\Z';await api('favorites.rename',{path:cloudPath,name:'我的自定义名称'});assert.equal((await api('favorites.list')).find(p=>p.path===cloudPath).name,'我的自定义名称');assert(fs.existsSync(local));
    await api('configSync.run');assert.equal(doc.favorites.find(f=>f.path===`remote://${id}/Z`).label,'我的自定义名称');
    doc.favorites.reverse();revision++;await api('configSync.run');pins=await api('favorites.list');assert.deepEqual(pins.filter(p=>p.path.startsWith('\\\\qa-cloud.invalid')).map(p=>p.path.split('\\').at(-1)),doc.favorites.filter(f=>new URL(f.path).host===id).map(f=>f.name));assert.equal(pins[0].path,local);
    await api('favorites.rename',{path:cloudPath,name:'本机冲突'});doc.favorites.find(f=>f.path===`remote://${id}/Z`).label='云端冲突';revision++;const previousWrites=writes;
    const conflict=await api('configSync.run');assert.equal(conflict.state,'conflict');assert.equal(writes,previousWrites);assert.equal((await api('favorites.list')).find(p=>p.path===cloudPath).name,'本机冲突');
    await api('settings.open',{section:'sync'});await app.screenshot('windows-webdav-config-conflict');
    await app.evaluate("window.__syncResolution={state:'running'};RHFilesAPI.invoke('configSync.resolve',{choice:'remote'}).then(value=>window.__syncResolution={state:'done',value}).catch(error=>window.__syncResolution={state:'failed',error:String(error)});true");
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay .dialog-btn.primary')"),'sync conflict confirmation');await app.click('.app-confirm-overlay .dialog-btn.primary');
    await until(()=>app.evaluate("window.__syncResolution.state==='done'"),'sync conflict committed');assert.equal((await api('favorites.list')).find(p=>p.path===cloudPath).name,'云端冲突');
    await api('favorites.rename',{path:cloudPath,name:'竞态前的新名称'});mode='race';const before=await api('favorites.list'),beforeRequests=requests;
    await assert.rejects(api('configSync.run'),/其他设备|412|覆盖/);assert.deepEqual(await api('favorites.list'),before);assert.equal(requests-beforeRequests,2,'GET and one conditional PUT only; no automatic write replay');
    mode='weak';await assert.rejects(api('configSync.run'),/强 ETag/);assert.deepEqual(await api('favorites.list'),before);
    mode='auth';await assert.rejects(api('configSync.run'),/401/);assert.deepEqual(await api('favorites.list'),before);
    mode='redirect';await assert.rejects(api('configSync.run'),/重定向|redirect/i);assert.deepEqual(await api('favorites.list'),before);
    mode='normal';await api('configSync.run');await app.screenshot('windows-webdav-config-sync');
    const disabledRequests=requests;const skipped=await app.evaluate("call('config_sync_preview',{manual:false,proxy:null})");assert.equal(skipped.skipped,true);assert.equal(requests,disabledRequests,'disabled automatic sync does not contact WebDAV');
    console.log('PASS: owned synthetic WebDAV GET/PUT, secret-free Android schema, native DPAPI credentials, labels/order/local favorites, confirmed conflicts, ETag/401/redirect protection; artifacts: '+app.artifactDir);
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
