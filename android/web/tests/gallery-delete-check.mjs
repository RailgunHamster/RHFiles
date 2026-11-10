import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve('android/web'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
const check=(v,label)=>{assert.ok(v,label);console.log('ok '+(++checks)+' - '+label);};
await context.addInitScript(()=>{
 const root='/storage/emulated/0';
 const entries=['wide-red.jpg','tall-green.jpg','blue.jpg'].map(name=>({name,path:root+'/'+name,isDir:false,kind:'image',size:100,modifiedMs:1}));
 const m=window.__galleryQA={entries,calls:[],job:null,fail:false,slow:false,remote:false};
 const pixel=p=>{const tall=p.includes('green'),blue=p.includes('blue');return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${tall?170:1100}" height="${tall?1100:700}"><rect width="100%" height="100%" fill="${tall?'lime':blue?'blue':'red'}"/></svg>`);};
 window.__TAURI_INTERNALS__={convertFileSrc:pixel,invoke:async(command,args={})=>{switch(command){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:1,indexing:false};case 'index_start':case 'debug_note':return;case 'app_info':return {version:'gallery-qa'};case 'get_logs':return {entries:[]};case 'list_dir':return {path:args.path,entries:m.entries};default:throw Error('Unmocked Rust '+command)}}};
 window.RHFilesNative={postMessage(raw){const {id,command,args={}}=JSON.parse(raw);m.calls.push({command,args});Promise.resolve().then(async()=>{switch(command){
 case 'capabilities':return {version:3,nativeBack:true};case 'groups.state':return {groups:[],deviceId:'0'.repeat(64),defaultDeviceName:'QA'};case 'theme':case 'permission':return true;case 'roots':return [{path:root,label:'内部存储'}];case 'shares':case 'connection.retired':return [];case 'fileServer.requested':return false;
 case 'delete.policy':return {recycle:true,kind:m.remote?'remote':'local',message:m.remote?'移入目标电脑的回收站。':'移入 RHFiles 回收站。'};
 case 'job.start':m.job={id:'delete-'+m.calls.length,state:'running',op:args.op,args:args.args,bytes:0,total:0,done:0,files:1,completed:[],outputs:[],failures:[]};return m.job.id;
 case 'job.status':{const j=m.job;if(m.slow)await new Promise(r=>setTimeout(r,400));j.state=m.fail?'failed':'completed';if(m.fail)j.failures=[{path:j.args.sources[0],message:'HTTP 403 拒绝删除'}];else{j.completed=j.args.sources;m.entries=m.entries.filter(e=>!j.completed.includes(e.path));j.done=1;}return j;}
 case 'jobs':return m.job?[m.job]:[];case 'connection.get':return {id:args.id,type:'rhfiles',name:'QA device',needsPassword:false};case 'media.image':return {dataUrl:pixel(args.path)};case 'list':return {path:args.path,entries:m.entries};default:throw Error('Unmocked native '+command);
 }}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const call=(name,args={})=>page.evaluate(({name,args})=>RHFilesAPI.invoke(name,args),{name,args});
async function ready(){await page.waitForFunction(()=>[...document.querySelectorAll('.gallery-page img')].every(i=>i.complete&&i.naturalWidth>0));}
async function checkPixels(label){
 await ready();const screenshot=await page.screenshot();
 const result=await page.evaluate(async base64=>{
  const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const view=document.querySelector('.media-viewport').getBoundingClientRect(),y=Math.round(view.y+view.height/2),data=ctx.getImageData(0,y,canvas.width,1).data;
  let longest=0,run=0;for(let x=Math.ceil(view.left)+2;x<Math.floor(view.right)-2;x++){const at=x*4,dark=Math.max(data[at],data[at+1],data[at+2])<60;if(dark){run++;longest=Math.max(longest,run);}else run=0;}
  return {longest,view:{width:view.width,height:view.height},pages:[...document.querySelectorAll('.gallery-page')].map(p=>({slot:p.dataset.slot,left:p.getBoundingClientRect().left,width:p.getBoundingClientRect().width,natural:p.querySelector('img').naturalWidth}))};
 },screenshot.toString('base64'));
 check(result.longest<=2,label+': no dark interval across actual screenshot pixels '+JSON.stringify(result));
}
try{
 await page.goto(fixture.url);await page.locator('[data-tile=storage-0]').waitFor();await call('navigation.open',{path:'/storage/emulated/0'});
 await page.locator('#filelist .name').getByText('wide-red.jpg',{exact:true}).click();await call('gallery.mode.set',{mode:'continuous'});await ready();
 const viewport=page.locator('.media-viewport');
 await viewport.dispatchEvent('pointerdown',{pointerId:10,pointerType:'touch',button:0,clientX:320,clientY:350});await viewport.dispatchEvent('pointermove',{pointerId:10,pointerType:'touch',button:0,clientX:180,clientY:350});await viewport.dispatchEvent('pointercancel',{pointerId:10,pointerType:'touch'});
 await checkPixels('mixed portrait and landscape continuous images');
 await call('gallery.control',{command:'zoomOut'});await checkPixels('scaled-down images remain edge-to-edge');await call('gallery.control',{command:'fit'});
 await call('gallery.control',{command:'rotate'});await checkPixels('rotated mixed continuous images');
 await page.setViewportSize({width:960,height:600});await page.waitForTimeout(100);await checkPixels('tablet landscape continuous images');
 await page.screenshot({path:'test-artifacts/android-gallery-055-continuous.png'});
 await page.setViewportSize({width:412,height:892});await call('gallery.seek',{index:1});
 await page.getByRole('button',{name:'图片更多选项',exact:true}).click();await page.locator('[data-media-action=delete]').click();await page.locator('[data-media-action=cancel-delete]').click();
 check((await call('gallery.state')).count===3&&await page.evaluate(()=>!__galleryQA.calls.some(c=>c.command==='job.start')),'cancel preserves the image and starts no deletion');
 await page.getByRole('button',{name:'图片更多选项',exact:true}).click();await page.locator('[data-media-action=delete]').click();const lockedPath=(await call('gallery.state')).path;
 await page.keyboard.press('ArrowRight');await page.keyboard.press(' ');
 await page.waitForFunction(()=>!document.querySelector('dialog'));await page.waitForFunction(()=>document.querySelector('#viewer-filename')?.textContent==='wide-red.jpg');
 check(lockedPath.includes('tall-green')&&(await call('gallery.state')).path!==lockedPath,'dialog keyboard input confirms its captured image without navigating or starting auto scroll');
 await page.waitForFunction(()=>document.querySelector('#viewer-filename')?.textContent==='wide-red.jpg');
 check((await call('gallery.state')).count===2,'continuous deletion advances to the next image and removes only the confirmed one');
 check(await page.evaluate(()=>__galleryQA.calls.find(c=>c.command==='job.start').args.op==='trash'),'local image deletion uses the existing recoverable background trash job');
 await call('gallery.mode.set',{mode:'paged'});await page.evaluate(()=>__galleryQA.fail=true);const pathBefore=(await call('gallery.state')).path;
 await page.getByRole('button',{name:'图片更多选项',exact:true}).click();await page.locator('[data-media-action=delete]').click();await page.locator('[data-media-action=confirm-delete]').click();await page.waitForTimeout(200);
 check((await call('gallery.state')).path===pathBefore&&(await call('gallery.state')).count===2,'failed deletion keeps the current image and queue');
 await page.evaluate(()=>{ui.closeSheet();__galleryQA.fail=false;__galleryQA.remote=true;for(const e of __galleryQA.entries){e.path='remote://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/Files/'+e.name;e.revision='selected-revision';}});
 await call('navigation.open',{path:'remote://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/Files'});await page.locator('#filelist .name').getByText('wide-red.jpg',{exact:true}).click();
 await page.getByRole('button',{name:'图片更多选项',exact:true}).click();await page.locator('[data-media-action=delete]').click();await page.locator('[data-media-action=confirm-delete]').click();await page.waitForFunction(()=>document.querySelector('#viewer-filename')?.textContent==='blue.jpg');
 check(await page.evaluate(()=>{const args=__galleryQA.calls.filter(c=>c.command==='job.start').at(-1).args.args;return args.permanent===false&&Object.values(args.revisions)[0]==='selected-revision';}),'remote gallery deletion uses server recycle and the selected revision, without silently requesting permanent deletion');
 await page.getByRole('button',{name:'图片更多选项',exact:true}).click();await page.locator('[data-media-action=delete]').click();await page.locator('[data-media-action=confirm-delete]').click();await page.waitForFunction(()=>!document.querySelector('#viewer-filename'));
 check(!(await call('gallery.state')).open,'deleting the last image closes the viewer');
 check(errors.length===0,'no unhandled browser errors: '+errors.join(';'));console.log('PASS '+checks+' gallery deletion and actual continuous pixel checks');
}catch(error){console.error(JSON.stringify(await page.evaluate(()=>({state:androidGallery.state(),calls:__galleryQA.calls.slice(-14),toast:document.querySelector('#toast')?.textContent,banner:document.querySelector('#banner')?.textContent})),null,2));throw error;}finally{await context.close();await fixture.close();}
