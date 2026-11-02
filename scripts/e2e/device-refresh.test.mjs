import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
const invoke=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
test('explicit sidebar refresh learns a later shared group device via an existing member without changing grants or undoing refusal',async()=>{
  const host=await launchApp({desktopId:'refresh-existing-host'}),client=await launchApp({desktopId:'refresh-client'}),later=await launchApp({desktopId:'refresh-later-host'});
  for(const app of [host,later])fs.mkdirSync(path.join(app.directory,'only-fixture-files'));
  try{
    await invoke(client,'navigation.open',{path:client.directory});
    const group=await invoke(host,'groups.create',{name:'RH refresh QA',deviceName:'Fixture WINSERVER'});
    async function join(app,name){const req=await invoke(app,'groups.request',{deviceName:name});const approval=await invoke(host,'groups.approve',{id:group,uri:req.uri});await invoke(app,'groups.join',{uri:approval.uri,confirmed:true});}
    await join(client,'Fixture client');
    await invoke(host,'server.start',{config:{port:0,shares:[{name:'Files',path:path.join(host.directory,'only-fixture-files')}]}});
    await invoke(client,'groups.join',{uri:(await invoke(host,'groups.export',{id:group})).uri,confirmed:true});
    const first=(await invoke(client,'devices.refresh')).devices[0];
    const port=(await invoke(host,'server.state')).status.port;
    assert.equal((await invoke(client,'groups.connect',{id:group,peer:first.peer,endpoint:'https://127.0.0.1:'+port})).outcome,'connected');
    const before=(await invoke(client,'groups.state')).groups[0];
    await join(later,'Fixture CLAW');
    await invoke(later,'groups.configure',{id:group,enabled:true,permissions:{write:true,delete:true}});
    assert.equal((await invoke(later,'groups.connect',{id:group,peer:first.peer,endpoint:'https://127.0.0.1:'+port})).outcome,'connected');
    assert.equal((await invoke(client,'devices.discover')).locations,1,'Permissions alone do not start or advertise a stopped file service');
    await invoke(later,'server.start',{config:{port:0,shares:[{name:'Files',path:path.join(later.directory,'only-fixture-files')}]}});
    await until(async()=>(await invoke(host,'groups.state')).groups[0].members.some(m=>m.name==='Fixture CLAW'&&m.server),'Starting sharing publishes signed service records to an online member without exporting group data',35000);
    assert.equal((await invoke(client,'devices.refresh')).devices.length,1,'Local cache reload intentionally does not gossip');
    await client.evaluate("document.getElementById('device-group-refresh').click();true");
    await until(async()=>(await invoke(client,'devices.list')).devices.length===2,'Real visible refresh discovers the later-started service',35000);
    await until(()=>client.evaluate("document.getElementById('device-group-refresh').getAttribute('aria-busy')==='false'"),'Refresh button completes');
    const status=await client.evaluate("document.getElementById('device-group-refresh-status').textContent");assert.match(status,/新发现 1 台|newly found 1/);
    const after=(await invoke(client,'groups.state')).groups[0];assert.equal(after.enabled,before.enabled);assert.deepEqual(after.permissions,before.permissions);
    const claw=(await invoke(client,'devices.list')).devices.find(d=>d.name==='Fixture CLAW');assert.ok(claw);
    await client.screenshot('device-refresh-learns-later-service');
    await invoke(client,'groups.remove',{id:group,peer:claw.peer});
    await invoke(client,'devices.discover');assert.equal((await invoke(client,'devices.list')).devices.length,1,'Signed exchange never clears a local removal');
    const removed=(await invoke(client,'groups.state')).groups[0].members.find(m=>m.id===claw.peer);assert.equal(removed.blocked,true);
    const reports=await invoke(client,'groups.diagnostics');assert(reports.some(r=>r.outcome==='connected'&&r.steps.some(s=>s.method==='session')));
    await client.screenshot('device-refresh-respects-local-removal');
  } finally {
    for(const app of [host,later])await invoke(app,'server.stop').catch(()=>{});
    await Promise.all([host.close(),client.close(),later.close()]);
  }
});
