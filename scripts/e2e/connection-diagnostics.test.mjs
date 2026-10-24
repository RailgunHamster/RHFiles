import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
test('real Windows group connection, read-only diagnostic UI and remote revocation',async()=>{
  const a=await launchApp({desktopId:'connection-host'}),b=await launchApp({emulateFocus:true,desktopId:'connection-client'});
  const group=(app,command,args={})=>app.evaluate(`call('device_groups',{command:${JSON.stringify(command)},args:${JSON.stringify(args)}})`);
  try{
    const share=path.join(a.directory,'shared');fs.mkdirSync(share);fs.writeFileSync(path.join(share,'hello.txt'),'private fixture');
    const status=await a.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(share)}}]}})`);
    const id=await group(a,'create',{name:'连接恢复 QA',deviceName:'Windows Host'}),peer=(await group(a,'state')).deviceId;
    const request=await group(b,'request',{deviceName:'Windows Client'});const approval=await group(a,'approve',{id,uri:request.uri});await group(b,'join',{uri:approval.uri,confirmed:true});
    const report=await group(b,'connect',{id,peer,endpoint:'https://127.0.0.1:'+status.port});assert.equal(report.outcome,'connected');assert.equal(report.certainty,'confirmed');
    assert.ok(report.steps.some(s=>s.method==='capabilities'&&s.outcome==='succeeded'));assert.ok(report.steps.some(s=>s.method==='mdns'&&s.code==='already_connected'));
    await b.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>b.evaluate("!!document.querySelector('.dg-diagnostics')"),'diagnostic details');
    await b.evaluate("document.querySelector('.dg-diagnostics').open=true;document.querySelector('.dg-diagnostics').scrollIntoView();true");
    await until(()=>b.evaluate("document.querySelector('.dg-diagnostics').textContent.includes('身份已验证')"),'real report rendered');
    const before=(await group(b,'diagnostics')).length;
    await b.evaluate("[...document.querySelectorAll('.dg-diagnostics button')].find(n=>n.textContent==='刷新记录（不重试）').click();true");
    assert.equal((await group(b,'diagnostics')).length,before,'Viewing/refreshing reports never starts a probe');
    await b.screenshot('connection-diagnostics');
    const client=(await group(b,'state')).deviceId;await group(a,'remove',{id,peer:client});
    const denied=await group(b,'connect',{id,peer,endpoint:'https://127.0.0.1:'+status.port});assert.equal(denied.outcome,'authorization_rejected');assert.ok(!denied.steps.some(s=>s.method==='mdns'));
  }finally{await a.evaluate("call('lan_service_stop',{})").catch(()=>{});a.close();b.close();}
});
