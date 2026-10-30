import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {root} from '../testing/source.mjs';

const click=(app,label)=>app.evaluate(`(()=>{const b=[...document.querySelectorAll('.device-groups button')].find(n=>n.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Group button unavailable');b.click();return true})()`);
const read=(app)=>app.evaluate(`(()=>{const panel=document.querySelector('.dg-output-layout'),field=panel?.querySelector('textarea'),image=panel?.querySelector('img'),copy=panel?.querySelector('button');if(!field||!image?.complete||!image.naturalWidth)return null;const rect=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,display:s.display,visibility:s.visibility}};return {uri:field.value,readOnly:field.readOnly,text:rect(field),qr:rect(image),copy:rect(copy),copyLabel:copy.textContent,columns:getComputedStyle(panel).gridTemplateColumns,viewport:innerWidth}})()`);
async function form(app){
  await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");
  await until(()=>app.evaluate("!!document.querySelector('.device-groups .dg-actions textarea')"),'group form');
  for(const file of ['js/device-groups-ui.js','css/device-groups.css']){
    const bytes=await app.evaluate(`fetch(${JSON.stringify(file)}).then(r=>r.text())`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(fs.readFileSync(path.join(root,'src',file))).digest('hex'),'actual packaged '+file);
  }
}
function visible(value){
  assert.equal(value.readOnly,true);
  for(const item of [value.text,value.qr,value.copy]){assert(item.width>0&&item.height>0);assert.notEqual(item.display,'none');assert.notEqual(item.visibility,'hidden');assert(item.left>=0&&item.right<=value.viewport+1,'output remains inside the viewport');}
}
test('packaged group request and approval show QR plus full selectable text on wide and narrow screens',async()=>{
  const a=await launchApp({emulateFocus:true,desktopId:'group-transfer-owner'}),b=await launchApp({emulateFocus:true,desktopId:'group-transfer-guest'});
  try{
    await form(a);await form(b);
    await click(a,'创建新设备组');await until(()=>a.evaluate("!!document.querySelector('.dg-card')"),'owner group');
    await b.send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
    await click(b,'生成本机入组请求');const request=await until(()=>read(b),'real request QR and text');
    assert.match(request.uri,/^rhfiles-group-request:v1:/);assert.equal(request.copyLabel,'复制入组请求');visible(request);assert(request.text.right<=request.qr.left+1,'wide screen shows the representations side by side');
    await b.evaluate("document.querySelector('.dg-output-layout').scrollIntoView({block:'center'});true");await b.screenshot('group-request-text-and-qr-wide');
    await b.send('Emulation.setDeviceMetricsOverride',{width:520,height:900,deviceScaleFactor:1,mobile:false});
    await b.evaluate("document.querySelector('.dg-output-layout').scrollIntoView({block:'center'});true");
    const narrow=await read(b);visible(narrow);assert.equal(narrow.uri,request.uri);assert(narrow.qr.top>=narrow.text.bottom,'narrow screen retains both stacked representations');await b.screenshot('group-request-text-and-qr-narrow');
    await a.evaluate(`(()=>{const labels=[...document.querySelectorAll('.dg-actions label')];labels.find(n=>n.textContent==='粘贴入组请求或批准信息').querySelector('textarea').value=${JSON.stringify(request.uri)};labels.find(n=>n.textContent==='已核对信息来自我信任的设备').querySelector('input').checked=true;return true})()`);
    await click(a,'批准上方入组请求');const approval=await until(()=>read(a),'actual signed approval QR and text');visible(approval);assert.match(approval.uri,/^rhfiles-group-approval:v1:/);assert.equal(approval.copyLabel,'复制批准信息');
    await a.evaluate("document.querySelector('.dg-output-layout').scrollIntoView({block:'center'});true");await a.screenshot('group-approval-text-and-qr');
    await b.evaluate(`(()=>{const labels=[...document.querySelectorAll('.dg-actions label')];labels.find(n=>n.textContent==='粘贴入组请求或批准信息').querySelector('textarea').value=${JSON.stringify(approval.uri)};labels.find(n=>n.textContent==='已核对信息来自我信任的设备').querySelector('input').checked=true;return true})()`);
    await click(b,'使用批准信息加入');await until(()=>b.evaluate("document.querySelector('.dg-status')?.textContent.startsWith('已加入。')"),'guest joined the actual group');
    console.log('Isolated group transfer evidence: '+b.artifactDir);
  }finally{await a.close();await b.close();}
});
