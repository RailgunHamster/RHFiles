// Browser business coverage. The native bridge is mocked; APK playback is tested separately.
import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});const page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label)};
await context.addInitScript(()=>{
 const local='/storage/emulated/0',remote='remote://qa/',pixel='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
 const entry=(name,kind,parent=local)=>({name,kind,path:parent+name,isDir:kind==='folder',size:128,modifiedMs:1});
 const m=window.__media={calls:[],roots:[{path:local,label:'内部存储'},{path:remote,label:'家用 NAS',network:true,provider:true,protocol:'smb'}],files:{[local]:['a.jpg','b.jpg','c.jpg'].map(name=>entry(name,'image',local+'/')).concat(['a.mp4','b.mp4'].map(name=>entry(name,'video',local+'/'))),[remote]:[entry('相册','folder',remote)],[remote+'相册']:[entry('photo.jpg','image',remote+'相册/'),entry('a.mp4','video',remote+'相册/'),entry('b.mp4','video',remote+'相册/')]} };
 window.__TAURI_INTERNALS__={convertFileSrc:()=>pixel,invoke:async(cmd,args={})=>{switch(cmd){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:1,indexing:false};case 'app_info':return {version:'media-qa'};case 'debug_note':return;case 'list_dir':return {path:args.path,entries:m.files[args.path]||[]};case 'get_logs':return {entries:[]};default:throw Error('Unmocked Rust '+cmd)}}};
 window.RHFilesNative={postMessage(raw){const {id,command,args:a={}}=JSON.parse(raw);m.calls.push({command,args:a});Promise.resolve().then(()=>{switch(command){case 'capabilities':return {version:3,nativeBack:true,nativePlayback:true};case 'theme':case 'permission':return true;case 'roots':return m.roots;case 'shares':case 'jobs':return [];case 'connection.get':return {id:a.id,type:'smb',name:'家用 NAS',needsPassword:false,hasPassword:true};case 'list':return {path:a.path,entries:m.files[a.path]||[]};case 'media.play':return true;case 'media.image':return {dataUrl:pixel,width:1,height:1};case 'apps':return [{name:'真实应用',package:'qa.app',version:'1',apkBytes:32,updatedMs:1}];case 'app.icon':return {dataUrl:pixel};default:throw Error('Unmocked native '+command)}}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const name=(text)=>page.locator('#filelist .name').getByText(text,{exact:true});
async function drawer(){await page.locator('#btn-menu').click();await page.locator('#drawer').waitFor()}
async function touch(type,x,y){await page.evaluate(({type,x,y})=>{const target=document.querySelector('#content');const t=new Touch({identifier:9,target,clientX:x,clientY:y});target.dispatchEvent(new TouchEvent(type,{touches:type==='touchend'?[]:[t],changedTouches:[t],bubbles:true,cancelable:true}))},{type,x,y})}
try{
 await page.goto(fixture.url);await page.locator('[data-tile=storage-0]').waitFor();
 check(await page.locator('[data-tile^=storage-]').count()===1&&!((await page.locator('#home').innerText()).includes('家用 NAS')),'network storage is not duplicated on Home');
 await drawer();check(await page.locator('#roots button').allTextContents().then(a=>a.some(t=>t.includes('内部存储'))&&a.some(t=>t.includes('家用 NAS'))),'saved SMB sits alongside internal storage');
 await page.locator('#roots button').filter({hasText:'家用 NAS'}).click();await name('相册').click();await name('photo.jpg').waitFor();
 await page.locator('#btn-overflow').click();await page.getByRole('button',{name:'收藏此文件夹',exact:true}).click();
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites')).some(f=>f.path==='remote://qa/相册')),'SMB subfolders can be saved directly to quick access');
 await drawer();await page.locator('#nav-home').click();await drawer();await page.locator('#nav-favorites button').filter({hasText:'相册'}).click();await name('photo.jpg').waitFor();
 check(await page.evaluate(()=>rhfilesPane.snapshot().route.path)==='remote://qa/相册','quick access returns directly to the SMB subfolder');
 await name('a.mp4').click();const play=await page.evaluate(()=>__media.calls.filter(c=>c.command==='media.play').at(-1));
 check(play.args.queue.length===2&&play.args.queue.every(e=>e.path.startsWith('remote://')),'network video goes to native playback with its neighboring videos');
 await name('photo.jpg').click();await page.locator('.gallery-page[data-relative="0"] img').waitFor();await page.waitForFunction(()=>document.querySelector('.gallery-page[data-relative="0"] img').complete);
 check(await page.evaluate(()=>__media.calls.some(c=>c.command==='media.image'&&c.args.path.endsWith('/photo.jpg'))),'network image reads the preview directly');
 check(await page.evaluate(()=>!__media.calls.some(c=>c.command==='job.start')),'viewing network images/video never starts a copy task');
 await page.getByRole('button',{name:'返回文件列表',exact:true}).click();await drawer();await page.locator('#roots button').filter({hasText:'内部存储'}).click();await name('b.jpg').click();
 check(await page.locator('.gallery-page').count()===3,'gallery contains only current and adjacent pages');
 const viewport=page.locator('.media-viewport');await viewport.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:300,clientY:350,button:0});await viewport.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:180,clientY:351});
 const geometry=await page.evaluate(()=>{const c=document.querySelector('.gallery-page[data-relative="0"]').getBoundingClientRect(),n=document.querySelector('.gallery-page[data-relative="1"]').getBoundingClientRect();return {left:c.left,gap:n.left-c.right}});
 check(geometry.left<-90&&Math.abs(geometry.gap)<1,'pictures follow the finger while adjacent edges remain joined');
 await viewport.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:180,clientY:351});await page.waitForFunction(()=>document.querySelector('#viewer-filename').textContent==='c.jpg');check(true,'one-fifth swipe settles to the next picture');
 await page.getByRole('button',{name:'上一张',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#viewer-filename').textContent==='b.jpg');
 await viewport.dispatchEvent('pointerdown',{pointerId:2,pointerType:'touch',clientX:250,clientY:300});await viewport.dispatchEvent('pointermove',{pointerId:2,pointerType:'touch',clientX:210,clientY:301});await viewport.dispatchEvent('pointercancel',{pointerId:2,pointerType:'touch'});await page.waitForTimeout(300);
 check(await page.locator('#viewer-filename').innerText()==='b.jpg','canceled image swipe springs back without changing the file');
 await page.getByRole('button',{name:'放大',exact:true}).click();await viewport.dispatchEvent('pointerdown',{pointerId:3,pointerType:'touch',clientX:300,clientY:300});await viewport.dispatchEvent('pointermove',{pointerId:3,pointerType:'touch',clientX:100,clientY:300});await viewport.dispatchEvent('pointerup',{pointerId:3,pointerType:'touch',clientX:100,clientY:300});await page.waitForTimeout(300);
 check(await page.locator('#viewer-filename').innerText()==='b.jpg','zoomed image pans rather than accidentally switching files');
 await page.getByRole('button',{name:'返回文件列表',exact:true}).click();await touch('touchstart',80,300);await touch('touchmove',210,301);await touch('touchend',210,301);await page.locator('#drawer').waitFor();check(true,'right swipe opens drawer from inside a file folder');
 await page.locator('#nav-home').click();await page.locator('[data-tile=apps]').click();await page.locator('.application-icon img').waitFor();check(await page.evaluate(()=>__media.calls.some(c=>c.command==='app.icon'&&c.args.package==='qa.app')),'app manager lazily loads the package-specific native icon');
 await touch('touchstart',90,300);await touch('touchmove',220,302);await touch('touchend',220,302);await page.locator('#drawer').waitFor();check(true,'drawer is also available in application management');
 await page.locator('#nav-settings').click();await page.locator('#drawer').waitFor({state:'hidden'});await touch('touchstart',80,300);await touch('touchmove',85,500);await touch('touchend',85,500);check(await page.locator('#drawer').isHidden(),'vertical scrolling settings never opens the drawer');
 await touch('touchstart',80,300);await touch('touchmove',220,301);await touch('touchend',220,301);await page.locator('#drawer').waitFor();check(true,'drawer can be summoned in Settings');
 check(errors.length===0,'no unhandled frontend errors: '+errors.join(';'));console.log('PASS '+checks+' media UI checks (native bridge mocked)');
}finally{await context.close();await fixture.close()}
