// Real native bridge/filesystem and Android WebViews. Emulator only.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {once} from 'node:events';import {crc32} from 'node:zlib';
import {androidSession,until,pause} from './testing/android-session.mjs';import {epub,mobi} from '../android/reader/tests/fixtures.mjs';
const session=await androidSession(undefined,{size:'1280x1100',density:160,notifications:true});const {adb,evaluate,send,artifactDir}=session;let checks=0,readerSocket,readerPort;
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label)};
const js=async(index,expression)=>evaluate(`(()=>{const win=document.querySelectorAll('.file-pane')[${index}].contentWindow;return (function(){${expression}}).call(win)})()`);
const tap=async(index,selector,hold=0)=>{
  const point=await evaluate(`(()=>{const frame=document.querySelectorAll('.file-pane')[${index}],element=frame.contentDocument.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const a=frame.getBoundingClientRect(),b=element.getBoundingClientRect();return{x:a.x+b.x+b.width/2,y:a.y+b.y+b.height/2,dpr:devicePixelRatio,width:innerWidth,height:innerHeight}})()`);
  console.log('tap',index,selector,point);
  const x=String(Math.round(point.x)),y=String(Math.round(point.y));
  if(point.x<=0||point.y<=0)throw Error('Cannot tap hidden control: '+selector);
  if(hold)adb('shell','input','swipe',x,y,x,y,String(hold));else adb('shell','input','tap',x,y);await pause(250);
};
const wait=async(index,selector)=>until(()=>js(index,`return !!this.document.querySelector(${JSON.stringify(selector)});`),selector,40000);
function zip(entries){const local=[],central=[];let offset=0;for(const[name,data]of entries){const filename=Buffer.from(name),checksum=crc32(data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(checksum,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26);local.push(h,filename,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(checksum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=h.length+filename.length+data.length;}const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);}
async function reader(){
  const pid=await until(()=>adb('shell','pidof','com.railgunhamster.rhfiles:ebook'),'ebook process');readerPort=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+readerPort+'/json')).json();return pages.find(p=>/ebook\.rhfiles\.local/.test(p.url));},'ebook WebView');readerSocket=new WebSocket(target.webSocketDebuggerUrl);await once(readerSocket,'open');let id=0;const pending=new Map();readerSocket.addEventListener('message',event=>{const m=JSON.parse(event.data);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  return async expression=>{const result=await new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});readerSocket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));setTimeout(()=>{if(pending.delete(request))reject(Error('Reader command timed out'));},10000).unref();});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
}
try{
  await until(()=>evaluate('document.querySelectorAll(".file-pane").length===2&&[...document.querySelectorAll(".file-pane")].every(f=>!!f.contentWindow.rhfilesPane)'),'two panes',60000);
  await evaluate(`document.querySelectorAll('.file-pane').forEach(frame=>{frame.contentWindow.qaTouches=[];for(const type of ['pointerdown','pointerup','click','touchstart','touchend'])frame.contentDocument.addEventListener(type,e=>{frame.contentWindow.qaTouches.push({type,target:e.target.closest('button')?.id||e.target.closest('button')?.textContent||e.target.dataset.path,x:e.clientX??e.changedTouches?.[0]?.clientX,y:e.clientY??e.changedTouches?.[0]?.clientY});if(frame.contentWindow.qaTouches.length>40)frame.contentWindow.qaTouches.shift();},true);})`);
  const name='RHFiles-Panes-QA-'+Date.now(),dir='/sdcard/Download/'+name;
  adb('shell','mkdir','-p',dir+'/Bundle/Nested',dir+'/Target/Bundle');
  for(const[file,bytes]of[['copy.txt',Buffer.from('copy source')],['move.txt',Buffer.from('move source')],['keep.txt',Buffer.from('existing target')],['nested.txt',Buffer.from('nested source')],['zero',Buffer.alloc(0)],['test.epub',zip(epub)],['test.mobi',mobi()]]){const local=path.join(artifactDir,file);fs.writeFileSync(local,bytes);const destination=file==='keep.txt'?dir+'/Target/Bundle/'+file:file==='nested.txt'||file==='zero'?dir+'/Bundle/Nested/'+file:dir+'/'+file;adb('push',local,destination);}
  await tap(0,'[data-tile="downloads"]');await wait(0,`[data-path$="/${name}"]`);await tap(0,`[data-path$="/${name}"]`);
  check(await js(1,'return !this.document.getElementById("home").hidden;'),'real bridge retains independent second Home');
  await tap(1,'[data-tile="downloads"]');await wait(1,`[data-path$="/${name}"]`);await tap(1,`[data-path$="/${name}"]`);await wait(1,'[data-path$="/Target"]');await tap(1,'[data-path$="/Target"]');
  await wait(0,'[data-path$="/copy.txt"]');await pause(1000);await tap(0,'[data-path$="/copy.txt"]',800);await until(()=>js(0,'return !this.document.getElementById("pane-transfer-actions").hidden;'),'copy selection');await tap(0,'#copy-to-pane');
  check((await js(0,'return this.document.getElementById("sheet").innerText;')).includes(name+'/Target'),'actual confirmation contains peer destination');await tap(0,'#sheet .sheet-item');
  await pause(500);console.log('copy diagnosis',await js(0,'return {sheet:this.document.getElementById("sheet").hidden,task:this.document.getElementById("task-label").textContent,toast:this.document.getElementById("toast").textContent,touches:this.qaTouches};'));
  await until(()=>adb('shell','cat',dir+'/Target/copy.txt')==='copy source','real copied bytes');await until(()=>js(0,'return this.document.getElementById("task-bar").hidden;'),'copy task settled');check(adb('shell','cat',dir+'/copy.txt')==='copy source','copy preserves actual source');
  await pause(1000);await tap(0,'[data-path$="/move.txt"]',800);await until(()=>js(0,'return !this.document.getElementById("pane-transfer-actions").hidden;'),'move selection');await tap(0,'#move-to-pane');await tap(0,'#sheet .sheet-item');await until(()=>adb('shell','cat',dir+'/Target/move.txt')==='move source','real moved bytes');await until(()=>js(0,'return this.document.getElementById("task-bar").hidden;'),'move settled');check(adb('shell',`test ! -e '${dir}/move.txt' && echo absent`)==='absent','move removes actual source after publishing destination');
  await pause(1000);await tap(0,'[data-path$="/Bundle"]',800);await until(()=>js(0,'return !this.document.getElementById("pane-transfer-actions").hidden;'),'folder selection');await tap(0,'#copy-to-pane');await tap(0,'#sheet .sheet-item');await until(()=>adb('shell','cat',dir+'/Target/Bundle/Nested/nested.txt')==='nested source','recursive folder copy');await until(()=>js(0,'return this.document.getElementById("task-bar").hidden;'),'folder task settled');check(adb('shell','cat',dir+'/Target/Bundle/keep.txt')==='existing target','folder merge preserves existing children');
  check(adb('shell',`test -f '${dir}/Target/Bundle/Nested/zero' && echo yes`)==='yes','zero-byte nested file survives folder copy');
  await session.click('.pane-divider button');await session.click('[data-layout=rows]');await pause(300);check(await evaluate('document.getElementById("workbench").dataset.mode')==='rows','actual divider switches to stacked panes');
  await session.screenshot('dual-pane-rows');
  await session.click('.pane-divider button');await session.click('[data-layout=columns]');await pause(300);await session.screenshot('dual-pane-columns');
  for(const extension of ['epub','mobi']){
    await tap(0,`[data-path$="/test.${extension}"]`);const read=await reader();
    await until(()=>read('document.getElementById("status").hidden || document.getElementById("status").classList.contains("failed")'),'native book loaded',40000);
    const status=await read('document.getElementById("status").innerText');check(await read('document.getElementById("status").hidden'),extension+' native bounded loader renders: '+status);
    check(!await read('!!window.RHFilesNative || !!window.__TAURI_INTERNALS__'),'reader has no file-manager IPC');
    if(extension==='epub')check(!await read('!!window.__bookScriptRan'),'native CSP/sandbox prevents book scripts');
    await session.screenshot('reader-'+extension);readerSocket.close();readerSocket=null;adb('forward','--remove','tcp:'+readerPort);readerPort=null;
    adb('shell','input','keyevent','4');await pause(500);
  }
  check((await js(1,'return this.document.getElementById("title").textContent;'))==='Target','native readers return to unchanged peer pane');
  console.log('PASS '+checks+' native Android checks; artifacts '+artifactDir);
}catch(error){await session.screenshot('failure').catch(()=>{});throw error;}finally{readerSocket?.close();if(readerPort)adb('forward','--remove','tcp:'+readerPort);adb('shell','wm','size','reset');adb('shell','wm','density','reset');session.close();}
