import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),page=await fixture.browser.newPage({viewport:{width:412,height:892},hasTouch:true});let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,label)=>{assert.ok(v,label);console.log('ok '+(++checks)+' - '+label)};
await page.addInitScript(()=>{
 const root='/storage/emulated/0',entry=(path,kind)=>({path,name:path.split('/').pop(),kind,isDir:kind==='folder',size:10,modifiedMs:1}),m=window.__category={root,calls:[],fs:{}};
 m.fs[root]=[entry(root+'/D','folder'),entry(root+'/Bundle','folder')];m.fs[root+'/D']=['A','B','C'].map(n=>entry(root+'/D/'+n,'folder'));m.fs[root+'/D/A']=[entry(root+'/D/A/from.jpg','image'),entry(root+'/D/A/hidden.mp4','video')];m.fs[root+'/D/B']=[entry(root+'/D/B/existing.jpg','image')];m.fs[root+'/D/C']=[entry(root+'/D/C/film.mp4','video')];m.fs[root+'/Bundle']=[];
 const indexed=structuredClone(Object.values(m.fs).flat());
 window.__TAURI_INTERNALS__={invoke:async(cmd,a={})=>{m.calls.push({cmd,args:structuredClone(a)});switch(cmd){
  case 'debug_note':return;case 'get_permission_status':return{manageExternalStorage:true,sharedStorageReadable:true};case 'get_storage_roots':return[{path:root,label:'Internal storage'}];case 'index_status':return{entryCount:indexed.length,indexing:false};case 'app_info':return{version:'category-test'};
  case 'list_dir':if(!m.fs[a.path])throw Error('not a fixture folder');return{path:a.path,entries:structuredClone(m.fs[a.path])};
  case 'browse_library_folders':case 'browse_library':return{entries:indexed.filter(e=>!e.isDir&&e.kind===a.category)};
  case 'read_thumbnail':return{};
  case 'copy_entries':case 'move_entries':{const moved=[];for(const source of a.sources){const parent=source.slice(0,source.lastIndexOf('/')),e=m.fs[parent].find(e=>e.path===source);const target=a.destination+'/'+e.name;m.fs[a.destination].push({...e,path:target});if(e.isDir)m.fs[target]=[];if(cmd==='move_entries')m.fs[parent]=m.fs[parent].filter(e=>e.path!==source);moved.push(target);}return{moved,failures:[]};}
  default:throw Error('Unmocked '+cmd);
 }}};
});
const row=name=>page.locator('#filelist [role=option]').filter({has:page.locator('.name',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
const choose=name=>page.getByRole('button',{name,exact:true}).click();
const home=async()=>{if(!await page.locator('#home').isVisible()){await page.locator('#btn-menu').click();await page.locator('#nav-home').click()}};
const openCategory=async kind=>{await home();await page.locator('[data-tile='+kind+']').click();await page.locator('#filelist:not([hidden])').waitFor()};
const operation=async(name,label)=>{await row(name).locator('.entry-more').click();await choose(label)};
try{
 await page.goto(fixture.url);await page.waitForFunction(()=>window.rhfilesPane?.snapshot().ready);await openCategory('image');await row('A').click();await row('from.jpg').waitFor();
 check(await page.locator('#pathbar').isVisible(),'category folders expose navigation controls');check(await row('hidden.mp4').count()===0,'image category filters live filesystem contents');check(await page.locator('#btn-up').getAttribute('aria-label')==='返回图片分类','up button explicitly names the category parent');
 await operation('from.jpg','复制');await page.locator('#btn-up').click();await row('B').waitFor();check(await page.locator('#btn-paste').isDisabled(),'aggregate category cannot silently choose a destination');await row('B').click();await row('existing.jpg').waitFor();check(!await page.locator('#btn-paste').isDisabled(),'concrete category folder permits paste');await page.locator('#btn-paste').click();await row('from.jpg').waitFor();
 check(await page.evaluate(()=>__category.calls.some(c=>c.cmd==='copy_entries'&&c.args.destination===__category.root+'/D/B')),'copy targets the exact real album directory');check(await page.evaluate(()=>!__category.calls.some(c=>c.cmd==='index_start')),'pasted matching files appear immediately without rebuilding the index');
 await operation('from.jpg','移动');await openCategory('video');await row('C').click();await row('film.mp4').waitFor();await page.locator('#btn-paste').click();await page.locator('#toast').filter({hasText:'已完成'}).waitFor();
 check(await page.evaluate(()=>__category.fs[__category.root+'/D/C'].some(e=>e.name==='from.jpg')&&!__category.fs[__category.root+'/D/B'].some(e=>e.name==='from.jpg')),'move between differently filtered albums uses real source/destination');check(await row('from.jpg').count()===0,'nonmatching moved files do not leak into the video filter');
 await page.locator('#crumbs').getByRole('button',{name:'D',exact:true}).click();await row('A').waitFor();check(await page.locator('#title').innerText()==='D','ancestor breadcrumb opens its real filesystem folder');
 await page.locator('#btn-home').click();await page.locator('[data-tile=storage-0]').click();await operation('Bundle','复制');await openCategory('video');await row('C').click();await row('film.mp4').waitFor();await page.locator('#btn-paste').click();await page.locator('#toast').filter({hasText:'已完成'}).waitFor();check(await page.evaluate(()=>__category.fs[__category.root+'/D/C'].some(e=>e.name==='Bundle'&&e.isDir)),'folders can also be pasted into a filtered real directory');
 await page.locator('#crumbs').getByRole('button',{name:'视频',exact:true}).click();await row('C').waitFor();check(await page.locator('#title').innerText()==='视频','category breadcrumb returns to album grouping');await page.locator('#btn-up').click();await page.locator('#home:not([hidden])').waitFor();check(true,'category root up returns Home');check(errors.length===0,'no unhandled errors: '+errors.join('; '));console.log('PASS '+checks+' concrete category folder checks');
}finally{await fixture.close()}
