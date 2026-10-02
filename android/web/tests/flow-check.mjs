// Touch-sized UI/business regression suite. IPC is mocked; this is not an APK test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
for (const name of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core','C:/Users/Administrator/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright'].filter(Boolean)) {
  try { pw=require(name); break; } catch {}
}
if (!pw) throw new Error('Playwright is required; skipping is not a pass.');
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(web,'tests','__screenshots__');fs.mkdirSync(output,{recursive:true});
let executablePath=process.env.CHROMIUM_PATH;
const cache=path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
if(!executablePath&&fs.existsSync(cache))executablePath=fs.readdirSync(cache).filter(n=>n.startsWith('chromium-')).sort().reverse().map(n=>path.join(cache,n,'chrome-win64','chrome.exe')).find(p=>fs.existsSync(p));
const server=http.createServer((req,res)=>{
  const target=path.resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(target!==web&&!target.startsWith(web+path.sep))return res.writeHead(403).end();
  if(req.url==='/favicon.ico')return res.writeHead(204).end();
  const file=target===web?path.join(web,'index.html'):target;
  fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]+'; charset=utf-8'}).end(data));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await pw.chromium.launch({headless:true,executablePath});
let checks=0;
function check(value,label){assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);}
function fixture({denied=false,partial=false}){
  const root='/storage/emulated/0';
  const file=(name,kind='document',size=10)=>({name,path:root+'/'+name,kind,isDir:kind==='folder',size,modifiedMs:1712345678000});
  const m=window.__model={calls:[],denied,partial,index:true,fs:{
    [root]:[file('DCIM','folder'),file('Download','folder'),file('Music','folder'),file('备份','folder'),file('notes.txt'),file('photo.jpg','image',2048),file('movie.mp4','video',5000),file('empty.txt','document',0),file('中文 文件.txt'),file('<img onerror=alert(1)>.txt'),file('.secret')],
    [root+'/Download']:[{...file('report.pdf'),path:root+'/Download/report.pdf'}],
    [root+'/DCIM']:Array.from({length:1000},(_,i)=>({...file('photo'+i+'.jpg','image',i*100),path:root+'/DCIM/photo'+i+'.jpg'})),
    [root+'/Music']:[],[root+'/备份']:[]
  }};
  const pixel='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  window.__TAURI_INTERNALS__={convertFileSrc:()=>pixel,invoke:async(cmd,args={})=>{
    m.calls.push({cmd,args});
    if(m.delay?.cmd===cmd&&(!m.delay.path||m.delay.path===args.path))await new Promise(resolve=>{m.release=resolve;});
    if(m.reject===cmd)throw 'fixture failure';
    switch(cmd){
      case 'debug_note':return;
      case 'get_permission_status':return {manageExternalStorage:!m.denied&&!m.partial,sharedStorageReadable:!m.denied,sharedStorageWritable:!m.denied&&!m.partial};
      case 'get_storage_roots':return [{path:root,label:'Internal storage',removable:false,totalBytes:128*1024**3,freeBytes:80*1024**3},{path:'/storage/ABCD-1234',label:'SD card',removable:true}];
      case 'index_status':return {entryCount:m.index?1010:0,lastFinishedMs:m.index?1712345678000:null,indexing:false,scannedDirs:10};
      case 'index_start':m.index=true;return {};
      case 'index_clear':m.index=false;return {};
      case 'list_dir':if(!m.fs[args.path])throw 'folder not found';return {path:args.path,parent:args.path.slice(0,args.path.lastIndexOf('/')),entries:structuredClone(m.fs[args.path]),dirCount:4,fileCount:6};
      case 'browse_library':{const entries=Object.values(m.fs).flat().filter(e=>!e.isDir&&(args.category==='recent'||e.kind===args.category)).slice(0,args.limit);return {entries,total:entries.length,totalBytes:1234,truncated:false};}
      case 'search_files':return Object.values(m.fs).flat().filter(e=>e.name.toLowerCase().includes(args.query.toLowerCase()));
      case 'app_info':return {version:'0.1.0-test',platform:'android'};
      case 'get_reverse_server_status':return {running:!!m.server,root,urls:m.server?['http://192.0.2.1:8765/']:[]};
      case 'start_reverse_server':m.server=true;return {};
      case 'stop_reverse_server':m.server=false;return {};
      case 'get_logs':return {entries:[{atMs:1712345678000,level:'info',scope:'test',message:'fixture ready'}]};
      case 'clear_logs':return;
      case 'scan_storage_sizes':return {totalBytes:1024,files:2,categories:[{name:'Images',bytes:1024,files:2}]};
      case 'read_thumbnail':return {dataUrl:pixel};
      case 'read_text_preview':return {text:'hello 中文',bytes:12,truncated:false};
      case 'copy_entries':case 'move_entries':{
        const moved=[],failures=[];
        for(const source of args.sources){
          if(m.failPath===source){failures.push({path:source,message:'权限不足'});continue;}
          const parent=source.slice(0,source.lastIndexOf('/')),entry=m.fs[parent].find(e=>e.path===source);
          if(!entry){failures.push({path:source,message:'missing'});continue;}
          const target=args.destination+'/'+entry.name;
          m.fs[args.destination].push({...entry,path:target});moved.push(target);
          if(cmd==='move_entries')m.fs[parent]=m.fs[parent].filter(e=>e.path!==source);
        }
        return {moved,failures,bytes:10,elapsedMs:100};
      }
      case 'rename_entry':{const parent=args.path.slice(0,args.path.lastIndexOf('/')),e=m.fs[parent].find(e=>e.path===args.path);e.name=args.newName;e.path=parent+'/'+args.newName;return e.path;}
      case 'create_directory':case 'create_file':{
        const p=args.parent+'/'+args.name;m.fs[args.parent].push({...file(args.name,cmd==='create_directory'?'folder':'document'),path:p});
        if(cmd==='create_directory')m.fs[p]=[];return p;
      }
      case 'delete_entries':for(const p of args.paths){const parent=p.slice(0,p.lastIndexOf('/'));m.fs[parent]=m.fs[parent].filter(e=>e.path!==p);}return {deleted:args.paths,failures:[]};
      default:throw 'Unstubbed command '+cmd;
    }
  }};
}
async function pageFor(options={}){
  const context=await browser.newContext({viewport:options.viewport||{width:360,height:800},isMobile:true,hasTouch:true,locale:'zh-CN'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(fixture,options);await page.goto('http://127.0.0.1:'+server.address().port);
  return {context,page,errors};
}
const tile=(p,id)=>p.locator('[data-tile="'+id+'"]');
const row=(p,name)=>p.locator('#filelist [data-path]').filter({has:p.locator('.name').filter({hasText:new RegExp('^'+name.replace(/[.*+?^{}()|[\]\\$]/g,'\\$&')+'$')})});
async function home(p){await p.click('#btn-menu');await p.click('#nav-home');await p.waitForSelector('#home:not([hidden])');}
async function storage(p){await home(p);await tile(p,'storage-0').click();await p.waitForSelector('#filelist .name');}
async function more(p,name){await row(p,name).locator('.entry-more').click();await p.waitForSelector('#sheet:not([hidden])');}
async function choose(p,label){await p.getByRole('button',{name:label,exact:true}).click();}
async function press(p,name){await row(p,name).scrollIntoViewIfNeeded();const b=await row(p,name).boundingBox();await p.mouse.move(b.x+80,b.y+25);await p.mouse.down();await p.waitForTimeout(510);await p.mouse.up();await p.waitForSelector('#selection-bar:not([hidden])');}
async function capture(p,name){await p.screenshot({path:path.join(output,name+'.png')});}
try{
  const {context,page:p,errors}=await pageFor();await tile(p,'storage-0').waitFor();
  check(await p.locator('.home-tile').count()===13,'Home exposes working destinations');
  check(await p.locator('.home-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)===3,'Phone home has three columns');
  check((await tile(p,'storage-0').innerText()).includes('48 GB / 128 GB'),'Capacity uses actual root metadata');
  check(!await p.locator('#btn-reindex').isVisible(),'Index maintenance is outside navigation');
  await capture(p,'plus-home');await tile(p,'storage-0').click();await p.waitForSelector('#filelist .name');
  check(await p.locator('#title').innerText()==='内部存储','Friendly storage title');
  check(!(await p.locator('#crumbs').innerText()).includes('emulated'),'Named breadcrumb root');
  check(await p.locator('#filelist .name').count()===10,'Hidden filtering preserves zero-byte/Unicode files');
  check(await p.locator('#filelist .check:visible').count()===0,'Checkboxes appear only during selection');
  check(await p.locator('#filelist img[onerror]').count()===0,'File names cannot inject HTML');
  await capture(p,'plus-folder');
  await row(p,'notes.txt').click();await p.waitForSelector('#sheet-panel pre');
  check((await p.locator('#sheet-panel pre').innerText()).includes('hello'),'Text tap previews directly');
  await p.goBack();await p.waitForFunction(()=>document.getElementById('sheet').hidden);
  check(await p.locator('#filelist').isVisible(),'Back closes preview before navigating');
  await press(p,'notes.txt');await p.waitForSelector('#selection-bar:not([hidden])');await row(p,'中文 文件.txt').click();
  check(await p.locator('#sel-count').innerText()==='已选择 2 项','Long press and subsequent tap multiselect');
  check(await p.locator('[data-action="rename"]').isDisabled(),'Multi-rename is not misleadingly enabled');
  await capture(p,'plus-selection');await p.click('[data-action="copy"]');
  check(await p.locator('#paste-bar').isVisible(),'Copy immediately shows persistent destination bar');
  await row(p,'备份').click();
  check((await p.locator('#paste-destination').innerText()).includes('备份'),'Paste destination follows navigation');
  await capture(p,'plus-paste');await p.click('#btn-paste');await p.waitForFunction(()=>document.getElementById('task-bar').hidden);
  check(await p.locator('#filelist .name').count()===2,'All selected files copied to destination');
  check(await p.locator('#paste-bar').isHidden(),'Completed paste clears pending operation');
  await storage(p);await more(p,'notes.txt');await choose(p,'移动');await row(p,'备份').click();
  await p.goBack();await p.waitForFunction(()=>document.getElementById('title').textContent==='内部存储');
  check(await p.locator('#paste-bar').isVisible(),'Back preserves pending operation');await p.click('#btn-cancel-paste');
  check(await p.locator('.pending-cut').count()===0,'Cancel restores cut visuals');
  await press(p,'notes.txt');await row(p,'中文 文件.txt').click();await p.click('[data-action="cut"]');
  await p.evaluate(()=>window.__model.failPath='/storage/emulated/0/中文 文件.txt');await row(p,'备份').click();await p.click('#btn-paste');await p.waitForSelector('#sheet:not([hidden])');
  check((await p.locator('#paste-label').innerText()).includes('1 项'),'Partial move retains failed sources for retry');
  check((await p.locator('#sheet-panel').innerText()).includes('权限不足'),'Per-file errors visible');await choose(p,'关闭');await p.click('#btn-cancel-paste');await storage(p);
  check(await row(p,'中文 文件.txt').count()===1,'Failed move leaves source');
  check(await row(p,'notes.txt').count()===0,'Successful move removes source');
  await more(p,'中文 文件.txt');await choose(p,'删除');await p.goBack();await p.waitForFunction(()=>document.getElementById('sheet').hidden);
  check(await p.evaluate(()=>!window.__model.calls.some(c=>c.cmd==='delete_entries')),'Back dismissing confirmation never deletes');
  await more(p,'中文 文件.txt');await choose(p,'重命名');await p.locator('.sheet-form input').fill('改名.txt');await p.locator('.sheet-form button[type=submit]').click();await row(p,'改名.txt').waitFor();
  check(true,'Rename refreshes directory');
  await more(p,'改名.txt');await choose(p,'删除');await choose(p,'永久删除');await p.waitForFunction(()=>document.getElementById('task-bar').hidden);
  check(await row(p,'改名.txt').count()===0,'Confirmed deletion removes selected entry');
  await p.click('#btn-new');await choose(p,'文件夹');await p.locator('.sheet-form input').fill('新目录');await p.locator('.sheet-form button[type=submit]').click();await row(p,'新目录').waitFor();
  check(true,'New folder is a direct browser action');
  await more(p,'Download');await choose(p,'添加到收藏');await home(p);await tile(p,'favorites').click();await row(p,'Download').waitFor();
  check(true,'Favorites are reachable from Home');await p.reload();await tile(p,'favorites').click();await row(p,'Download').waitFor();check(true,'Favorites survive reload');
  await row(p,'Download').click();await p.waitForSelector('#filelist .name');await p.click('#btn-search');await p.locator('#search-input').fill('report');await p.waitForSelector('#filelist .name');
  check(await p.locator('#search-scope').innerText()==='当前文件夹','Folder search defaults local');
  check(await p.evaluate(()=>!window.__model.calls.some(c=>c.cmd==='search_files')),'Local search needs no global index');
  await p.click('#search-scope');await p.waitForFunction(()=>window.__model.calls.some(c=>c.cmd==='search_files'));check(true,'Global search is explicit');
  await p.click('#btn-search-close');await p.waitForFunction(()=>document.getElementById('title').textContent==='Download');check(true,'Closing search restores source');
  await storage(p);await p.click('#btn-sort');await choose(p,'大小（大到小）');await press(p,'movie.mp4');
  check((await p.locator('.selected .name').innerText())==='movie.mp4','Selection follows paths after sorting');await p.click('#sel-close');
  await row(p,'DCIM').click();await p.waitForSelector('#filelist .name');await p.click('#btn-view');await choose(p,'网格');await p.waitForSelector('.cell');
  const cells=await p.locator('.cell').evaluateAll(ns=>ns.slice(0,4).map(n=>({x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight})));
  check(cells[0].y===cells[1].y&&cells[1].x>=cells[0].x+cells[0].w,'Grid cells are side-by-side');
  check(cells[3].y>=cells[0].y+cells[0].h,'Grid row height matches virtualization');
  check(await p.locator('.cell').count()<80,'1000-entry directory is virtualized');
  await p.locator('#filelist').evaluate(e=>{e.scrollTop=12000;});await p.waitForTimeout(120);check(await p.locator('.cell').count()<80,'Scrolling stays bounded');
  await home(p);await p.goBack();await p.waitForSelector('.cell');
  check(await p.locator('#filelist').evaluate(e=>e.scrollTop>10000),'Returning to a large directory restores scroll position');
  await p.locator('#filelist').evaluate(e=>{e.scrollTop=0;});await p.waitForTimeout(80);await capture(p,'plus-grid');
  await home(p);await tile(p,'image').click();await p.waitForSelector('#filelist .name');check(await p.evaluate(()=>window.__model.calls.some(c=>c.cmd==='browse_library'&&c.args.category==='image')),'Image category invokes bounded library');
  await home(p);await p.evaluate(()=>window.__model.index=false);await tile(p,'audio').click();await p.getByRole('button',{name:'建立索引',exact:true}).waitFor();check(true,'No index has actionable empty state');
  await home(p);await tile(p,'settings').click();await p.waitForSelector('#tool-settings:not([hidden])');check((await p.locator('#permissions').innerText()).includes('已获得'),'Settings reports permissions');
  await p.click('summary');await p.click('#btn-refresh-logs');await p.waitForFunction(()=>document.getElementById('log-view').textContent.includes('fixture ready'));check(true,'Diagnostics work inside settings');
  await p.click('#btn-theme');await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');check(true,'Theme can change');
  await home(p);await capture(p,'plus-dark');await tile(p,'server').click();await p.click('#btn-server-toggle');await choose(p,'取消');check(await p.evaluate(()=>!window.__model.server),'LAN server requires confirmation');
  await p.click('#btn-server-toggle');await choose(p,'启动');await p.waitForFunction(()=>document.getElementById('server-status').textContent.includes('192.0.2.1'));check(true,'Server address visible');
  await p.click('#btn-server-toggle');check(await p.evaluate(()=>!window.__model.server),'Server can stop');
  await home(p);await tile(p,'usage').click();await p.click('#btn-scan');await p.waitForFunction(()=>document.getElementById('scan-result').textContent.includes('1.0 KB'));check(true,'Dedicated storage analysis works');
  check(errors.length===0,'No uncaught errors: '+errors.join(';'));await context.close();
  {
    const {context,page:p,errors}=await pageFor();await tile(p,'storage-0').waitFor();await storage(p);
    await p.evaluate(()=>{window.__model.delay={cmd:'list_dir',path:'/storage/emulated/0/Download'};});
    await row(p,'Download').click();await p.waitForFunction(()=>!!window.__model.release);
    await home(p);await p.evaluate(()=>{window.__model.delay=null;window.__model.release();});await p.waitForTimeout(80);
    check(await p.locator('#home').isVisible()&&await p.locator('#filelist').isHidden(),'Late directory response cannot replace Home');
    await storage(p);await more(p,'notes.txt');await choose(p,'复制');await row(p,'备份').click();
    await p.evaluate(()=>window.__model.reject='copy_entries');await p.click('#btn-paste');await p.waitForFunction(()=>document.getElementById('task-bar').hidden);
    check(await p.locator('#paste-bar').isVisible(),'Rejected transfer preserves clipboard for retry');
    check((await p.locator('#toast').innerText()).includes('fixture failure'),'Rejected transfer surfaces backend reason');
    await p.evaluate(()=>{window.__model.reject=null;window.__model.delay={cmd:'copy_entries'};});await p.click('#btn-paste');await p.waitForFunction(()=>!!window.__model.release);
    await home(p);check(await p.locator('#task-bar').isVisible(),'Active task remains visible while browsing elsewhere');
    await p.evaluate(()=>{window.__model.delay=null;window.__model.release();});await p.waitForFunction(()=>document.getElementById('task-bar').hidden);
    check(await p.locator('#home').isVisible(),'Task completion does not yank navigation back to destination');
    await p.click('#btn-search');await p.evaluate(()=>window.__model.delay={cmd:'search_files'});await p.locator('#search-input').fill('notes');
    await p.waitForFunction(()=>window.__model.calls.some(c=>c.cmd==='search_files'));
    await p.evaluate(()=>{window.__oldSearch=window.__model.release;window.__model.delay=null;});await p.locator('#search-input').fill('photo');await p.waitForSelector('#filelist .name');
    await p.evaluate(()=>window.__oldSearch());await p.waitForTimeout(100);
    check((await p.locator('#filelist .name').allTextContents()).every(n=>n.includes('photo')),'Older search response cannot replace newer results');
    check(errors.length===0,'Race and failure paths have no uncaught errors');await context.close();
  }
  {
    const {context,page:p,errors}=await pageFor();await tile(p,'storage-0').waitFor();
    await p.evaluate(()=>{window.__nativeCalls=[];window.RHFilesNative={postMessage(message){const request=JSON.parse(message);window.__nativeCalls.push(request);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:request.id,result:true})}));}};});
    await storage(p);await row(p,'Download').click();await row(p,'report.pdf').click();
    check(await p.evaluate(()=>window.__nativeCalls.some(c=>c.command==='open'&&c.args.path.endsWith('/report.pdf'))),'PDF tap delegates to Android open-with instead of text preview');
    await more(p,'report.pdf');await choose(p,'分享');
    check(await p.evaluate(()=>window.__nativeCalls.some(c=>c.command==='share'&&c.args.path.endsWith('/report.pdf'))),'Share delegates to native Android chooser bridge');
    await home(p);await tile(p,'settings').click();await p.click('#btn-theme');
    check(await p.evaluate(()=>window.__nativeCalls.some(c=>c.command==='theme'&&c.args.dark===true)),'Theme changes update native system-bar appearance');
    check(errors.length===0,'Native-bridge frontend paths have no errors (bridge mocked)');await context.close();
  }
  for(const options of [{denied:true},{partial:true},{viewport:{width:320,height:640}},{viewport:{width:800,height:1000}}]){
    const {context,page:p,errors}=await pageFor(options);
    if(options.denied){
      await p.waitForSelector('.blocked');check(await p.locator('#filelist').isHidden(),'Permission gate replaces fake empty folder');
      await p.evaluate(()=>window.__model.denied=false);await choose(p,'重新检查');await tile(p,'storage-0').waitFor();check(true,'Permission retry recovers Home');
    }else{
      await tile(p,'storage-0').waitFor();
      if(options.partial)check(await p.locator('#banner').isVisible(),'Partial permission warning persists');
      else{
        check(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'No horizontal Home overflow at '+options.viewport.width);
        await tile(p,'storage-0').click();await p.waitForSelector('#filelist .name');await press(p,'notes.txt');
        check(await p.locator('#selection-bar').isVisible()&&await p.locator('#selection-bar').evaluate(e=>e.scrollWidth<=e.clientWidth),'Visible selection toolbar fits '+options.viewport.width);await capture(p,'plus-'+options.viewport.width);
      }
    }
    check(errors.length===0,'Responsive/permission scenario has no errors');await context.close();
  }
  console.log('PASS: '+checks+' assertions. IPC mocked. Screenshots: '+output);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
