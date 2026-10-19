// Browser scheduling/transaction business coverage; real HTTP/crypto has native tests.
import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label)};
await page.clock.install();
await context.addInitScript(()=>{
 const m=window.__sync={runs:0,applies:0,calls:[],rollback:null,config:{enabled:false,url:'https://nas.example/dav/',username:'qa',insecure:false,hasPassword:false},state:'idle',lastSuccess:0,conflicts:[]};
 const shared={name:'相册',label:'云端收藏',path:'remote://11111111-1111-4111-8111-111111111111/photos',isDir:true};
 localStorage.setItem('rhfiles.favorites',JSON.stringify([{name:'本机目录',path:'/storage/emulated/0/Download',isDir:true}]));
 const status=()=>({config:{...m.config},state:m.state,lastSuccess:m.lastSuccess,conflicts:m.conflicts,conflictToken:'conflict-token',message:m.message||''});
 window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:0,indexing:false};case 'app_info':return {version:'sync-qa'};case 'debug_note':return;default:throw Error('Unmocked Rust '+command)}}};
 window.RHFilesNative={postMessage(raw){const{id,command,args:a={}}=JSON.parse(raw);m.calls.push({command,args:a});Promise.resolve().then(async()=>{switch(command){
 case 'capabilities':return {version:3,nativeBack:true,configSync:true};case 'roots':return [{path:'/storage/emulated/0',label:'内部存储'}];case 'theme':case 'permission':return true;case 'shares':case 'jobs':return [];
 case 'sync.rollbackWeb':return m.rollback;case 'sync.rollbackAck':m.rollback=null;return true;
 case 'sync.status':return status();
 case 'sync.save':m.config={...a,hasPassword:!!a.password||m.config.hasPassword};delete m.config.password;delete m.config.clearPassword;m.state='idle';return status();
 case 'sync.run':m.runs++;m.before=a.web['rhfiles.favorites'];if(m.delay)await new Promise(resolve=>m.release=resolve);if(m.conflict&&!a.choice){m.state='conflict';m.conflicts=[{kind:'favorites',id:shared.path,local:shared,remote:{...shared,label:'另一别名'}}];return status()}m.state='ready';m.conflicts=[];return {...status(),proposalId:'proposal-1'};
 case 'sync.apply':if(a.web['rhfiles.favorites']!==m.before){m.state='failed';m.message='收藏已改变，未覆盖';throw Error(m.message)}m.applies++;m.previous=m.before;const values=JSON.parse(m.before).filter(f=>!f.path.startsWith('remote://'));values.push(shared);m.after=JSON.stringify(values);if(m.changeDuringApply)localStorage.setItem('rhfiles.favorites',JSON.stringify([{name:'刚修改',path:'/storage/new',isDir:true}]));return {id:'proposal-1',favorites:values};
 case 'sync.ack':m.state='success';m.lastSuccess=Date.now();return status();
 case 'sync.rollback':m.rollback={favorites:m.previous,after:m.after};m.state='failed';return m.rollback;
 default:throw Error('Unmocked native '+command)
 }}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const button=name=>page.getByRole('button',{name,exact:true});
async function elapsed(ms){await page.clock.runFor(ms)}
try{
 await page.goto(fixture.url);await page.locator('[data-tile=settings]').click();await page.locator('[data-settings-section=sync]').click();await page.locator('#sync-now').waitFor();await elapsed(500);
 check(await page.evaluate(()=>__sync.runs===0),'automatic sync defaults off and makes no run request on startup/Settings');
 await button('立即同步').click();await page.waitForFunction(()=>__sync.state==='success');
 check(await page.evaluate(()=>{const f=JSON.parse(localStorage.getItem('rhfiles.favorites'));return f.some(x=>x.path==='/storage/emulated/0/Download')&&f.some(x=>x.label==='云端收藏')}),'manual sync works while auto is off and preserves local-only favorites');
 check(await page.locator('#sync-state').innerText().then(s=>s.includes('上次完成')),'successful sync exposes a persistent completion time');
 const form=page.locator('#config-sync form');await form.locator('[name=password]').fill('webdav-password');await form.locator('[name=enabled]').check();await button('保存同步设置').click();await elapsed(250);await page.waitForFunction(()=>__sync.runs>=2);
 check(await form.locator('[name=password]').inputValue()===''&&!await page.evaluate(()=>JSON.stringify(localStorage).includes('webdav-password')),'password input is cleared after save and never persisted in web storage');
 await page.evaluate(()=>window.dispatchEvent(new Event('rhfiles-config-changed')));const before=await page.evaluate(()=>__sync.runs);await elapsed(1900);await page.waitForFunction(n=>__sync.runs>n,before);check(true,'portable edits trigger debounced auto sync');
 const periodic=await page.evaluate(()=>__sync.runs);await elapsed(300100);await page.waitForFunction(n=>__sync.runs>n,periodic);check(true,'five-minute foreground timer performs automatic synchronization');
 await form.locator('[name=enabled]').uncheck();await button('保存同步设置').click();const disabled=await page.evaluate(()=>__sync.runs);await page.evaluate(()=>window.dispatchEvent(new Event('rhfiles-config-changed')));await elapsed(300100);check(await page.evaluate(n=>__sync.runs===n,disabled),'disabled auto sync ignores both config events and periodic ticks');
 await page.evaluate(()=>__sync.conflict=true);await button('立即同步').click();await page.locator('#sync-local').waitFor();check(await page.locator('#sync-conflicts').innerText().then(s=>s.includes('收藏')),'concurrent same-item edits expose explicit conflict choices');
 await button('冲突项使用云端更改').click();await button('使用云端更改').click();await page.waitForFunction(()=>__sync.state==='success');check(await page.evaluate(()=>__sync.calls.some(c=>c.command==='sync.run'&&c.args.choice==='remote'&&c.args.token==='conflict-token')),'resolving a conflict requires confirmation and sends its exact token');
 await page.evaluate(()=>{__sync.conflict=false;__sync.delay=true});await button('立即同步').click();await page.waitForFunction(()=>!!__sync.release);await page.evaluate(()=>{localStorage.setItem('rhfiles.favorites',JSON.stringify([{name:'保留新改动',path:'/storage/changed',isDir:true}]));__sync.delay=false;__sync.release()});await page.waitForFunction(()=>__sync.state==='failed');check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites'))[0].path==='/storage/changed'),'favorite edits during network I/O are never overwritten by an older proposal');
 await page.evaluate(()=>__sync.changeDuringApply=true);await button('立即同步').click();await page.waitForFunction(()=>__sync.state==='failed');await page.waitForFunction(()=>__sync.rollback===null);check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites'))[0].path==='/storage/new'),'cross-pane edits in the apply window roll back native changes without losing the new favorite');
 check(errors.length===0,'no unhandled frontend exceptions: '+errors.join(';'));console.log('PASS '+checks+' sync UI/scheduling checks (native bridge mocked)');
}finally{await context.close();await fixture.close()}
