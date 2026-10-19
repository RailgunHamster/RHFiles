import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from './browser-fixture.mjs';
const fixture=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true});const page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label)};
await context.addInitScript(()=>{
 const root='/storage/emulated/0',m=window.__model={connections:[],calls:[],scan:0,running:true,devices:[{host:'192.168.1.20',name:'NAS <img onerror=alert(1)>',port:445,source:'mDNS'}]};
 window.__TAURI_INTERNALS__={invoke:async(cmd,args={})=>{switch(cmd){case 'get_permission_status':return {manageExternalStorage:true,sharedStorageReadable:true};case 'index_status':return {entryCount:1,indexing:false};case 'debug_note':return;case 'app_info':return {version:'network-test'};case 'list_dir':return {path:args.path,entries:[]};default:throw Error('Unmocked '+cmd)}}};
 const publicConnection=c=>{const value={...c,path:'remote://'+c.id+'/'};delete value.password;return value};
 window.RHFilesNative={postMessage(raw){const {id,command,args:a={}}=JSON.parse(raw);m.calls.push({command,args:a});Promise.resolve().then(async()=>{switch(command){
  case 'capabilities':return {version:3,nativeBack:true};case 'permission':return true;case 'theme':return true;case 'window.layout':return {};
  case 'roots':return [{path:root,label:'内部存储'}];case 'shares':case 'jobs':return [];
  case 'connections':return m.connections.map(publicConnection);
  case 'connection.get':{const c=m.connections.find(c=>c.id===a.id);return {...publicConnection(c),hasPassword:!!c.password}}
  case 'connection.save':{if(m.failSave)throw Error('文件任务正在使用此连接');let c=a.id?m.connections.find(c=>c.id===a.id):null;if(!c){c={id:'id-'+(m.connections.length+1)};m.connections.push(c)}const oldPassword=c.password;Object.assign(c,a);if(a.id&&!a.password&&!a.clearPassword)c.password=oldPassword;if(a.clearPassword)c.password='';return c.id}
  case 'connection.delete':m.connections=m.connections.filter(c=>c.id!==a.id);return true;
  case 'lan.start':m.scan++;return 'scan-'+m.scan;
  case 'lan.state':if(m.holdDiscovery)await new Promise(resolve=>m.releaseDiscovery=resolve);return {running:m.running,devices:m.devices,warnings:[]};
  case 'lan.stop':return true;
  case 'list':if(m.denied)throw Error('STATUS_ACCESS_DENIED：请编辑连接登录');return {path:a.path,entries:new URL(a.path).pathname==='/'?['Public','中文 #目录'].map(name=>({name,path:a.path+encodeURIComponent(name),isDir:true,kind:'folder'})):[{name:'hello.txt',path:a.path+'/hello.txt',isDir:false,kind:'document',size:5}]};
  default:throw Error('Unmocked native '+command)
 }}).then(result=>RHFilesNative.onmessage({data:JSON.stringify({id,result})}),error=>RHFilesNative.onmessage({data:JSON.stringify({id,error:error.message})}));}};
});
const button=(name)=>page.getByRole('button',{name,exact:true});
async function home(){await page.locator('#btn-menu').click();await page.locator('#nav-home').click();}
async function remote(){await home();await page.locator('[data-tile=remote]').click();await button('添加网络位置').waitFor();}
try{
 await page.goto(fixture.url);await page.locator('[data-tile=remote]').click();await button('添加网络位置').waitFor();
 await page.getByText('192.168.1.20:445 · mDNS',{exact:true}).waitFor();
 check(await page.evaluate(()=>__model.scan)===1,'entering Network starts a bounded discovery session');
 check(await page.locator('#tool-extra img').count()===0,'discovered names render as text, never HTML');
 const originalCard=await page.getByText('NAS <img onerror=alert(1)>',{exact:true}).elementHandle();await page.waitForTimeout(900);
 check(await originalCard.evaluate(node=>node.isConnected),'unchanged discovery polling preserves controls under the finger');
 await page.locator('article').filter({hasText:'192.168.1.20:445'}).getByRole('button',{name:'添加为常用项'}).click();
 check(await page.locator('[name=host]').inputValue()==='192.168.1.20'&&await page.locator('[name=share]').inputValue()==='','discovered host form leaves share optional');
 await page.locator('[name=name]').fill('家用 NAS');await page.locator('[name=username]').fill('fixture-user');await page.locator('[name=password]').fill('fixture-secret');await button('保存连接').click();
 await button('家用 NAS').waitFor();check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites')).some(f=>f.path==='remote://id-1/')),'saving a discovered host adds a stable common/favorite location');
 check(await page.locator('.network-location').count()===1&&await page.locator('.network-location').evaluate(e=>e.getBoundingClientRect().height<=64),'each saved network location fits one compact line');
 check(!await page.evaluate(()=>JSON.stringify(localStorage).includes('fixture-secret')),'credentials never enter frontend persistence');
 await button('家用 NAS').click();await page.locator('#filelist .name').filter({hasText:'中文 #目录'}).waitFor();
 check((await page.locator('#filelist .name').allTextContents()).includes('Public'),'server root lists shared folders without a configured share');
 await page.locator('#filelist .name').filter({hasText:/^Public$/}).click();
 await page.getByText('hello.txt',{exact:true}).waitFor();check(await page.locator('#title').innerText()==='Public','opening a share enters its file listing');
 await page.locator('#btn-up').click();await page.locator('#filelist .name').filter({hasText:/^Public$/}).waitFor();check(true,'Up returns from a share to the server share list');
 await remote();await button('家用 NAS 的更多操作').click();await button('编辑连接').click();await page.locator('[name=name]').waitFor();
 check(await page.locator('[name=password]').inputValue()==='','editing never pre-fills the encrypted password');
 await page.locator('[name=name]').fill('改名 NAS');await button('保存连接').click();await button('改名 NAS').waitFor();
 check(await page.evaluate(()=>__model.connections.length===1&&__model.connections[0].id==='id-1'&&__model.connections[0].password==='fixture-secret'),'editing preserves identity, stored password and existing references');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites'))[0].name)==='改名 NAS','common item labels follow a connection rename');
 await button('改名 NAS 的更多操作').click();await button('编辑连接').click();await page.locator('[name=share]').fill('Public');await page.evaluate(()=>__model.failSave=true);await button('保存连接').click();
 await page.locator('.feature-form [role=alert]').getByText('文件任务正在使用此连接').waitFor();check(await page.locator('#sheet').isVisible(),'active-task save failure keeps the editable form and explains why');
 await page.evaluate(()=>__model.failSave=false);await button('保存连接').click();await button('改名 NAS').waitFor();check(await page.evaluate(()=>__model.connections[0].share)==='Public','existing connection can be changed to an explicit share');
 await button('改名 NAS 的更多操作').click();await button('取消常用').click();await button('改名 NAS').waitFor();check(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhfiles.favorites')).length)===0,'common locations can be removed without deleting the connection');
 await page.evaluate(()=>__model.denied=true);await button('改名 NAS').click();await page.getByText(/STATUS_ACCESS_DENIED/).first().waitFor();check(true,'authentication or enumeration failures show an error instead of an empty listing');
 await remote();await page.evaluate(()=>{__model.running=false;__model.devices=[]});await button('重新发现').click();await page.getByText('未发现主机。可重新发现，或手动填写主机名 / IP。',{exact:true}).waitFor();check(true,'empty discovery results keep manual host entry available');
 await page.evaluate(()=>{__model.running=true;__model.devices=[{name:'late',host:'192.168.1.30',port:445,source:'WS-Discovery'}];__model.holdDiscovery=true});await button('重新发现').click();await page.waitForFunction(()=>!!__model.releaseDiscovery);await home();await page.evaluate(()=>{__model.holdDiscovery=false;__model.releaseDiscovery()});await page.waitForTimeout(900);
 check(await page.locator('#home').isVisible()&&!await page.getByText('late',{exact:true}).isVisible(),'late discovery results cannot replace navigation');
 check(await page.evaluate(()=>__model.calls.some(c=>c.command==='lan.stop')),'leaving Network cancels discovery');
 check(errors.length===0,'no unhandled frontend errors: '+errors.join(';'));console.log('PASS '+checks+' network UI checks (native bridge mocked)');
}finally{await context.close();await fixture.close()}
