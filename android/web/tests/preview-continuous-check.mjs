import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';
import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve('android/web')),context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
const errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(fixture.url))external.push(request.url());});
let checks=0;const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);};
await context.addInitScript(()=>{
  const local='/storage/emulated/0',remote='remote://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/',pixel='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="teal"/></svg>');
  const entry=(name,kind,parent)=>({name,kind,path:parent+'/'+name,isDir:false,size:1024,modifiedMs:1});
  const m=window.__previewQA={calls:[],remote,local,job:null,jobReads:0,texts:{'settings.json':'{"名字":"测试","items":[1,2]}','notes.md':'# 中文标题\n\n**粗体**\n\n| A | B |\n|---|---|\n|一|二|\n\n<script>window.__pwn=true</script>\n<img src="https://example.invalid/probe" onerror="window.__pwn=true">','huge.log':'中文日志\n'.repeat(100000),'delayed.json':'{"late":true}'}};
  m.entries=['a.jpg','b.jpg','c.jpg','d.jpg','e.jpg','f.jpg'].map(name=>entry(name,'image',local));m.remoteEntries=Object.keys(m.texts).map(name=>entry(name,'document',remote.slice(0,-1))).concat(entry('sample.apk','apk',remote.slice(0,-1)));
  window.__TAURI_INTERNALS__={convertFileSrc:()=>pixel,invoke:async(command,args={})=>{switch(command){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:1,indexing:false};case 'index_start':return;case 'app_info':return {version:'preview-qa'};case 'debug_note':return;case 'get_logs':return {entries:[]};case 'list_dir':return {path:args.path,entries:m.entries};default:throw Error('Unmocked Rust '+command)}}};
  window.RHFilesNative={postMessage(raw){const {id,command,args={}}=JSON.parse(raw);m.calls.push({command,args});Promise.resolve().then(async()=>{switch(command){
    case 'capabilities':return {version:3,nativeBack:true};case 'theme':case 'permission':return true;case 'roots':return [{path:local,label:'内部存储'},{path:remote,label:'QA 网络',network:true,provider:true,protocol:'rhfiles'}];case 'shares':case 'connection.retired':return [];case 'fileServer.requested':return false;
    case 'connection.get':return {id:args.id,type:'rhfiles',name:'QA 网络',needsPassword:false};case 'list':return {path:args.path,entries:m.remoteEntries};case 'media.image':return {dataUrl:pixel,width:400,height:700};
    case 'text.preview':{const name=args.path.split('/').pop();if(name==='delayed.json')await new Promise(resolve=>setTimeout(resolve,500));const text=m.texts[name];if(text===undefined)throw Error('二进制文件');const bytes=new TextEncoder().encode(text),max=args.maxBytes||256*1024;return {text:new TextDecoder().decode(bytes.slice(0,max)),truncated:bytes.length>max,encoding:'UTF-8',bytesRead:Math.min(bytes.length,max),maxBytes:max};}
    case 'text.preview.cancel':return true;
    case 'job.start':m.jobReads=0;m.job={id:'cache-qa',op:args.op,args:args.args,state:'running',bytes:0,total:1024,done:0,files:1,current:'sample.apk',started:Date.now(),outputs:[],completed:[],failures:[]};return m.job.id;
    case 'job.status':{m.jobReads++;m.job.bytes=Math.min(1024,m.jobReads*400);if(m.jobReads>=3){m.job.state='completed';m.job.outputs=['/private/app-cache/sample.apk'];m.job.completed=[m.job.args.path];m.job.done=1;}return m.job;}
    case 'jobs':return m.job?[m.job]:[];case 'cache.install':return true;
    default:throw Error('Unmocked native '+command);
  }}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const call=(name,args={})=>page.evaluate(({name,args})=>RHFilesAPI.invoke(name,args),{name,args});
const remote='remote://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/';
try{
  await page.goto(fixture.url);await page.locator('[data-tile=storage-0]').waitFor();await call('navigation.open',{path:remote});
  await page.locator('#filelist .name').getByText('settings.json',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('.text-preview-source')?.textContent.includes('\n  "名字"'));
  check((await call('preview.text.state')).mode==='formatted','remote JSON is formatted through the viewing path');
  check(await page.evaluate(()=>!__previewQA.calls.some(row=>row.command==='job.start'||row.command==='read_text_preview')),'text viewing starts no download and uses the native storage adapter');
  await page.locator('[data-preview-action=mode]').click();check(await page.locator('.text-preview-source').textContent()==='{"名字":"测试","items":[1,2]}','original JSON remains available');
  await page.locator('[data-preview-action=close]').click();await page.locator('#filelist .name').getByText('notes.md',{exact:true}).click();await page.locator('.text-preview-markdown h1').waitFor();
  check(await page.locator('.text-preview-markdown table').count()===1,'Markdown headings, emphasis and GFM tables render');
  check(await page.locator('.text-preview-markdown script,.text-preview-markdown img,.text-preview-markdown iframe').count()===0&&await page.evaluate(()=>!window.__pwn)&&!external.length,'Markdown cannot execute HTML or fetch external images');
  fs.mkdirSync('test-artifacts/android-preview-049-browser',{recursive:true});await page.screenshot({path:'test-artifacts/android-preview-049-browser/markdown.png'});
  await page.locator('[data-preview-action=close]').click();await page.locator('#filelist .name').getByText('huge.log',{exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('.text-preview-source'));
  check((await call('preview.text.state')).truncated,'large remote text is bounded and identifies truncation');await page.locator('[data-preview-action=more]').click();await page.waitForFunction(()=>document.querySelector('[data-preview-action=more]').hidden);
  check(await page.evaluate(()=>__previewQA.calls.filter(row=>row.command==='text.preview').at(-1).args.maxBytes===1048576),'explicit read-more remains capped at one MB');
  await page.locator('[data-preview-action=close]').click();
  const slow=call('preview.text.open',{path:remote+'delayed.json',name:'delayed.json'});await page.locator('[data-preview-action=close]').click();await slow;
  check(!(await call('preview.text.state')).open&&await page.evaluate(()=>__previewQA.calls.some(row=>row.command==='text.preview.cancel')),'closing a pending preview cancels its request and ignores late data');
  await page.locator('#filelist .name').getByText('sample.apk',{exact:true}).click();await page.waitForFunction(()=>__previewQA.calls.some(row=>row.command==='cache.install'));
  check(await page.evaluate(()=>__previewQA.calls.find(row=>row.command==='job.start').args.op==='cache-open'),'APK uses a background cache task and then the system installer');await page.evaluate(()=>ui.closeSheet());
  await call('navigation.open',{path:'/storage/emulated/0'});await page.locator('#filelist .name').getByText('b.jpg',{exact:true}).click();
  check((await call('gallery.state')).mode==='paged','existing paged mode stays the default');await page.getByRole('button',{name:'连续浏览',exact:true}).click();await page.locator('.continuous-viewer').waitFor();
  const viewport=page.locator('.media-viewport');
  async function drag(dx,dy=0,cancel=false){await viewport.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',clientX:300,clientY:350,button:0});await viewport.dispatchEvent('pointermove',{pointerId:7,pointerType:'touch',clientX:300+dx,clientY:350+dy,button:0});await page.waitForTimeout(140);await viewport.dispatchEvent(cancel?'pointercancel':'pointerup',{pointerId:7,pointerType:'touch',clientX:300+dx,clientY:350+dy,button:0});}
  const before=await call('gallery.state');await drag(-75);const after=await call('gallery.state');await page.waitForTimeout(400);
  check(after.position>before.position&&after.position<before.position+1&&Math.abs(after.position-(await call('gallery.state')).position)<.001,'short continuous drags stop between pictures without snapping back');
  const gap=await page.evaluate(()=>{const a=document.querySelector('.gallery-page[data-relative="0"]').getBoundingClientRect(),b=document.querySelector('.gallery-page[data-relative="1"]').getBoundingClientRect();return b.left-a.right;});check(Math.abs(gap)<1,'adjacent image pages meet with no gap');
  check(await page.locator('.gallery-page').count()<=5,'continuous rendering keeps a bounded neighborhood');
  await call('gallery.control',{command:'zoomIn'});const zoomed=await call('gallery.state');await drag(-80);check((await call('gallery.state')).position===zoomed.position,'zoomed continuous images pan without changing pages');await call('gallery.control',{command:'fit'});
  const pos=(await call('gallery.state')).position;await drag(0,100);check((await call('gallery.state')).position===pos,'vertical motion does not move the horizontal canvas');
  await drag(-40,0,true);const cancelled=(await call('gallery.state')).position;await page.waitForTimeout(800);check((await call('gallery.state')).position===cancelled,'canceling stops all inertia at the current continuous position');
  await page.screenshot({path:'test-artifacts/android-preview-049-browser/continuous.png'});
  await page.getByRole('button',{name:'逐张翻页',exact:true}).click();check((await call('gallery.state')).mode==='paged','viewer can switch back while retaining the current file');
  await call('gallery.mode.set',{mode:'continuous'});await page.getByRole('button',{name:'返回文件列表',exact:true}).click();check(!(await call('gallery.state')).open,'closing clears the gallery session');
  await call('settings.open',{section:'display'});check(await page.locator('#image-browse-mode').inputValue()==='continuous','settings reflect the persisted gallery mode');
  check(await page.evaluate(()=>settingsData.snapshot(localStorage)['rhfiles.imageBrowseMode']==='continuous'),'full configuration backup includes image mode');await page.locator('#image-browse-mode').selectOption('paged');check(await page.evaluate(()=>localStorage.getItem('rhfiles.imageBrowseMode'))==='paged','settings can restore paged mode');
  check(errors.length===0,'no unhandled browser errors: '+errors.join(';'));console.log('PASS '+checks+' preview / continuous gallery checks (native I/O mocked)');
}catch(error){console.error(JSON.stringify({errors,state:await page.evaluate(()=>({gallery:androidGallery.state(),preview:androidTextPreview.state(),sheet:document.getElementById("sheet-panel").textContent,route:rhfilesPane.snapshot(),calls:__previewQA.calls.filter(row=>!["jobs","job.status"].includes(row.command)).slice(-15),job:__previewQA.job}))}));throw error;}finally{await context.close();await fixture.close();}
