// Real Tauri readiness + actual device-service traffic. No updater handoff or
// user profile is used; protocol.rs separately tests atomic server reservation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('update readiness observes a real server download, its quiet period and legacy SFTP work',{
  skip:process.platform!=='win32'||process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:120000,
},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-update-idle-'));
  let server,client,reader,controller;
  const file=fs.openSync(path.join(directory,'owned.bin'),'wx');fs.ftruncateSync(file,64*1024*1024);fs.closeSync(file);
  try{
    server=await launchApp({desktopId:'update-idle-server'});client=await launchApp({desktopId:'update-idle-client'});
    const command=(app,name,args={})=>app.evaluate(`call(${JSON.stringify(name)},${JSON.stringify(args)})`);
    const readiness=automatic=>command(server,'get_update_readiness',{automatic});
    assert.equal((await readiness(true)).ready,true);
    const service=await command(server,'lan_service_start',{config:{port:0,shares:[{name:'Files',path:directory}]}});
    const group=await command(server,'device_groups',{command:'create',args:{name:'Owned update idle QA',deviceName:'Idle QA server'}});
    await command(server,'device_groups',{command:'configure',args:{id:group,enabled:true,permissions:{write:false,delete:false}}});
    const peer=(await command(server,'device_groups',{command:'state',args:{}})).deviceId;
    const request=await command(client,'device_groups',{command:'request',args:{deviceName:'Idle QA client'}});
    const approval=await command(server,'device_groups',{command:'approve',args:{id:group,uri:request.uri,canInvite:false}});
    await command(client,'device_groups',{command:'join',args:{uri:approval.uri,confirmed:true}});
    const connected=await command(client,'device_groups',{command:'connect',args:{id:group,peer,endpoint:'https://127.0.0.1:'+service.port}});
    assert.equal(connected.outcome,'connected');
    const source='rhfiles-device://'+group+'/'+peer+'/Files/owned.bin';
    const resource=await command(client,'device_fs',{action:'resource',args:{path:source}});
    controller=new AbortController();const response=await fetch(resource.url,{signal:controller.signal});assert(response.ok);
    reader=response.body.getReader();assert((await reader.read()).value.byteLength>0);
    const busy=await until(async()=>{const state=await readiness(true);return state.activeServerRequests>0&&state;},'native update readiness sees the streamed server body');
    assert.equal(busy.ready,false);assert(busy.reasons.includes('server_requests'));assert.equal(busy.activeFileTasks,0);
    controller.abort();await reader.cancel().catch(()=>{});reader=null;
    const quiet=await until(async()=>{const state=await readiness(true);return state.activeServerRequests===0&&state;},'native update activity releases on client disconnect');
    assert.equal(quiet.ready,false);assert(quiet.reasons.includes('quiet_period'));assert(quiet.retryAfterMs>0&&quiet.retryAfterMs<=30000);
    assert.equal((await readiness(false)).ready,true,'manual install still refuses active work, but has no automatic quiet-period delay');
    const exposed=await server.evaluate("RHFilesAPI.invoke('updates.readiness')");assert.equal(exposed.ready,false);assert(exposed.reasons.includes('quiet_period'));
    // A failed legacy command must release its operation guard, while still
    // establishing a quiet period in the client that attempted the transfer.
    await assert.rejects(()=>command(client,'sftp_download',{host:'127.0.0.1',port:1,remotePath:'/owned.bin',localPath:path.join(directory,'must-not-exist.bin'),user:'fixture',pass:'fixture'}));
    const local=await command(client,'get_update_readiness',{automatic:true});assert.equal(local.activeFileTasks,0);assert.equal(local.ready,false);assert(local.reasons.includes('quiet_period'));
    assert.equal((await command(client,'get_update_readiness',{automatic:false})).ready,true);assert(!fs.existsSync(path.join(directory,'must-not-exist.bin')));
    fs.writeFileSync(path.join(server.artifactDir,'update-readiness.json'),JSON.stringify({pass:true,busy,quiet,local},null,2));
    console.log('PASS real file-server update readiness: '+server.artifactDir);
  }finally{
    controller?.abort();await reader?.cancel().catch(()=>{});
    if(server){await server.evaluate("call('lan_service_stop',{})").catch(()=>{});await server.close();}if(client)await client.close();
    assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('rhfiles-update-idle-'));fs.rmSync(directory,{recursive:true,force:true});
  }
});
