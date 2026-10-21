// Real browser controls/sheets, mocked native filesystem; APK probes cover the bridge.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserFixture} from './browser-fixture.mjs';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=await browserFixture(web,(req,res)=>{
  if(req.url!=='/trash-fixture')return false;
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="css/app.css"><link rel="stylesheet" href="css/components.css"><link rel="stylesheet" href="css/trash.css"><div style="height:100dvh;overflow:auto" class="tool-page"><div id="tool-extra"></div></div><div id="scrim" hidden></div><div id="sheet" class="sheet" hidden><div id="sheet-panel" class="sheet-panel"></div></div><div id="toast" hidden></div><script src="js/ui.js"></script><script src="js/format.js"></script><script src="js/trash.js"></script></html>');return true;
});
const errors=[];
try{
  const page=await fixture.browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(fixture.url+'/trash-fixture');
  await page.evaluate(()=>{
    window.__model={items:Array.from({length:205},(_,i)=>({id:'id-'+i,name:'回收文件 '+i+'.txt',original:'/storage/emulated/0/Download/回收文件 '+i+'.txt',at:10000-i,kind:'document'})),jobs:[],calls:[],valid:true};
    window.api={native:async(cmd,args)=>{
      __model.calls.push({cmd,args});
      if(cmd==='trash.list')return structuredClone(__model.items);
      if(cmd==='jobs')return structuredClone(__model.jobs);
      if(cmd==='job.start'){const id='job-'+__model.jobs.length;__model.jobs.push({id,op:args.op,args:args.args,state:'queued',files:args.args.ids.length,done:0});return id;}
      throw Error('Unexpected command '+cmd);
    }};
    window.__app={button(label,icon,handler,cls){const b=ui.el('button',cls);b.innerHTML=ui.icon(icon);b.append(ui.el('span','',label));b.onclick=()=>Promise.resolve().then(handler).catch(e=>__model.error=String(e));return b;},action(label,icon,onSelect,danger=false){return {label,icon,onSelect,danger};},go(){__model.valid=false;},error(e){__model.error=String(e);}};
    window.__enter=()=>androidTrash.enter(document.querySelector('#tool-extra'),__app,()=>__model.valid);
    return __enter();
  });
  const button=(text)=>page.getByRole('button',{name:text,exact:true});
  assert.equal(await page.locator('.trash-row').count(),100,'large trash list is paginated');
  await button('全选').click();assert.equal(await page.locator('.trash-count').textContent(),'已选 205 项','select-all includes unloaded pages');
  assert.ok(await button('恢复所选（205）').isVisible(),'batch actions remain visible on a phone');
  await page.screenshot({path:path.join(web,'tests','__screenshots__','trash-selection-023.png')});
  await button('恢复所选（205）').click();
  await page.waitForSelector('.trash-progress');
  let calls=await page.evaluate(()=>__model.calls.filter(c=>c.cmd==='job.start'));
  assert.equal(calls.length,1);assert.equal(calls[0].args.op,'restore');assert.equal(calls[0].args.args.ids.length,205);
  await page.evaluate(()=>{const j=__model.jobs[0];j.state='failed';j.done=204;j.failures=[{path:'/conflict',message:'目标已存在；未覆盖'}];__model.items=__model.items.slice(0,1);});
  await page.waitForFunction(()=>document.querySelector('.trash-error')?.textContent.includes('未覆盖'));
  assert.equal(await page.locator('.trash-row').count(),1,'batch completion refreshes remaining records');
  assert.equal(await page.locator('.trash-count').textContent(),'已选 1 项','failed items remain selected');
  await page.evaluate(()=>androidTrash.back());assert.equal(await page.locator('.trash-selection').isVisible(),false);
  await button('清空全部').click();
  await page.locator('#sheet button').filter({hasText:'取消'}).click();
  assert.equal(await page.evaluate(()=>__model.calls.filter(c=>c.cmd==='job.start').length),1,'first cancel makes no mutation');
  await button('清空全部').click();await page.locator('#sheet button').filter({hasText:'继续'}).click();
  await page.locator('#sheet button').filter({hasText:'取消'}).click();
  assert.equal(await page.evaluate(()=>__model.calls.filter(c=>c.cmd==='job.start').length),1,'second cancel also makes no mutation');
  await button('清空全部').click();await page.locator('#sheet button').filter({hasText:'继续'}).click();
  // A new recycled item during confirmation must not be included.
  await page.evaluate(()=>__model.items.push({id:'arrived-later',name:'later.txt',original:'/later.txt',at:20000}));
  await page.locator('#sheet button').filter({hasText:'永久删除'}).click();
  await page.waitForFunction(()=>__model.jobs.length===2);
  calls=await page.evaluate(()=>__model.calls.filter(c=>c.cmd==='job.start'));
  assert.deepEqual(calls[1].args.args,{ids:['id-0']},'empty-all operates on exactly the confirmed ID snapshot');
  assert.equal(calls[1].args.op,'trash-delete','no arbitrary path deletion from WebView');
  await page.evaluate(()=>{__model.jobs[1].state='completed';__model.items=__model.items.filter(i=>i.id!=='id-0');});
  await page.waitForFunction(()=>document.querySelector('.trash-row .name')?.textContent==='later.txt');
  await page.getByRole('button',{name:'later.txt 的更多操作',exact:true}).click();
  assert.equal(await page.locator('#sheet button').count(),2,'single-item menu offers restore and delete');
  await page.locator('#sheet button').filter({hasText:'恢复原位置'}).click();
  await page.waitForFunction(()=>__model.jobs.length===3);
  await page.evaluate(()=>{__model.jobs[2].state='completed';__model.items=[];});
  await page.waitForSelector('.trash-empty');
  assert.ok(await button('清空全部').isDisabled());assert.ok(await button('全选').isDisabled());
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await page.screenshot({path:path.join(web,'tests','__screenshots__','trash-empty-dark-023.png')});
  assert.equal(await page.evaluate(()=>__model.error||''),'');assert.deepEqual(errors,[]);
  console.log('PASS: bounded list, off-page select-all, visible batch actions, restore/conflicts, auto-refresh, back clears selection, two-confirmation cancellation, deletion snapshot, per-item parity, empty/dark state');
}finally{await fixture.close();}
