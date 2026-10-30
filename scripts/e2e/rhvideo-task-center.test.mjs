import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('task center keeps an inline selected workflow, stable live reading, IME search and scoped responses',{timeout:180000},async t=>{
  let progress=40,listFailure=false,detailFailure=false,releaseList=null,heldList=false;
  const queued=Array.from({length:55},(_,i)=>({id:'video:queue-'+i,filename:'排队样本 '+i+'.mp4',kind:'initial',status:'pending',queued_at:'2020-01-01T00:00:00Z'}));
  const running=[{id:'video:running',filename:'正在处理的完整样本.mp4',kind:'initial',status:'processing',started_at:'2020-01-01T00:00:01Z'}];
  const fixture=await rhvideoFixture({tasks:async({req,path,send})=>{
    const url=new URL(req.url,'http://fixture.invalid'),kind=url.searchParams.get('kind')||'default',view=url.searchParams.get('view')||'running',query=url.searchParams.get('q')||'';
    if(path==='/api/v1/processing-tasks'){
      if(listFailure)return send(503,{detail:'Owned list reader unavailable'});
      let items=view==='queued'?queued:view==='history'?[{id:'run:history',filename:'已完成的样本.mp4',status:'succeeded'}]:view==='failed'?[{id:'video:failed',filename:'失败样本.mp4',status:'failed',message:'测试源离线'}]:running;
      if(kind==='replacement')items=items.map((item,i)=>({...item,id:'replace:'+(i+1),kind:'replacement'}));
      if(query==='迟到') {heldList=true;await new Promise(resolve=>releaseList=resolve);}
      if(query)items=items.filter(item=>item.filename.includes(query));
      const pages=Math.max(1,Math.ceil(items.length/25)),page=Math.min(pages,Number(url.searchParams.get('page')||1));return send(200,{items:items.slice((page-1)*25,page*25),counts:{running:1,queued:55,failed:1,history:1},page,pages,total:items.length});
    }
    if(detailFailure)return send(503,{detail:'Owned detail reader unavailable'});
    const id=decodeURIComponent(path.split('/').at(-1)),status=id.includes('running')?'processing':id.includes('failed')?'failed':id.startsWith('run:')?'succeeded':'pending';
    return send(200,{id,video_id:'video-0',filename:id==='video:running'?running[0].filename:'处理流程 '+id,kind:'initial',status,started_at:'2020-01-01T00:00:01Z',live:status==='processing',message:status==='failed'?'测试源离线':'',
      steps:['probe','compress','super_compress','keyframes','save','commit'].map((key,i)=>({key,label:['读取视频信息','普通压缩','超压压缩','提取截图','保存文件','更新记录'][i],status:i===0?'done':i===1?'running':'pending',elapsed_seconds:i===0?0:null,metrics:[{label:'计划参数',value:i},{label:'文件大小',value:1536,format:'bytes'}]})),
      progress:status==='processing'?{stage:'compress',percent:progress,processed_seconds:20,duration_seconds:50,fps:24,speed:2,eta_seconds:15,output_bytes:1536,process_running:true,heartbeat_age_seconds:0,unchanged_seconds:0}:null});
  }});t.after(()=>{releaseList?.();return fixture.close();});
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());t.diagnostic('Inline task-center evidence: '+app.artifactDir);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(page=>new URL(page.url).pathname==='/rhvideo.html');},'owned task-center window');
  const view=await cdpSession(target,30000);t.after(()=>view.close());await view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const invoke=(name,args={})=>view.evaluate(`RHFilesAPI.invoke(${JSON.stringify('rhvideo.'+name)},${JSON.stringify(args)})`),state=()=>invoke('task.centerState'),filter=(key,value)=>invoke('server.filter',{key,value});
  await until(()=>view.evaluate('typeof RHFilesAPI!=="undefined"&&RHFilesAPI.list().some(a=>a.id==="rhvideo.task.centerState")'),'task-center semantic API');
  const click=async selector=>{
    await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const point=await view.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();if(n.disabled||!r.width||!r.height||!n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Not an enabled visible control');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const type of ['mousePressed','mouseReleased'])await view.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  };
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('server.open',{page:'tasks'});
  assert.equal(await view.evaluate("document.querySelector('#wb-server .wb-tabs').getBoundingClientRect().height<90"),true,'Server tabs stay horizontal, not six full-width rows');
  assert.equal((await state()).selected,'video:running');assert.equal((await state()).detail.steps.length,6);assert.equal(await view.evaluate("!!document.getElementById('wb-info')?.open"),false,'Auto-selection stays inside the task center');
  assert.equal(await view.evaluate("document.querySelector('.rv-task-history-filters').hidden"),true);
  assert.equal(await view.evaluate("document.querySelectorAll('.rv-task-center table').length"),0);
  await view.evaluate("(()=>{window.__row=document.querySelector('[data-task-id]');window.__step=document.querySelector('.rv-task-inline-detail [data-step=probe]');window.__search=document.querySelector('.rv-task-filters input');window.__footer=document.querySelector('.rv-task-footer');const node=window.__step.querySelector('dd'),range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);window.__text=getSelection().toString();document.querySelector('.rv-task-inline-detail').scrollTop=280;return true})()");
  const detailScroll=await view.evaluate("document.querySelector('.rv-task-inline-detail').scrollTop");assert(detailScroll>0);
  const geometry=()=>view.evaluate("(()=>{const n=document.querySelector('.rv-task-inline-detail'),r=n.getBoundingClientRect();return {scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,selected:getSelection().toString(),children:[...n.children].map(e=>({class:e.className,top:e.getBoundingClientRect().top-r.top,height:e.getBoundingClientRect().height})),images:[...n.querySelectorAll('img')].map(e=>({complete:e.complete,width:e.naturalWidth,height:e.getBoundingClientRect().height})),steps:[...n.querySelectorAll('[data-step]')].map(e=>({step:e.dataset.step,top:e.getBoundingClientRect().top-r.top,height:e.getBoundingClientRect().height}))}})()");
  const beforeGeometry=await geometry();
  progress=55;await invoke('server.liveRefresh');
  assert.equal(await view.evaluate("window.__row===document.querySelector('[data-task-id]')&&window.__step===document.querySelector('.rv-task-inline-detail [data-step=probe]')&&window.__search===document.querySelector('.rv-task-filters input')&&window.__footer===document.querySelector('.rv-task-footer')&&getSelection().toString()===window.__text"),true);
  const afterScroll=await view.evaluate("document.querySelector('.rv-task-inline-detail').scrollTop");
  if(afterScroll!==detailScroll){
    try{
      fs.writeFileSync(path.join(app.artifactDir,'task-reading-failure.json'),JSON.stringify({expectedScroll:detailScroll,before:beforeGeometry,after:await geometry()},null,2));
      const frame=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'task-reading-failure.png'),Buffer.from(frame.data,'base64'));
    }catch(error){t.diagnostic('Task reading diagnostics unavailable: '+error.message);}
  }
  assert.equal(afterScroll,detailScroll);assert.equal((await state()).detail.progress.percent,55);
  detailFailure=true;await assert.rejects(invoke('server.refresh'),/Owned detail reader unavailable/);assert.match((await state()).detailError,/Owned detail/);assert.equal((await state()).detail.progress.state,'offline');
  detailFailure=false;await invoke('server.refresh');assert.equal((await state()).detailError,'');assert.equal(await view.evaluate("document.querySelectorAll('.rv-task-read-error').length"),0);
  await filter('view','queued');assert.equal((await state()).selected,'');await click('[data-task-id="video:queue-20"] [data-api-action="rhvideo.task.select"]');await until(async()=>(await state()).selected==='video:queue-20'&&!(await state()).detailLoading,'physical inline selection');
  assert.equal(await view.evaluate("!!document.getElementById('wb-info')?.open"),false);
  await view.evaluate("document.querySelector('.rv-task-list').scrollTop=280;window.__listScroll=document.querySelector('.rv-task-list').scrollTop;window.__queuedRow=document.querySelector('[data-task-id=\"video:queue-20\"]');document.querySelector('[data-task-id=\"video:queue-20\"] [data-api-action=\"rhvideo.task.select\"]').focus({preventScroll:true});window.__focused=document.activeElement;true");
  await invoke('server.liveRefresh');assert.equal(await view.evaluate("window.__queuedRow===document.querySelector('[data-task-id=\"video:queue-20\"]')&&document.querySelector('.rv-task-list').scrollTop===window.__listScroll&&document.activeElement===window.__focused"),true);
  await filter('view','history');assert.equal((await state()).selected,'');assert.equal(await view.evaluate("document.querySelector('.rv-task-history-filters').hidden"),false);
  assert.deepEqual(await view.evaluate("[...document.querySelector('.rv-task-history-filters select:last-child').options].map(n=>n.value)"),['all','succeeded','issues']);await assert.rejects(filter('status','skipped'),/不支持/);
  await filter('queue','replacement');await filter('view','history');await filter('status','skipped');await filter('queue','default');assert.equal((await invoke('server.state')).status,'all');assert.equal((await state()).view,'running');
  await view.evaluate("(()=>{const q=document.querySelector('.rv-task-filters input');q.focus();q.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));q.value='处理中';q.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'中'}));return true})()");
  const beforeComposition=fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length;await new Promise(resolve=>setTimeout(resolve,400));assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length,beforeComposition);
  await view.evaluate("document.querySelector('.rv-task-filters input').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));true");await until(async()=>(await invoke('server.state')).q==='处理中'&&!(await invoke('server.state')).loading,'IME search committed once');
  assert.equal(await view.evaluate("window.__search===document.querySelector('.rv-task-filters input')&&document.activeElement===window.__search&&window.__search.value==='处理中'"),true,'Filtering preserves the actual IME input and focus');
  await view.evaluate("(()=>{const q=document.querySelector('.rv-task-filters input');q.value='后台待提交搜索';q.dispatchEvent(new InputEvent('input',{bubbles:true}));Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__taskHidden===true});window.__taskHidden=true;document.dispatchEvent(new Event('visibilitychange'));return true})()");
  const hiddenReads=fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length;await new Promise(resolve=>setTimeout(resolve,400));assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length,hiddenReads,'A queued search cannot start a read after hiding the panel');
  await view.evaluate("window.__taskHidden=false;document.dispatchEvent(new Event('visibilitychange'));true");await until(async()=>(await invoke('server.state')).q==='后台待提交搜索'&&!(await invoke('server.state')).loading,'Pending search resumes once visible');await view.evaluate("delete document.hidden;true");
  await view.evaluate("document.activeElement.blur();window.__oldList=RHFilesAPI.invoke('rhvideo.server.filter',{key:'q',value:'迟到'}).catch(error=>({error:String(error)}));true");await until(()=>heldList,'held old list query');await filter('q','排队');releaseList();await view.evaluate('window.__oldList');assert.equal((await invoke('server.state')).q,'排队');assert.equal((await state()).items.length,0);
  await filter('q','');listFailure=true;await assert.rejects(invoke('server.refresh'),/Owned list reader unavailable/);assert.match((await state()).error,/Owned list/);assert.equal(await view.evaluate("document.querySelector('.rv-task-center-error').hidden"),false);listFailure=false;await invoke('server.refresh');assert.equal((await state()).error,'');
  listFailure=true;await until(async()=>{const value=await invoke('server.refreshState');return value.failures===3&&!value.running&&!value.scheduled;},'three actual timed read failures exhaust the automatic refresh budget',45000);
  assert.equal((await state()).detail.progress.state,'offline');const stoppedReads=fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length;await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length,stoppedReads,'Exhausted automatic reads do not keep looping');
  listFailure=false;await click('.rv-task-inline-detail [data-api-action="rhvideo.task.refreshSelection"]');await until(async()=>{const value=await invoke('server.refreshState');return value.failures===0&&value.error===''&&value.enabled&&value.scheduled;},'the real manual detail refresh resets the read loop');
  await until(async()=>fixture.requests.filter(r=>r.path==='/api/v1/processing-tasks').length>stoppedReads&&(await state()).error==='', 'a subsequent automatic list read actually resumes',10000);
  await view.evaluate("document.querySelector('.rv-task-inline-detail').scrollTop=0;document.getElementById('wb-server').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");fs.writeFileSync(path.join(app.artifactDir,'task-center-desktop.png'),Buffer.from((await view.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.deepEqual((await invoke('ui.contract')).missing,[]);assert.equal(fixture.requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login').length,0,'Selection/filter/progress views never mutate or replay media');
  await invoke('panel.close',{id:'wb-server'});assert.equal((await state()).opened,false);const closedReads=fixture.requests.filter(r=>r.path.startsWith('/api/v1/processing-tasks')).length;await new Promise(resolve=>setTimeout(resolve,4300));assert.equal(fixture.requests.filter(r=>r.path.startsWith('/api/v1/processing-tasks')).length,closedReads,'Closed task center performs no background task reads');await invoke('connection.logout');
});
