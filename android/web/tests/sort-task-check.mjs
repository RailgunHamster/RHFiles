// Exercise the actual menus and terminal task UI. IPC is mocked, not an APK test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {browserFixture} from './browser-fixture.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(directory,'..');
const source=fs.readFileSync(path.join(directory,'flow-check.mjs'),'utf8');
const node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='fixture');
const fixture=await browserFixture(web),errors=[];
try{
 const context=await fixture.browser.newContext({viewport:{width:412,height:892},hasTouch:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript({content:'('+source.slice(node.start,node.end)+')({nativeV3:true});'});
 await page.goto(fixture.url);
 await page.locator('[data-tile="storage-0"]').click();
 await page.locator('#filelist:not([hidden])').waitFor();
 await page.evaluate(async()=>{
  const root='/storage/emulated/0';
  __model.fs[root]=[
   {name:'Directory',path:root+'/Directory',isDir:true,kind:'folder',size:0,modifiedMs:0},
   ...[['small.txt',1,30],['medium.txt',2,10],['large.txt',3,20]].map(([name,size,modifiedMs])=>({name,path:root+'/'+name,isDir:false,kind:'document',size,modifiedMs})),
  ];
  await RHFilesAPI.invoke('navigation.refresh');
 });
 const names=()=>page.locator('#filelist [role=option]').evaluateAll(nodes=>nodes.map(n=>n.dataset.path.split('/').pop()));
 const sort=async label=>{await page.locator('#btn-sort').click();await page.locator('#sheet-panel').getByRole('button',{name:label,exact:true}).click();};
 await page.locator('#btn-sort').click();
 assert.equal(await page.locator('#sheet-panel .sheet-item').count(),8);
 await page.locator('#sheet-panel').getByRole('button',{name:'大小（小到大）',exact:true}).click();
 assert.deepEqual(await names(),['Directory','small.txt','medium.txt','large.txt']);
 await sort('大小（大到小）');assert.deepEqual(await names(),['Directory','large.txt','medium.txt','small.txt']);
 await sort('修改时间（旧到新）');assert.deepEqual(await names(),['Directory','medium.txt','large.txt','small.txt']);
 await sort('修改时间（新到旧）');assert.deepEqual(await names(),['Directory','small.txt','large.txt','medium.txt']);
 await page.evaluate(async()=>{
  __model.jobs=['failed','interrupted','completed'].map((state,i)=>({id:'old-'+i,state,op:'copy',args:{sources:['old-path']},files:2,done:1,bytes:10,total:20,started:1,finished:2,completed:[],outputs:['published-output'],failures:state==='completed'?[]:[{path:'old-path',message:'HTTP 403'}]}));
  await RHFilesAPI.invoke('navigation.tool',{tool:'tasks'});
 });
 await page.getByText('HTTP 403',{exact:false}).first().waitFor();
 assert.equal(await page.locator('#native-task-chip').isHidden(),true);
 for(const label of ['重试未完成项','标记已处理','取消'])assert.equal(await page.locator('#tool-extra').getByRole('button',{name:label,exact:true}).count(),0);
 const records=await page.evaluate(()=>RHFilesAPI.invoke('tasks.list'));assert.equal(records.length,3);
 assert.equal(await page.evaluate(()=>__model.nativeCalls.filter(r=>['job.start','job.retry','job.control','job.dismiss','job.acknowledge'].includes(r.command)).length),0);
 await page.reload();await page.locator('[data-tile="storage-0"]').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('rhfiles.sort')),'date');
 assert.deepEqual(errors,[]);
 console.log('Passed: eight sort options, both size/date directions, folders-first, saved setting; terminal failures retained without pending banner or replay/cancel/acknowledgement actions.');
 await context.close();
}finally{await fixture.close();}
