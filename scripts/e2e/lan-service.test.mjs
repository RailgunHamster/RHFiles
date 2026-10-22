import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import {once} from 'node:events';
import {launchApp,until} from '../testing/app-session.mjs';

test('desktop shared-folder UI and real HTTPS native/WebDAV service',async()=>{
  const app=await launchApp({emulateFocus:true}),directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-lan-fixture-'));
  const request=(status,credential,method,url,body='',headers={})=>new Promise((resolve,reject)=>{
    const r=https.request(new URL(url,`https://127.0.0.1:${status.port}`),{method,ca:status.certificatePem,
      headers:{Authorization:'Basic '+Buffer.from(credential.username+':'+credential.password).toString('base64'),...headers},timeout:10000},response=>{
      const bytes=[];response.on('data',b=>bytes.push(b));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(bytes).toString()}));
    });r.on('error',reject);r.on('timeout',()=>r.destroy(Error('HTTPS fixture timeout')));r.end(body);
  });
  try{
    fs.writeFileSync(path.join(directory,'中文.txt'),'0123456789');
    await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>app.evaluate("document.getElementById('lan-service-settings')?.textContent.includes('启动文件服务')"),'LAN settings loaded');
    const drives=await app.evaluate("call('lan_service_drives',{})");
    await app.evaluate("[...document.querySelectorAll('#lan-service-settings button')].find(b=>b.textContent==='改为全部本机磁盘').click()");
    await until(()=>app.evaluate(`(()=>{const values=[...document.querySelectorAll('#lan-service-settings input')].map(n=>n.value);return ${JSON.stringify(drives)}.every(d=>values.includes(d.path));})()`),'all local drive paths filled, not started');
    assert.equal((await app.evaluate("call('lan_service_state',{})")).status,null);
    await app.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1150,deviceScaleFactor:1,mobile:false});
    await app.screenshot('lan-shared-drives');
    await app.send('Emulation.clearDeviceMetricsOverride');
    await app.evaluate("lanService.mount(document.getElementById('lan-service-settings'))");
    // Exercise the actual form, not an alternative test-only service launcher.
    await app.evaluate(`(()=>{const inputs=document.querySelectorAll('#lan-service-settings input');inputs[0].value='Files';inputs[1].value=${JSON.stringify(directory)};inputs[2].value='0';[...document.querySelectorAll('#lan-service-settings button')].find(b=>b.textContent==='启动文件服务').click();})()`);
    const state=await until(async()=>{const value=await app.evaluate("call('lan_service_state',{})");return value.status?.running?value:null;},'HTTPS listener started');
    await until(()=>app.evaluate("document.getElementById('lan-service-settings')?.textContent.includes('生成手机配对码')"),'running settings loaded');
    const credential=await app.evaluate("call('lan_service_credential',{name:'E2E device',permissions:{write:true,delete:false}})");
    for(const endpoint of state.status.endpoints)assert.equal((await request(state.status,credential,'GET',endpoint+'/api/v1/capabilities')).status,200,endpoint);
    await app.evaluate("lanService.mount(document.getElementById('lan-service-settings'))");
    await app.evaluate(`(()=>{const host=document.getElementById('lan-service-settings'),box=[...host.querySelectorAll('h3')].find(n=>n.textContent==='E2E device').parentElement;box.querySelector('input').checked=false;[...box.querySelectorAll('button')].find(n=>n.textContent==='保存设备权限').click();})()`);
    await until(async()=>!(await app.evaluate("call('lan_service_state',{})")).status.devices[0].permissions.write,'saved device is read-only');
    assert.equal((await request(state.status,credential,'PUT','/dav/Files/blocked.txt','bad')).status,403);
    await app.evaluate(`(()=>{const box=[...document.querySelectorAll('#lan-service-settings h3')].find(n=>n.textContent==='E2E device').parentElement;box.querySelector('input').checked=true;[...box.querySelectorAll('button')].find(n=>n.textContent==='保存设备权限').click();})()`);
    await until(async()=>(await app.evaluate("call('lan_service_state',{})")).status.devices[0].permissions.write,'device write restored without pairing');
    const list=await request(state.status,credential,'GET','/api/v1/list?path=/Files');assert.equal(list.status,200);assert.equal(JSON.parse(list.body).entries[0].name,'中文.txt');
    const range=await request(state.status,credential,'GET','/api/v1/content?path='+encodeURIComponent('/Files/中文.txt'),'',{Range:'bytes=3-5'});assert.equal(range.status,206);assert.equal(range.body,'345');
    const dav=await request(state.status,credential,'PROPFIND','/dav/Files/','',{Depth:'1'});assert.equal(dav.status,207);
    const upload=await request(state.status,credential,'POST','/api/v1/uploads','',{'Tus-Resumable':'1.0.0','Upload-Length':'5','Upload-Metadata':'path '+Buffer.from('/Files/upload.txt').toString('base64')});assert.equal(upload.status,201);
    const patch=await request(state.status,credential,'PATCH',upload.headers.location,'hello',{'Tus-Resumable':'1.0.0','Upload-Offset':'0','Content-Type':'application/offset+octet-stream'});assert.equal(patch.status,204);assert.equal(fs.readFileSync(path.join(directory,'upload.txt'),'utf8'),'hello');
    await app.screenshot('lan-settings');
    await app.evaluate(`call('lan_service_revoke',{id:${JSON.stringify(credential.username)}})`);
    assert.equal((await request(state.status,credential,'GET','/api/v1/list')).status,401);
    await app.evaluate("call('lan_service_stop',{})");assert.equal((await app.evaluate("call('lan_service_state',{})")).status,null);
  }finally{await app.evaluate("call('lan_service_stop',{})").catch(()=>{});app.close();}
});

test('auto-start port conflict is visible without blocking file manager startup',async()=>{
  const desktopId='22345678-1234-5678-90ab-cdef12345678';
  let app=await launchApp({emulateFocus:true,desktopId});
  const profileRoot=app.profileRoot,fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-lan-conflict-'));
  const occupied=net.createServer();
  try{
    occupied.listen(0,'127.0.0.1');await once(occupied,'listening');const port=occupied.address().port;
    await new Promise(resolve=>occupied.close(resolve));
    await app.evaluate(`call('lan_service_start',{config:{port:${port},shares:[{name:'Files',path:${JSON.stringify(fixture)}}]}})`);
    await app.evaluate("call('lan_service_startup',{autoStart:true,login:false})");
    await app.evaluate("call('lan_service_stop',{})");app.close();
    await until(()=>new Promise((resolve,reject)=>{
      const failed=error=>{occupied.removeListener('listening',ready);reject(error);};
      const ready=()=>{occupied.removeListener('error',failed);resolve(true);};
      occupied.once('error',failed);occupied.once('listening',ready);occupied.listen(port,'127.0.0.1');
    }),'old process listener released',10000);
    app=await launchApp({emulateFocus:true,desktopId,profileDirectory:profileRoot});
    const failed=await until(async()=>{const state=await app.evaluate("call('lan_service_state',{})");return state.startupError?state:null;},'automatic startup failure reported');
    assert.match(failed.startupError,/bind_failed/);assert.equal(failed.status,null);
    await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
    await until(()=>app.evaluate("document.getElementById('lan-service-settings')?.textContent.includes('上次自动启动失败')"),'failure visible in settings');
    await new Promise(resolve=>occupied.close(resolve));
    await app.evaluate(`call('lan_service_start',{config:{port:${port},shares:[{name:'Files',path:${JSON.stringify(fixture)}}]}})`);
    assert.equal((await app.evaluate("call('lan_service_state',{})")).startupError,null);
    await app.evaluate("call('lan_service_startup',{autoStart:false,login:false})");
  }finally{if(occupied.listening)await new Promise(resolve=>occupied.close(resolve));await app.evaluate("call('lan_service_stop',{})").catch(()=>{});app.close();}
});

test('opt-in service survives process relaunch, login launch stays hidden and disable is persistent',async()=>{
  const desktopId='12345678-1234-5678-90ab-cdef12345678';
  let app=await launchApp({emulateFocus:true,desktopId});
  const profileRoot=app.profileRoot,fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-lan-startup-'));
  try{
    const initial=await app.evaluate("call('lan_service_state',{})");assert.equal(initial.config.autoStart,false);assert.equal(initial.startup.loginEnabled,false);
    await assert.rejects(app.evaluate("call('lan_service_startup',{autoStart:true,login:true})"),/Configure and start/);
    const status=await app.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(fixture)}}]}})`);
    await app.evaluate("call('lan_service_startup',{autoStart:true,login:true})");
    const saved=await app.evaluate("call('lan_service_state',{})");assert.equal(saved.config.autoStart,true);assert.equal(saved.startup.loginEnabled,true);
    app.close();
    app=await launchApp({emulateFocus:true,desktopId,profileDirectory:profileRoot,args:['--lan-service-startup='+desktopId]});
    const restored=await until(async()=>{const state=await app.evaluate("call('lan_service_state',{})");return state.status?.running?state:null;},'service automatically restored after relaunch');
    assert.equal(restored.status.fingerprint,status.fingerprint);assert.equal(restored.startup.loginEnabled,true);
    assert.equal(await app.evaluate('window.__TAURI__.window.getCurrentWindow().isVisible()'),false);
    await app.evaluate("call('lan_service_startup',{autoStart:false,login:false})");
    await app.evaluate("call('lan_service_stop',{})");app.close();
    app=await launchApp({emulateFocus:true,desktopId,profileDirectory:profileRoot});
    const disabled=await app.evaluate("call('lan_service_state',{})");assert.equal(disabled.config.autoStart,false);assert.equal(disabled.status,null);assert.equal(disabled.startup.loginEnabled,false);
    assert.equal(await app.evaluate('window.__TAURI__.window.getCurrentWindow().isVisible()'),true);
  }finally{await app.evaluate("call('lan_service_stop',{})").catch(()=>{});app.close();}
});
