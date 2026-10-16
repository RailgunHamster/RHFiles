import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:1000,height:900},hasTouch:true});const page=await context.newPage();
await context.addInitScript(()=>{
  if(window.parent!==window)return;const root='/storage/emulated/0';
  window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{switch(cmd){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:300,lastFinishedMs:Date.now()};case 'app_info':return {version:'test'};case 'list_dir':return {path:args.path,entries:Array.from({length:300},(_,i)=>({name:`file-${String(i).padStart(3,'0')}.txt`,path:root+'/file-'+i+'.txt',isDir:false,kind:'document',size:1}))};case 'debug_note':return;default:throw Error(cmd)}}};
  window.RHFilesNative={postMessage(raw){const{id,command}=JSON.parse(raw);const result=command==='capabilities'?{version:3,dualPane:true,nativeBack:true,paneTouch:true}:command==='roots'?[{path:root,label:'内部存储'}]:command==='window.layout'?{}:command==='shares'||command==='jobs'?[]:true;queueMicrotask(()=>window.RHFilesNative.onmessage({data:JSON.stringify({id,result})}));}};
});
try{
  await page.goto(fixture.url);await page.waitForFunction(()=>document.querySelectorAll('.file-pane').length===2&&[...document.querySelectorAll('.file-pane')].every(f=>f.contentDocument.querySelector('[data-tile=storage-0]')));
  const panes=page.frames().filter(f=>/[?]pane=/.test(f.url()));for(const frame of panes){await frame.locator('[data-tile=storage-0]').click();await frame.locator('.row').first().waitFor();}
  if(process.env.RHFILES_TOUCH_TRACE)await page.evaluate(()=>{window.__touchTrace=[];for(const f of document.querySelectorAll('.file-pane'))for(const type of ['touchstart','touchmove','touchend'])f.contentWindow.addEventListener(type,e=>window.__touchTrace.push({owner:f.src,type,points:[...e.changedTouches].map(t=>({id:t.identifier,x:t.clientX,y:t.clientY,target:t.target.ownerDocument.defaultView.location.href}))}),true);});
  const cdp=await context.newCDPSession(page);const points=await page.evaluate(()=>[...document.querySelectorAll('.file-pane')].map((f,i)=>{const r=f.getBoundingClientRect(),l=f.contentDocument.getElementById('filelist').getBoundingClientRect();return{id:i+1,x:r.x+l.x+l.width/2,y:r.y+l.y+Math.min(360,l.height*.75)}}));
  const relay=async(phase,points)=>page.evaluate(({phase,points})=>RHFilesWorkbench.touch({phase,points:points.map(p=>({...p,secondary:p.id!==1,x:p.x/innerWidth,y:p.y/innerHeight}))}),{phase,points});
  await relay('start',[points[0]]);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});
  await relay('start',[points[1]]);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  for(let i=1;i<=18;i++){const moved=points.map(p=>({...p,y:p.y-i*9}));await relay('move',moved);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:moved});await new Promise(r=>setTimeout(r,16));}
  await relay('end',points.map(p=>({...p,y:p.y-162})));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);
  const scrolls=await page.evaluate(()=>[...document.querySelectorAll('.file-pane')].map(f=>({top:f.contentDocument.getElementById('filelist').scrollTop,selected:f.contentDocument.getElementById('sel-count').textContent})));
  if(process.env.RHFILES_TOUCH_TRACE)console.log(JSON.stringify(await page.evaluate(()=>window.__touchTrace.slice(0,8))));console.log('Concurrent touch result: '+JSON.stringify(scrolls));assert.ok(scrolls.every(s=>s.top>80),'Both panes must scroll during the same two-finger gesture');assert.ok(scrolls.every(s=>s.selected==='已选择 0 项'),'Scrolling must not trigger long-press selection');
  console.log('PASS concurrent scrolling with mocked Android MotionEvent relay and real Chromium touch/click behavior');
}finally{await context.close();await fixture.close();}
