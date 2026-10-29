import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('real task controls promote pending work, preserve context and expose failures without replay',{timeout:180000},async t=>{
  let release,held=false,fail=false;const posts=[];
  const queues={default:Array.from({length:55},(_,n)=>({id:'video:queued-'+n,filename:'等待处理 '+n,status:'pending',can_prioritize:true})),replacement:Array.from({length:30},(_,n)=>({id:'replace:'+(n+1),filename:'原片替换 '+n,status:'pending',can_prioritize:true}))};
  const fixture=await rhvideoFixture({beforeMedia:({path})=>path==='/api/v1/videos/video-0/thumbnail'?{status:404,detail:'Not generated yet'}:null,tasks:async({req,path,send})=>{
    const url=new URL(req.url,'http://owned.invalid');
    if(path==='/api/v1/processing-tasks'){
      const kind=url.searchParams.get('kind')||'default',view=url.searchParams.get('view')||'running',query=url.searchParams.get('q')||'';
      let items=view==='queued'?queues[kind]:[{id:kind==='default'?'video:running':'replace:999',filename:view==='failed'?'实际失败记录':'运行中',status:view==='failed'?'failed':'processing',can_prioritize:false}];
      if(query)items=items.filter(item=>item.filename.includes(query));const pages=Math.max(1,Math.ceil(items.length/25)),page=Math.min(pages,Number(url.searchParams.get('page')||1));
      return send(200,{items:items.slice((page-1)*25,page*25),counts:{running:1,queued:queues[kind].length,failed:1,history:0},total:items.length,page,pages});
    }
    const parts=path.split('/'),kind=parts[4],id=decodeURIComponent(parts[5]||''),item=queues[kind]?.find(item=>item.id===id)||{id,filename:'已结束',status:'failed',can_prioritize:false};
    if(req.method==='POST'){
      assert(path.endsWith('/prioritize'));posts.push({kind,id});if(fail)return send(503,{detail:'Owned priority unavailable'});
      if(held)await new Promise(resolve=>release=resolve);
      assert.equal(item.status,'pending');item.prioritized=true;queues[kind]=[item,...queues[kind].filter(row=>row!==item)];
      return send(200,{id,kind,status:'pending',prioritized:true,already_prioritized:false,blocked_by:kind==='replacement'?'paused':null});
    }
    return send(200,{...item,video_id:'video-0',steps:[],progress:null,live:item.status==='pending'});
  }});t.after(()=>{release?.();return fixture.close();});
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());t.diagnostic('Queue promotion UI evidence: '+app.artifactDir);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(page=>new URL(page.url).pathname==='/rhvideo.html');},'owned media window');
  const view=await cdpSession(target,30000);t.after(()=>view.close());await view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const invoke=(name,args={})=>view.evaluate(`RHFilesAPI.invoke(${JSON.stringify('rhvideo.'+name)},${JSON.stringify(args)})`),state=()=>invoke('task.priorityState');
  await until(()=>view.evaluate('typeof RHFilesAPI!=="undefined"&&RHFilesAPI.list().some(a=>a.id==="rhvideo.task.prioritize")'),'queue API ready');
  const click=async selector=>{
    await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const point=await view.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();if(n.disabled||!r.width||!r.height||!n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Not an enabled physical hit target');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const type of ['mousePressed','mouseReleased'])await view.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  };
  const settled=id=>until(async()=>{const s=await state();return !s.pending&&s.receipt?.id===id;},'promotion receipt '+id);
  const choose=async(index,value)=>{const before=await invoke('server.state');await view.evaluate(`(()=>{const select=document.querySelectorAll('#wb-server .wb-filters select')[${index}];select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await until(async()=>{const s=await invoke('server.state');return s.load>before.load&&!s.loading&&s[index===0?'queue':'view']===value&&await view.evaluate(`document.querySelectorAll('#wb-server .wb-filters select')[${index}]?.value===${JSON.stringify(value)}`);},'actual queue select and rendered result');};
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  await invoke('server.open',{page:'tasks'});await invoke('server.filter',{key:'view',value:'queued'});await invoke('server.filter',{key:'pageNumber',value:3});
  await click('[data-task-id="video:queued-54"] [data-api-action="rhvideo.task.prioritize"]');await settled('video:queued-54');
  assert.equal((await invoke('server.state')).pageNumber,1);assert.equal(await view.evaluate("document.querySelector('[data-task-id]')?.dataset.taskId"),'video:queued-54');
  assert.match(await view.evaluate("document.querySelector('.wb-task-priority-message').textContent"),/已置顶/);
  await invoke('task.detail',{kind:'default',id:'video:queued-53'});
  await until(()=>view.evaluate("document.querySelector('#wb-info .wb-thumbnail-preview')?.textContent.includes('暂未生成缩略图')"),'missing thumbnail fallback');
  assert.equal(await view.evaluate("document.querySelector('#wb-info .wb-thumbnail-preview').disabled"),true);
  const thumbnailReads=fixture.requests.filter(request=>request.path==='/api/v1/videos/video-0/thumbnail').length;
  await invoke('server.liveRefresh');await invoke('server.liveRefresh');assert.equal(fixture.requests.filter(request=>request.path==='/api/v1/videos/video-0/thumbnail').length,thumbnailReads,'Unchanged failed preview cannot be downloaded again at each progress refresh');
  await click('#wb-info [data-api-action="rhvideo.task.prioritize"]');await settled('video:queued-53');
  assert.equal(await view.evaluate("document.querySelector('#wb-info')?.open"),true);assert.match(await view.evaluate("document.querySelector('#wb-info').textContent"),/已置顶/);
  await invoke('panel.close',{id:'wb-info'});await choose(0,'replacement');await choose(1,'failed');
  await until(()=>view.evaluate("document.querySelector('#wb-server [data-task-id]')?.textContent.includes('实际失败记录')"),'replacement failed records stay accessible');
  assert.equal(await view.evaluate("document.querySelectorAll('#wb-server [data-api-action=\"rhvideo.task.prioritize\"]').length"),0);
  await invoke('server.open',{page:'replacement'});await choose(0,'default');
  assert.equal((await invoke('server.state')).page,'tasks','Queue selector cannot stay locked to replacement page');
  await invoke('server.filter',{key:'view',value:'queued'});fail=true;await invoke('task.detail',{kind:'default',id:'video:queued-52'});
  await click('#wb-info [data-api-action="rhvideo.task.prioritize"]');await until(async()=>(await state()).error.includes('Owned priority unavailable'),'visible uncertain failure');
  assert.match(await view.evaluate("document.querySelector('#wb-info .wb-task-priority-message').textContent"),/不会自动重发/);await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(posts.filter(post=>post.id==='video:queued-52').length,1);
  await invoke('panel.close',{id:'wb-info'});fail=false;held=true;await invoke('task.detail',{kind:'default',id:'video:queued-51'});await click('#wb-info [data-api-action="rhvideo.task.prioritize"]');await until(()=>!!release,'held request arrived');
  await assert.rejects(invoke('task.prioritize',{kind:'default',id:'video:queued-50',expectedRevision:(await state()).revision}),/正在提交/);
  await invoke('panel.close',{id:'wb-info'});await invoke('panel.close',{id:'wb-server'});await invoke('server.open',{page:'tasks'});await invoke('server.filter',{key:'q',value:'保留的新筛选'});release();await settled('video:queued-51');
  assert.equal((await invoke('server.state')).q,'保留的新筛选');assert.equal(await view.evaluate("document.querySelector('#wb-info').open"),false);
  assert.equal(await view.evaluate("document.querySelector('#wb-server .wb-task-priority-message').hidden"),true,'A late receipt cannot repopulate a reopened panel');
  await assert.rejects(invoke('task.prioritize',{kind:'default',id:'video:queued-50',expectedRevision:'old-process'}),/进程已改变/);
  assert.equal(posts.length,4);assert.equal(posts.filter(post=>post.id==='video:queued-51').length,1);assert(queues.default.every(row=>row.status==='pending'));
  assert.deepEqual((await invoke('ui.contract')).missing,[]);assert.equal(await view.evaluate("[...document.querySelectorAll('#wb-server button,#wb-info button')].some(n=>/重试|取消任务/.test(n.textContent))"),false);
  fs.writeFileSync(path.join(app.artifactDir,'queue-final.png'),Buffer.from((await view.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await invoke('connection.logout');assert.equal((await state()).receipt,null);
});
