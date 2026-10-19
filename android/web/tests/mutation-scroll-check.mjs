// Real virtual-list DOM and actions; backend responses are deliberately delayed.
import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));let checks=0;const errors=[];
const check=(v,label)=>{assert.ok(v,label);console.log('ok '+(++checks)+' - '+label)};
try{for(const grid of [false,true]){
 const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(grid=>{
  const root='/storage/emulated/0',m=window.__mutation={root,calls:[],entries:Array.from({length:1000},(_,i)=>({name:'file-'+String(i).padStart(4,'0')+'.txt',path:root+'/file-'+String(i).padStart(4,'0')+'.txt',isDir:false,kind:'document',size:i,modifiedMs:1}))};
  localStorage.setItem('rhfiles.view',grid?'grid':'list');
  window.__TAURI_INTERNALS__={invoke:async(cmd,a={})=>{m.calls.push(cmd);if(cmd===m.delay)await new Promise(r=>m.release=r);switch(cmd){
   case 'debug_note':return;case 'get_permission_status':return{manageExternalStorage:true,sharedStorageReadable:true};case 'get_storage_roots':return[{path:root,label:'Internal storage'}];case 'index_status':return{entryCount:1000,indexing:false};case 'app_info':return{version:'scroll-test'};
   case 'list_dir':return{path:a.path,parent:root,entries:structuredClone(m.entries)};
   case 'rename_entry':{if(m.fail)throw Error('fixture denied');const e=m.entries.find(e=>e.path===a.path);e.name=a.newName;e.path=root+'/'+a.newName;return e.path;}
   case 'delete_entries':{const deleted=a.paths.filter(p=>p!==m.failPath);m.entries=m.entries.filter(e=>!deleted.includes(e.path));return{deleted,failures:a.paths.filter(p=>p===m.failPath).map(path=>({path,message:'fixture denied'}))};}
   default:throw Error('Unmocked '+cmd);
  }}};
 },grid);
 await page.goto(fixture.url);await page.bringToFront();await page.locator('[data-tile=storage-0]').click();await page.locator('#filelist:not([hidden])').waitFor();
 const list=page.locator('#filelist'),label=grid?'grid':'list';
 const scroll=async row=>{await list.locator('[role=option]').first().waitFor();await list.evaluate((n,{row,grid})=>n.scrollTop=row*(grid?136:64)+7,{row,grid});await page.screenshot({path:'test-artifacts/android-022-scroll-'+label+'.png'});};
 const anchor=()=>list.evaluate(n=>{const top=n.getBoundingClientRect().top;const nodes=[...n.querySelectorAll('[role=option]')].filter(e=>e.getBoundingClientRect().top>=top-1);const e=nodes[1];if(!e)throw Error(JSON.stringify({scroll:n.scrollTop,height:n.clientHeight,extent:n.scrollHeight,top,nodes:[...n.querySelectorAll('[role=option]')].map(e=>({path:e.dataset.path,top:e.getBoundingClientRect().top}))}));return{path:e.dataset.path,top:e.getBoundingClientRect().top,scroll:n.scrollTop}});
 const assertAnchor=async(a,text)=>{await page.screenshot({path:'test-artifacts/android-022-scroll-'+label+'.png'});const actual=await list.evaluate((n,a)=>{const e=[...n.querySelectorAll('[role=option]')].find(e=>e.dataset.path===a.path);return e?{top:e.getBoundingClientRect().top,scroll:n.scrollTop}:null},a);check(actual&&Math.abs(actual.top-a.top)<(grid?137:2),label+': '+text+' '+JSON.stringify({before:a,actual}));};
 await scroll(110);let a=await anchor();await page.locator('#btn-refresh').click();await assertAnchor(a,'manual refresh retains the same visible file and pixel offset');
 // Rename changes sort position; do not follow it to the top or bottom.
 await page.evaluate(()=>__mutation.delay='rename_entry');await page.locator('[data-path="'+a.path+'"] .entry-more').click();await page.getByRole('button',{name:'重命名',exact:true}).click();await page.locator('#sheet input').fill('zzz-renamed.txt');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.waitForFunction(()=>!!__mutation.release);await scroll(150);a=await anchor();await page.evaluate(()=>{__mutation.delay=null;__mutation.release()});await page.getByText('已重命名',{exact:true}).waitFor();await assertAnchor(a,'scroll while rename is pending uses completion-time viewport');
 // Remove entries before the visible anchor through the same delete operation UI.
 await page.evaluate(()=>{delete __mutation.release;__mutation.delay='delete_entries'});const target=await list.locator('[role=option]').first().getAttribute('data-path');await page.locator('[data-path="'+target+'"] .entry-more').click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'永久删除',exact:true}).click();
 await page.waitForFunction(()=>__mutation.delay==='delete_entries'&&typeof __mutation.release==='function');await scroll(200);a=await anchor();await page.evaluate(()=>{__mutation.delay=null;__mutation.release()});await page.getByText('已删除 1 项',{exact:true}).waitFor();await assertAnchor(a,'delete before viewport retains the visible file instead of jumping to start');
 // Refresh with an insertion and a removal before this viewport.
 a=await anchor();await page.evaluate(()=>{window.__oldSpace=document.querySelector('.file-space');__mutation.entries.splice(0,3);__mutation.entries.push({...__mutation.entries[0],name:'aaa-new.txt',path:__mutation.root+'/aaa-new.txt'})});await page.locator('#btn-refresh').click();await page.waitForFunction(()=>!__oldSpace.isConnected);await assertAnchor(a,'changed listing reconciles sorting and visible anchor');
 // A failed rename must leave the usable list untouched.
 a=await anchor();await page.evaluate(()=>__mutation.fail=true);await page.locator('[data-path="'+a.path+'"] .entry-more').click();await page.getByRole('button',{name:'重命名',exact:true}).click();await page.locator('#sheet input').fill('denied.txt');await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('#toast').filter({hasText:'fixture denied'}).waitFor();await assertAnchor(a,'failed rename keeps the original file and position');
 check(await list.evaluate(n=>n.scrollTop)>5000,label+': deep position survives all mutations');
 await context.close();
}check(errors.length===0,'no browser errors: '+errors.join('; '));console.log('Passed '+checks+' mutation-scroll checks');}finally{if(errors.length)console.error(errors);await fixture.close()}
