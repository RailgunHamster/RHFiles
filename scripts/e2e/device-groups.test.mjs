import test from 'node:test';import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';
test('device-group UI and semantic APIs preserve local removal after relaunch',async()=>{
  let a=await launchApp({emulateFocus:true,desktopId:'group-ui-a'});const b=await launchApp({desktopId:'group-ui-b'});
  const call=(app,command,args={})=>app.evaluate(`call('device_groups',{command:${JSON.stringify(command)},args:${JSON.stringify(args)}})`);
  try{
    await a.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>a.evaluate("!!document.querySelector('.device-groups .dg-actions')"),'group controls');
    const machineName=process.env.COMPUTERNAME;
    assert.ok(machineName,'Windows computer name is available');
    assert.equal(await a.evaluate("[...document.querySelectorAll('.device-groups label')].find(n=>n.textContent==='设备名称').querySelector('input').value"),machineName);
    await a.evaluate("[...document.querySelectorAll('.device-groups button')].find(b=>b.textContent==='创建新设备组').click()");
    const state=await until(async()=>{const s=await call(a,'state');return s.groups.length?s:null;},'created from actual UI');const id=state.groups[0].id;
    assert.equal(state.defaultDeviceName,machineName);assert.equal(state.groups[0].members.find(m=>m.self).name,machineName);
    const request=await call(b,'request',{deviceName:'UI guest'});const approval=await call(a,'approve',{id,uri:request.uri,canInvite:false});await call(b,'join',{uri:approval.uri,confirmed:true});const peer=(await call(b,'state')).deviceId;
    await a.evaluate("lanService.mount(document.getElementById('lan-service-settings'))");
    await until(()=>a.evaluate("document.querySelector('.device-groups')?.textContent.includes('UI guest')"),'member displayed');
    await a.evaluate("[...document.querySelectorAll('.dg-member')].find(n=>n.textContent.includes('UI guest')).querySelector('button').click()");
    await until(()=>a.evaluate("!!document.querySelector('.app-confirm-overlay')"),'local removal confirmation');
    await a.evaluate("document.querySelector('.app-confirm-overlay button:last-of-type').click()");
    await until(async()=>(await call(a,'state')).groups[0].members.find(m=>m.id===peer).blocked,'persistent removal');
    await call(a,'join',{uri:await call(b,'export',{id}).then(v=>v.uri),confirmed:true});
    await assert.rejects(call(a,'restore',{id,peer,confirmed:false}));
    const profile=a.profileRoot;a.close();a=await launchApp({emulateFocus:true,desktopId:'group-ui-a',profileDirectory:profile});
    assert.equal((await call(a,'state')).groups[0].members.find(m=>m.id===peer).blocked,true);
    await a.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>a.evaluate("document.querySelector('.device-groups')?.textContent.includes('UI guest')"),'blocked member after relaunch');
    await a.evaluate("[...document.querySelectorAll('.dg-member')].find(n=>n.textContent.includes('UI guest')).querySelector('button').click()");
    await until(()=>a.evaluate("!!document.querySelector('.app-confirm-overlay')"),'manual restore confirmation');
    await a.evaluate("document.querySelector('.app-confirm-overlay button:last-of-type').click()");
    await until(async()=>!(await call(a,'state')).groups[0].members.find(m=>m.id===peer).blocked,'manual restore');
    await a.screenshot('device-groups-local-restore');
  }finally{a.close();b.close();}
});
