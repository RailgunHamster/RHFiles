// Browser integration: display decoding must never mutate backend destinations.
import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});const page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label)};
await context.addInitScript(()=>{
 const root='/storage/emulated/0',remote='remote://qa/',destination=remote+encodeURIComponent('中文 + #目录'),source=root+'/测试.txt';
 localStorage.setItem('rhfiles.favorites',JSON.stringify([{name:'目标文件夹',path:destination,isDir:true}]));
 const model=window.__transfer={calls:[],root,source,destination,job:null};
 window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:1,indexing:false};case 'debug_note':return;case 'app_info':return {version:'transfer-qa'};case 'list_dir':return {path:args.path,entries:[{path:source,name:'测试.txt',isDir:false,kind:'document',size:1}]};default:throw Error('Unmocked '+command)}}};
 window.RHFilesNative={postMessage(raw){const {id,command,args={}}=JSON.parse(raw);model.calls.push({command,args});Promise.resolve().then(()=>{switch(command){case 'capabilities':return {version:3,nativeBack:true};case 'theme':case 'permission':return true;case 'roots':return [{path:root,label:'内部存储'},{path:remote,label:'家用服务器',network:true,provider:true}];case 'shares':return [];case 'jobs':return model.job?[model.job]:[];case 'list':return {path:args.path,entries:[]};case 'job.start':model.job={id:'qa',op:args.op,args:args.args,state:'running',bytes:0,total:10,done:0,files:1,started:Date.now(),current:'正在核验来源并完成移动：'+destination+'/测试.txt',completed:[],outputs:[],failures:[]};return 'qa';case 'job.status':return model.job;default:throw Error('Unmocked native '+command)}}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
try{
 await page.goto(fixture.url);await page.locator('[data-tile=storage-0]').click();await page.locator('.entry-more').click();await page.getByRole('button',{name:'移动',exact:true}).click();
 await page.locator('#btn-menu').click();await page.locator('#nav-favorites').getByRole('button',{name:'目标文件夹',exact:true}).click();await page.locator('#btn-paste').waitFor();
 check((await page.locator('#paste-destination').innerText()).includes('家用服务器/中文 + #目录'),'paste destination displays the readable decoded Chinese folder');
 await page.locator('#btn-paste').click();await page.locator('#task-bar').waitFor();
 check((await page.locator('#task-bar').innerText()).includes('正在移动到 家用服务器/中文 + #目录'),'active move label uses Chinese instead of percent escapes');
 check(await page.evaluate(()=>__transfer.calls.some(c=>c.command==='job.start'&&c.args.op==='move'&&c.args.args.destination===__transfer.destination&&c.args.args.sources[0]===__transfer.source)),'backend receives the original encoded URI and unchanged source');
 await page.locator('#btn-menu').click();await page.locator('#nav-home').click();await page.locator('[data-tile=tasks]').click();await page.locator('.task-card').waitFor();
 check((await page.locator('.task-card').innerText()).includes('remote://qa/中文 + #目录/测试.txt'),'task progress also decodes paths embedded in a status message');
 await page.evaluate(()=>Object.assign(__transfer.job,{state:'completed',done:1,bytes:10,outputs:[__transfer.destination+'/测试.txt'],completed:[__transfer.source]}));await page.locator('#task-bar').waitFor({state:'hidden'});
 check(errors.length===0,'no frontend errors: '+errors.join(';'));console.log('PASS '+checks+' transfer display checks');
}finally{await context.close();await fixture.close()}
