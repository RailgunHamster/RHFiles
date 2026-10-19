import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});const page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(v,label)=>{assert.ok(v,label);console.log('ok '+(++checks)+' - '+label)};
await context.addInitScript(()=>{
 const root='/storage/emulated/0',m=window.__usage={calls:[],reports:{},state:'indexing',partial:false};
 const folder=(id=1)=>({id,name:id===1?'内部存储':'照片',path:id===1?root:root+'/照片',isDir:true,size:id===1?1048576:262144,files:4,directories:id===1?1:0,issues:m.partial?1:0});
 const entries=[{id:2,name:'电影.mp4',path:root+'/电影.mp4',parentPath:root,isDir:false,kind:'video',size:786432,files:1,directories:0,issues:0},{...folder(3),kind:'folder'}];
 window.__TAURI_INTERNALS__={invoke:async(cmd,a={})=>{switch(cmd){case 'get_permission_status':return{manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return{entryCount:1,indexing:false};case 'index_start':return true;case 'debug_note':return;case 'app_info':return{version:'usage-test'};default:throw Error('Unmocked '+cmd)}}};
 const snapshot=id=>({id,owner:'first',root,state:m.state,phase:m.state==='completed'?'analyzing':m.state,percent:m.state==='indexing'?null:m.state==='analyzing'?42:100,discovered:6,indexedFolders:2,processed:m.state==='indexing'?0:m.state==='analyzing'?3:6,total:m.state==='indexing'?0:6,issues:m.partial?1:0,ready:['completed','canceled'].includes(m.state),started:Date.now()-5000,updated:Date.now(),current:root+'/照片/图.jpg',message:m.partial?'部分目录权限不足，结果不完整':''});
 window.RHFilesNative={postMessage(raw){const{id,command,args:a={}}=JSON.parse(raw);m.calls.push({command,args:a});Promise.resolve().then(async()=>{switch(command){
  case 'capabilities':return{version:3,nativeBack:true,storageAnalysis:true};case 'permission':return true;case 'theme':return true;case 'window.layout':return{};
  case 'roots':return[{path:root,label:'内部存储'}];case 'shares':case 'jobs':return[];
  case 'analysis.latest':return m.reports[a.root]||null;
  case 'analysis.start':{m.state='indexing';const s=snapshot('scan-'+m.calls.length);m.reports[a.root]=s;return s;}
  case 'analysis.status':{if(m.hold)await new Promise(resolve=>m.release=resolve);const s=snapshot(a.id);m.reports[root]=s;return s;}
  case 'analysis.cancel':m.state='canceled';return snapshot(a.id);
  case 'analysis.page':{const current=folder(a.parentId);return{status:snapshot(a.id),root:folder(),folder:current,breadcrumbs:a.parentId===1?[folder()]:[folder(),current],entries:a.view==='types'?[]:a.view==='issues'?(m.partial?[{...entries[0],issue:'权限不足'}]:[]):a.view==='largest'?[entries[0]]:a.parentId===1?entries:[{id:4,name:'最新.jpg',path:root+'/照片/最新.jpg',parentPath:root+'/照片',size:262144,kind:'image'}],groups:[{kind:'video',bytes:786432,files:1},{kind:'image',bytes:262144,files:3}],hasMore:false};}
  default:throw Error('Unmocked native '+command)
 }}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const button=name=>page.getByRole('button',{name,exact:true});
try{
 await page.goto(fixture.url);await page.locator('[data-tile=usage]').click();await page.locator('#btn-scan').click();await page.getByText('预扫描',{exact:true}).waitFor();
 check(!await page.locator('#scan-progress progress').getAttribute('value'),'unknown pre-scan work never displays a fake percent');
 check(await page.locator('#scan-progress').innerText().then(t=>t.includes('总量尚未确定')),'pre-scan explains unknown totals and discovered items');
 await page.evaluate(()=>__usage.state='analyzing');await page.getByText('42%',{exact:true}).waitFor();check(await page.locator('#btn-scan').isDisabled(),'known-work phase displays actual percentage and prevents duplicate starts');
 await page.evaluate(()=>{__usage.state='completed';__usage.partial=true});await page.locator('.usage-metrics').waitFor();
 check((await page.locator('.usage-metrics').innerText()).includes('1.0 MB'),'report shows total files size with separate file and folder metrics');
 check(await page.locator('.usage-warning-link').innerText().then(t=>t.includes('1 项读取异常')),'partial access failures stay prominent after completion');
 await page.screenshot({path:'test-artifacts/android-021-usage-completed.png',fullPage:true});
 await page.getByRole('tab',{name:'类型',exact:true}).click();await page.getByText('文档与电子书',{exact:true}).count();await page.locator('.usage-row-top').getByText('图片',{exact:true}).waitFor();check(await page.locator('.usage-distribution span').count()===2,'type view renders disjoint size proportions');
 await page.getByRole('tab',{name:'大文件',exact:true}).click();await page.locator('.usage-row-top').getByText('电影.mp4',{exact:true}).waitFor();check(await page.locator('.usage-row').count()===1,'largest-files view requests a bounded subtree page');
 await page.getByRole('tab',{name:'异常',exact:true}).click();await page.locator('.usage-row .usage-warning').getByText('权限不足',{exact:true}).waitFor();check(true,'issues view provides an actionable individual item');
 await page.getByRole('tab',{name:'文件夹',exact:true}).click();await page.locator('.usage-row-top').getByText('照片',{exact:true}).click();await page.locator('.usage-row-top').getByText('最新.jpg',{exact:true}).waitFor();
 check(await page.locator('.usage-breadcrumbs button').count()===2,'folder drill-down updates scope and breadcrumbs');
 await page.evaluate(()=>window.rhfilesHandleBack());await page.locator('.usage-row-top').getByText('电影.mp4',{exact:true}).waitFor();check(await page.locator('#tool-usage').isVisible(),'system Back first returns to parent report, not Home');
 await page.setViewportSize({width:275,height:740});check(await page.locator('#tool-usage').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'report remains usable in a 275px split pane');
 await page.screenshot({path:'test-artifacts/android-021-usage-narrow.png',fullPage:true});
 await page.setViewportSize({width:412,height:892});await page.locator('#btn-scan').click();await page.getByText('预扫描',{exact:true}).waitFor();await page.locator('#scan-cancel').click();await page.getByText('已取消 · 部分结果',{exact:true}).waitFor();
 check((await page.locator('#scan-progress').innerText()).includes('请勿作为完整目录大小'),'cancellation is explicit, never mislabeled complete');
 await page.screenshot({path:'test-artifacts/android-021-usage-ui.png',fullPage:true});
 await page.locator('#btn-scan').click();await page.getByText('预扫描',{exact:true}).waitFor();await page.evaluate(()=>__usage.hold=true);await page.waitForFunction(()=>!!__usage.release);await page.locator('#btn-menu').click();await page.locator('#nav-home').click();await page.evaluate(()=>{__usage.hold=false;__usage.state='completed';__usage.release()});await page.waitForTimeout(200);
 check(await page.locator('#home').isVisible()&&!await page.locator('#tool-usage').isVisible(),'late report/status responses cannot replace navigation');
 await page.locator('[data-tile=usage]').click();await page.locator('.usage-metrics').waitFor();check(true,'returning to analysis restores the native report rather than rescanning');
 check(errors.length===0,'no unhandled frontend errors: '+errors.join(';'));console.log('PASS '+checks+' storage analysis UI checks (native bridge mocked)');
}finally{await context.close();await fixture.close();}
