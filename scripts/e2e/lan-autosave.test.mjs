import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('LAN switches save with real clicks and survive refresh, listener restart and process relaunch',async()=>{
  const desktopId='32345678-1234-5678-90ab-cdef12345678';
  let app=await launchApp({emulateFocus:true,desktopId});
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-autosave-'));
  const state=()=>app.evaluate("call('lan_service_state',{})");
  const open=async()=>{
    await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>app.evaluate("!!document.querySelector('[data-setting=\"lan.startup.autoStart\"]')"),'autosave controls');
    assert.equal(await app.evaluate("[...document.querySelectorAll('#lan-service-settings button')].some(b=>/保存.*(权限|自动启动)/.test(b.textContent))"),false);
  };
  const toggle=async(name)=>{
    const selector=`[data-setting=${JSON.stringify(name)}]`;
    await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});true`);
    await app.click(selector);
    await app.evaluate("settingsAutoSave.flush(document.getElementById('lan-service-settings'))");
  };
  try{
    await app.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(fixture)}}]}})`);await open();
    await toggle('lan.startup.login');let model=await state();assert.equal(model.config.autoStart,true);assert.equal(model.startup.loginEnabled,true);
    const group=await app.evaluate("call('device_groups',{command:'create',args:{name:'Autosave group',deviceName:'Fixture'}})");
    await app.evaluate("lanService.mount(document.getElementById('lan-service-settings'))");
    await toggle('groups.configure.'+group+'.write');await toggle('groups.configure.'+group+'.delete');
    assert.deepEqual((await app.evaluate("call('device_groups',{command:'state',args:{}})")).groups[0].permissions,{write:true,delete:true});
    await app.screenshot('lan-autosave-settings');
    // New defaults remain independent of existing per-device grants.
    await app.evaluate("call('lan_service_stop',{})");
    await app.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(fixture)}}]}})`);
    const profile=app.profileRoot;app.close();app=await launchApp({emulateFocus:true,desktopId,profileDirectory:profile});
    model=await until(async()=>{const value=await state();return value.status?.running?value:null;},'auto-restored listener');
    assert.equal((await app.evaluate("call('device_groups',{command:'state',args:{}})")).groups[0].permissions.delete,true);
    await open();
    await toggle('lan.startup.autoStart');model=await state();assert.equal(model.config.autoStart,false);assert.equal(model.startup.loginEnabled,false);
  }finally{await app.evaluate("(async()=>{await call('lan_service_startup',{autoStart:false,login:false});await call('lan_service_stop',{});})()").catch(()=>{});app.close();}
});

test('autosave failure restores the linked startup controls and shows the reason',async()=>{
  const app=await launchApp({emulateFocus:true});
  try{
    await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>app.evaluate("!!document.querySelector('[data-setting=\"lan.startup.login\"]')"),'startup form');
    await app.evaluate("document.querySelector('[data-setting=\"lan.startup.login\"]').scrollIntoView({block:'center'});true");
    await app.click('[data-setting="lan.startup.login"]');
    await app.evaluate("settingsAutoSave.flush(document.getElementById('lan-service-settings'))");
    assert.equal(await app.evaluate("document.querySelector('[data-setting=\"lan.startup.autoStart\"]').checked"),false);
    assert.equal(await app.evaluate("document.querySelector('[data-setting=\"lan.startup.login\"]').checked"),false);
    assert.match(await app.evaluate("document.getElementById('lan-service-settings').textContent"),/保存失败.*请先添加共享/);
    const model=await app.evaluate("call('lan_service_state',{})");assert.equal(model.config.autoStart,false);assert.equal(model.startup.loginEnabled,false);
  }finally{app.close();}
});
