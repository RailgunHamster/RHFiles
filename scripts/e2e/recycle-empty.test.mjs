import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('sidebar Empty confirms a fresh owned snapshot without navigation or deleting new arrivals',{timeout:120000},async t=>{
  const app=await launchApp({emulateFocus:true});
  const directory=fs.realpathSync.native(app.directory),first=path.join(directory,'clear-owned.txt'),late=path.join(directory,'arrived-after-confirmation.txt'),unrelated=path.join(directory,'unrelated-owned.txt'),live=path.join(directory,'keep-live.txt');
  const owned=[first,late,unrelated];
  const invoke=(name,args={})=>app.evaluate(`call(${JSON.stringify(name)},${JSON.stringify(args)})`);
  const raw=()=>app.evaluate("window.__recycleOriginalCall('recycle_bin_list',{})");
  t.after(async()=>{try{const bin=await app.evaluate("(window.__recycleOriginalCall||call)('recycle_bin_list',{})");const ids=bin.items.filter(item=>owned.includes(item.originalPath)).map(item=>item.id);if(ids.length)await invoke('recycle_bin_restore',{ids,policy:'keepBoth',operationId:'qa-empty-cleanup'});}finally{await app.close();}});
  await app.evaluate("setLang('zh');setInspectorMode('closed',false);true");
  for(const file of [first,unrelated]){fs.writeFileSync(file,'owned recycle fixture');await invoke('delete_file',{path:file});}
  fs.writeFileSync(live,'keep this live file');
  await app.evaluate(`navigateTo(${JSON.stringify(directory)})`);
  // Keep all destructive integration calls scoped to generated fixtures. The
  // production snapshot/plan/delete commands still execute against Windows.
  await app.evaluate(`window.__recycleOriginalCall=call;window.__emptyCalls=[];call=async(name,args)=>{window.__emptyCalls.push(name);const result=await window.__recycleOriginalCall(name,args);if(name==='recycle_bin_list'){const items=result.items.filter(item=>${JSON.stringify([first,late])}.includes(item.originalPath));return {...result,items,total:items.length,truncated:false};}return result;};true`);
  const before=await app.evaluate('({tab:G.activeTab,path:getTab().path,count:G.tabs.length})');
  async function sidebarEmpty(){
    const point=await app.hover('#sidebar-recycle svg');
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',buttons:2,clickCount:1});
    await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',clickCount:1});
    await until(()=>app.evaluate("!![...document.querySelectorAll('.context-menu .ctx-item')].find(node=>node.textContent.includes('清空回收站'))"),'sidebar empty menu');
    await app.evaluate("[...document.querySelectorAll('.context-menu .ctx-item')].find(node=>node.textContent.includes('清空回收站')).id='qa-empty-menu';true");
    await app.click('#qa-empty-menu');
    await until(()=>app.evaluate("document.querySelector('.app-confirm-title')?.textContent===recycleText('emptyTitleConfirm')"),'empty snapshot confirmation');
  }
  await sidebarEmpty();
  assert.deepEqual(await app.evaluate('({tab:G.activeTab,path:getTab().path,count:G.tabs.length})'),before);
  await app.click('.app-confirm-overlay .dialog-actions button:first-child');await until(()=>app.evaluate('!recycleBusy'),'empty canceled');
  assert((await raw()).items.some(item=>item.originalPath===first));
  await sidebarEmpty();
  fs.writeFileSync(late,'new arrival must survive');await invoke('delete_file',{path:late});
  await app.click('.app-confirm-overlay .dialog-actions button:last-child');
  await until(()=>app.evaluate("document.querySelector('.app-confirm-title')?.textContent===recycleText('finalTitle')"),'second permanent confirmation');
  await app.click('.app-confirm-overlay .dialog-actions button:last-child');await until(()=>app.evaluate('!recycleBusy'),'confirmed empty operation');
  const remaining=(await raw()).items;
  assert(!remaining.some(item=>item.originalPath===first));assert(remaining.some(item=>item.originalPath===late));assert(remaining.some(item=>item.originalPath===unrelated));
  assert.equal(fs.readFileSync(live,'utf8'),'keep this live file');assert.deepEqual(await app.evaluate('({tab:G.activeTab,path:getTab().path,count:G.tabs.length})'),before);
  assert.equal(await app.evaluate("__emptyCalls.includes('empty_recycle_bin')"),false,'Never invokes the unscoped native purge command');
  await app.click('#sidebar-recycle');await until(()=>app.evaluate('getTab().path==="recycle://"&&!recycleModel().loading'),'bin opened');
  assert.equal(await app.evaluate("document.querySelectorAll('[data-recycle-control=empty]').length===1&&!!document.querySelector('.recycle-toolbar [data-recycle-control=empty]')"),true);
  await app.evaluate("recycleSetQuery('no matching file');true");
  await app.click('.recycle-toolbar [data-recycle-control=empty]');await until(()=>app.evaluate('!!document.querySelector(".app-confirm-overlay")'),'top empty ignores filter');
  await app.click('.app-confirm-overlay .dialog-actions button:first-child');await until(()=>app.evaluate('!recycleBusy'),'top empty canceled');
  await app.send('Emulation.setDeviceMetricsOverride',{width:740,height:600,deviceScaleFactor:1,mobile:false});
  assert.equal(await app.evaluate("document.querySelector('.recycle-toolbar [data-recycle-control=empty]').getBoundingClientRect().right<=innerWidth"),true);
  await app.screenshot('recycle-top-empty');
});
