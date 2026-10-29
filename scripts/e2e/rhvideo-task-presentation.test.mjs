import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('actual task flow presents units, preserves reading state and reports unknown/offline progress honestly',{timeout:180000},async t=>{
  let failure=false;
  const original={id:'video:video-0',video_id:'video-0',filename:'旅行与日常 · 完整任务流程.mp4',kind:'initial',status:'processing',live:true,queued_at:'2020-01-01T00:00:00Z',started_at:'2020-01-01T00:00:01Z',finished_at:null,
    steps:[{key:'probe',label:'读取视频信息',status:'done',elapsed_seconds:0,metrics:[{label:'编码器',value:'HEVC'},{label:'原始大小',value:1024**3,format:'bytes'}]},
      {key:'compress',label:'普通压缩',status:'running',metrics:[]},...['super_compress','keyframes','save','commit'].map((key,index)=>({key,label:['超压压缩','提取截图','保存文件','更新记录'][index],status:'pending',metrics:[{label:'计划 CRF',value:28}]}))],
    progress:{stage:'compress',percent:40,processed_seconds:20,duration_seconds:50,output_bytes:1536,frame:480,fps:24,speed:2,eta_seconds:15,encoder:'libx264',stage_elapsed_seconds:10,process_running:true,heartbeat_age_seconds:0,unchanged_seconds:0}};
  let detail=structuredClone(original);
  const fixture=await rhvideoFixture({tasks:async({path,send})=>{
    if(path==='/api/v1/processing-tasks')return send(200,{items:[{id:detail.id,filename:detail.filename,status:detail.status}],counts:{running:detail.status==='processing'?1:0,queued:0,failed:0,history:1},page:1,pages:1,total:1});
    if(failure)return send(503,{detail:'Owned progress reader unavailable'});return send(200,detail);
  }});t.after(()=>fixture.close());
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());t.diagnostic('Task presentation evidence: '+app.artifactDir);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(page=>new URL(page.url).pathname==='/rhvideo.html');},'owned task presentation');
  const view=await cdpSession(target,30000);t.after(()=>view.close());await view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const invoke=(name,args={})=>view.evaluate(`RHFilesAPI.invoke(${JSON.stringify('rhvideo.'+name)},${JSON.stringify(args)})`),open=()=>invoke('task.detail',{kind:'default',id:'video:video-0'});
  await until(()=>view.evaluate('typeof RHFilesAPI!=="undefined"&&RHFilesAPI.list().some(action=>action.id==="rhvideo.task.detailState")'),'typed task readback installed');
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await open();
  await until(()=>view.evaluate("document.querySelector('#wb-info .wb-thumbnail-preview img')?.naturalWidth>0"),'native authenticated task thumbnail');
  assert.equal(await view.evaluate("document.querySelectorAll('#wb-info table').length"),0,'A task is a flow, not a raw property table');
  assert.equal(await view.evaluate("document.querySelectorAll('#wb-info .rv-task-step').length"),6);
  const body=await view.evaluate("document.getElementById('wb-info').textContent");for(const expected of ['处理中','耗时 0 秒','1 GiB','1.5 KiB','24 fps','2×','预计剩余','计划 CRF'])assert(body.includes(expected),expected);
  await view.evaluate("(()=>{const node=document.querySelector('[data-step=probe] dd'),range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);window.__taskSelection=getSelection().toString();window.__step=document.querySelector('[data-step=compress]');window.__thumb=document.querySelector('.wb-thumbnail-preview');window.__footer=document.querySelector('.rv-task-footer');document.getElementById('wb-info').scrollTop=360;return true})()");
  const scroll=await view.evaluate("document.getElementById('wb-info').scrollTop");assert(scroll>0);
  detail={...detail,progress:{...detail.progress,percent:50,processed_seconds:25,output_bytes:2048,frame:600}};await invoke('server.liveRefresh');
  assert.equal(await view.evaluate("window.__step===document.querySelector('[data-step=compress]')&&window.__thumb===document.querySelector('.wb-thumbnail-preview')&&window.__footer===document.querySelector('.rv-task-footer')"),true);
  assert.equal(await view.evaluate('getSelection().toString()===window.__taskSelection'),true);assert.equal(await view.evaluate("document.getElementById('wb-info').scrollTop"),scroll);assert.equal(await view.evaluate("document.querySelector('.rv-task-live progress').value"),50);
  await open();assert.equal(await view.evaluate("document.getElementById('wb-info').scrollTop"),scroll,'Manual refresh also preserves reading position');assert.equal(await view.evaluate("document.querySelectorAll('#wb-info .rv-task-footer').length"),1);
  detail={...detail,progress:{...detail.progress,percent:null}};await invoke('server.liveRefresh');assert.equal(await view.evaluate("document.querySelector('.rv-task-live progress').hasAttribute('value')"),false);assert.equal((await invoke('task.detailState')).detail.progress.percent,null);
  detail={...detail,progress:{...detail.progress,percent:50,unchanged_seconds:31,stalled:true}};await invoke('server.liveRefresh');assert.equal(await view.evaluate("document.querySelector('.rv-task-live').dataset.state"),'stalled');assert(!(await invoke('task.detailState')).detail.progress.summary.some(item=>item.label==='预计剩余'));
  failure=true;await assert.rejects(open(),/Owned progress reader unavailable/);assert.equal(await view.evaluate("document.querySelector('.rv-task-live').dataset.state"),'offline');assert.match(await view.evaluate("document.querySelector('.rv-task-read-error').textContent"),/读取任务失败/);
  failure=false;detail=structuredClone(original);await open();assert.equal(await view.evaluate("document.querySelectorAll('.rv-task-read-error').length"),0);
  await view.evaluate("document.getElementById('wb-info').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");fs.writeFileSync(path.join(app.artifactDir,'task-structured-flow.png'),Buffer.from((await view.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  detail={...detail,id:'run:archived',kind:'initial',status:'succeeded',details_archived:true,live:false,steps:[],progress:null};await invoke('task.detail',{kind:'default',id:'run:archived'});assert.match(await view.evaluate("document.getElementById('wb-info').textContent"),/90 天/);assert.equal(await view.evaluate("document.querySelectorAll('.rv-task-step').length"),0);
  detail={...original,id:'replace:1',kind:'replacement',status:'succeeded',before_size:2048,after_size:1024,steps:[],progress:null};await invoke('task.detail',{kind:'replacement',id:'replace:1'});assert.deepEqual((await invoke('task.detailState')).detail.summary.map(item=>item.value),['2 KiB','1 KiB','1 KiB']);
  detail={...detail,status:'running',batch_id:'batch-0',live:true};await invoke('task.detail',{kind:'replacement',id:'replace:1'});
  assert.equal(await view.evaluate("document.querySelector('#wb-info [data-api-action=\"rhvideo.remote.batches.stop\"]').textContent"),'停止此批次剩余任务');
  assert.equal(await view.evaluate("[...document.querySelectorAll('#wb-info button')].some(node=>/重试|取消任务/.test(node.textContent))"),false);
  assert.deepEqual((await invoke('ui.contract')).missing,[]);assert.equal(fixture.requests.filter(request=>request.method!=='GET'&&request.path!=='/api/v1/auth/login').length,0,'Reading a full task flow never starts, retries, stops or rewrites media');
  await invoke('connection.logout');assert.equal((await invoke('task.detailState')).opened,false);
});
