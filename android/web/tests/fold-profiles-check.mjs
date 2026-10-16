import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);};
await context.addInitScript(()=>{
 if(parent!==window)return;
 if(!localStorage.getItem('qa-initialized')){localStorage.setItem('qa-initialized','1');localStorage.setItem('rhfiles.panes','columns');}
 const root='/storage/emulated/0',model=window.__model={screenKey:localStorage.getItem('qa-screen')||'screen-1080x2092',calls:[]};
 window.__TAURI_INTERNALS__={invoke:async(cmd,args={})=>{model.calls.push(cmd);switch(cmd){
  case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:2,indexing:false};case 'debug_note':return;case 'app_info':return {version:'fold-test'};
  case 'list_dir':return {path:args.path,entries:args.path===root?['Download','Music'].map(name=>({name,path:root+'/'+name,isDir:true,kind:'folder'})):[]};
  default:throw Error('Unmocked '+cmd);
 }}};
 window.RHFilesNative={postMessage(raw){const {id,command}=JSON.parse(raw);model.calls.push(command);let result;
  switch(command){case 'capabilities':result={version:3,nativeBack:true,dualPane:true,adaptiveLayout:true,restoreNavigation:true};break;
   case 'window.layout':if(localStorage.getItem('qa-hold-layout')==='1'){model.pendingLayout=id;return;}result={screenKey:model.screenKey};break;
   case 'roots':result=[{path:root,label:'内部存储'}];break;case 'shares':case 'jobs':result=[];break;case 'theme':case 'permission':result=true;break;
   default:throw Error('Unmocked native '+command);
  }
  queueMicrotask(()=>window.RHFilesNative.onmessage({data:JSON.stringify({id,result})}));
 }};
});
const pane=which=>page.frames().find(f=>new URL(f.url()).searchParams.get('pane')===which);
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.file-pane')].every(f=>!!f.contentWindow.rhfilesPane)&&!!document.querySelector('.file-pane'));
const mode=()=>page.locator('#workbench').getAttribute('data-mode');
const waitMode=value=>page.waitForFunction(value=>document.getElementById('workbench')?.dataset.mode===value,value);
async function menu(){const visible=await page.locator('.file-pane:visible').first().elementHandle();const frame=await visible.contentFrame();await frame.locator('#btn-overflow').click();await frame.locator('#sheet').getByRole('button',{name:'分屏布局',exact:true}).click();await page.locator('#sheet').waitFor();}
async function choose(value){await menu();await page.locator(`[data-layout=${value}]`).click();await page.locator('#sheet').waitFor({state:'hidden'});}
async function screen(key){await page.evaluate(key=>{__model.screenKey=key;localStorage.setItem('qa-screen',key);window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:{screenKey:key}}));},key);}
try {
 await page.goto(fixture.url);await ready();await waitMode('columns');
 check(await mode()==='columns','old global preference migrates to the first active screen');
 await pane('first').locator('[data-tile=downloads]').click();await choose('single');
 check(await page.locator('.file-pane:visible').count()===1,'outer display remembers single-pane');
 await screen('screen-1840x2208');await page.setViewportSize({width:1000,height:900});await waitMode('columns');
 await menu();check(await page.locator('[data-layout=auto]').getAttribute('aria-pressed')==='true','first unfold uses Auto instead of the outer screen choice');await page.locator('[data-layout=rows]').click();await waitMode('rows');
 await pane('second').locator('[data-tile=storage-0]').click();await pane('second').locator('[data-path$="Music"]').click();
 await pane('first').evaluate(()=>window.__foldMarker='first');await pane('second').evaluate(()=>window.__foldMarker='second');
 for(let i=0;i<3;i++) {
  await page.setViewportSize({width:412,height:892});check(await mode()==='rows','a window resize alone does not change screen identity');
  await screen('screen-1080x2092');await waitMode('single');
  await screen('screen-1840x2208');await page.setViewportSize({width:1000,height:900});await waitMode('rows');
 }
 check(await pane('first').locator('#title').innerText()==='下载'&&await pane('second').locator('#title').innerText()==='Music','folding restores both pane locations');
 check(await pane('first').evaluate(()=>__foldMarker)==='first'&&await pane('second').evaluate(()=>__foldMarker)==='second','folding hides/reuses frames rather than recreating them');
 await page.setViewportSize({width:900,height:1000});await screen('screen-1840x2208');await waitMode('rows');
 await page.setViewportSize({width:900,height:400});await page.evaluate(()=>window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:{insets:{top:.05,bottom:.05}}})));await waitMode('rows');
 check(await mode()==='rows','rotation, keyboard and insets preserve the current display choice');
 await page.setViewportSize({width:1000,height:900});await menu();await screen('screen-1080x2092');await page.locator('#sheet').waitFor({state:'hidden'});await waitMode('single');
 check(!await page.locator('#sheet').isVisible(),'folding closes a stale layout picker instead of applying it to the other screen');
 await choose('columns');await screen('screen-1840x2208');await waitMode('rows');await screen('screen-1080x2092');await waitMode('columns');
 check(await mode()==='columns','manual split remains available on a small outer display and has its own saved direction');
 await page.reload();await ready();await waitMode('columns');await screen('screen-1840x2208');await waitMode('rows');
 check(await mode()==='rows','both display preferences survive Activity/page recreation');
 const exported=await page.evaluate(()=>settingsData.snapshot(localStorage));
 const saved=JSON.parse(exported['rhfiles.panes.screens']);check(saved.screens['screen-1080x2092']==='columns'&&saved.screens['screen-1840x2208']==='rows','configuration backup contains both screen memories');
 // A delayed initial IPC answer must not undo a newer native fold event.
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('qa-hold-layout','1');});await page.reload();
 await page.waitForFunction(()=>!!window.__model?.pendingLayout);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:{screenKey:'screen-1840x2208'}}));RHFilesNative.onmessage({data:JSON.stringify({id:__model.pendingLayout,result:{screenKey:'screen-1080x2092'}})});});
 await ready();const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.panes.screens')));
 check(migrated.screens['screen-1840x2208']==='columns'&&!('screen-1080x2092' in migrated.screens),'late initial window info cannot overwrite a newer fold event or migrate the wrong screen');
 check(errors.length===0,'no JavaScript errors: '+errors.join(';'));
 console.log('PASS '+checks+' fold-screen browser checks');
}finally{await context.close();await fixture.close();}
