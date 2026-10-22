import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
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
    // Exercise the actual form, not an alternative test-only service launcher.
    await app.evaluate(`(()=>{const inputs=document.querySelectorAll('#lan-service-settings input');inputs[0].value='Files';inputs[1].value=${JSON.stringify(directory)};inputs[2].value='0';[...document.querySelectorAll('#lan-service-settings button')].find(b=>b.textContent==='启动文件服务').click();})()`);
    const state=await until(async()=>{const value=await app.evaluate("call('lan_service_state',{})");return value.status?.running?value:null;},'HTTPS listener started');
    await until(()=>app.evaluate("document.getElementById('lan-service-settings')?.textContent.includes('生成手机配对码')"),'running settings loaded');
    const credential=await app.evaluate("call('lan_service_credential',{name:'E2E device',permissions:{write:true,delete:false}})");
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
