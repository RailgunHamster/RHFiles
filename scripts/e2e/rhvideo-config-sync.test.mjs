import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {launchApp} from '../testing/app-session.mjs';import {listenBrowserLoopback} from '../testing/browser-loopback.mjs';
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const media=app=>app.evaluate("call('rhvideo_request',{action:'state',args:{}})");
test('RHVideo connection metadata synchronizes between actual app profiles without credentials, remote login or overwriting local account configuration',async()=>{
  let document=null,revision=0,writes=0;const server=http.createServer(async(req,res)=>{
    if(req.url!=='/sync/rhfiles-settings-v1.json')return res.writeHead(404).end();
    if(req.headers.authorization!=='Basic '+Buffer.from('sync-user:own-sync-password').toString('base64'))return res.writeHead(401).end();
    if(req.method==='GET')return document?res.writeHead(200,{ETag:`"r${revision}"`}).end(JSON.stringify(document)):res.writeHead(404).end();
    if(req.method!=='PUT')return res.writeHead(405).end();
    if(document?req.headers['if-match']!==`"r${revision}"`:req.headers['if-none-match']!=='*')return res.writeHead(412).end();
    let text='';for await(const chunk of req)text+=chunk;
    assert(!/password|token|private-sentinel|generation|cookie/i.test(text),'Only public media connection metadata is uploaded');document=JSON.parse(text);writes++;revision++;res.writeHead(204).end();
  });await listenBrowserLoopback(server);const apps=[];
  try{
    const a=await launchApp({desktopId:'media-sync-a',emulateFocus:true});apps.push(a);const b=await launchApp({desktopId:'media-sync-b',emulateFocus:true});apps.push(b);const configs=[];
    for(const app of apps){const profile=await app.evaluate("call('get_instance_profile',{})");assert(path.resolve(profile.dataDirectory).startsWith(path.resolve(app.directory)+path.sep));configs.push(path.join(profile.dataDirectory,'rhvideo-client.json'));await api(app,'configSync.save',{enabled:false,url:`http://127.0.0.1:${server.address().port}/sync/`,username:'sync-user',password:'own-sync-password',insecure:true});}
    fs.writeFileSync(configs[0],JSON.stringify({server:'https://media-a.invalid/',username:'alice'}));const privateFile=path.join(path.dirname(configs[0]),'rhvideo-private-sentinel.dpapi');fs.writeFileSync(privateFile,'do-not-export-private-token');
    await api(a,'configSync.run');assert.equal(document.schemaVersion,2);assert.deepEqual(document.rhvideo,{server:'https://media-a.invalid/',username:'alice'});
    await api(b,'configSync.run');let state=await media(b);assert.equal(state.server,'https://media-a.invalid/');assert.equal(state.username,'alice');assert.equal(state.connected,false);assert.equal(state.credentialsPersisted,false);assert(!fs.existsSync(configs[1]));
    const count=writes;for(let i=0;i<2;i++){await api(a,'configSync.run');await api(b,'configSync.run');}assert.equal(writes,count,'Applying remote metadata never bounces back to the previous local address');
    fs.writeFileSync(configs[1],JSON.stringify({server:'https://media-b.invalid/',username:'bob'}));await api(b,'configSync.run');await api(a,'configSync.run');state=await media(a);assert.equal(state.server,'https://media-b.invalid/');assert.equal(state.username,'bob');assert.equal(state.connected,false);assert.equal(JSON.parse(fs.readFileSync(configs[0])).server,'https://media-a.invalid/');assert.equal(fs.readFileSync(privateFile,'utf8'),'do-not-export-private-token');
    fs.writeFileSync(configs[0],JSON.stringify({server:'https://local-edit.invalid/',username:'mine'}));document.rhvideo={server:'https://cloud-edit.invalid/',username:'remote'};revision++;const before=writes;const result=await api(a,'configSync.run');assert.equal(result.state,'conflict');assert(result.conflicts.some(v=>v.kind==='rhvideo'));assert.equal(writes,before);assert.equal((await media(a)).server,'https://local-edit.invalid/');
    console.log('PASS: real native WebDAV v2 exchange, address/username prefill, no credential/session import, stable subsequent sync, preserved local media configuration and concurrent-edit conflict.');
  }finally{for(const app of apps)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
