import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const invoke=(view,name,args={})=>view.evaluate(`RHFilesAPI.invoke(${JSON.stringify('rhvideo.'+name)},${JSON.stringify(args)})`);
test('actual packaged duplicate UI covers selection, native previews, durable jobs and guarded public actions',{timeout:180000},async t=>{
  let scan=null,reviews=[],reviewed=false,posts=[];
  const members=Array.from({length:14},(_,n)=>({key:'picture:'+n,id:String(n),media_type:'picture',filename:'旅行图片 '+n+'.webp',folder_label:'山野',source_path:'D:\\Fixture\\'+n+'.png',size:1024+n,preview_url:`/api/v1/duplicates/preview/picture/${n}?v=${'ab'.repeat(32)}`,resolution:'1600x1000',busy:false,stale:false,favorite:n===0}));
  const group=()=>({id:id(1),scan_id:id(100),media_type:'picture',similarity:99.9,member_count:14,stale:false,members:{items:members.slice(0,4),total:14,page:1,pages:4}});
  const fixture=await rhvideoFixture({duplicates:async({req,res,path,body,send,svg})=>{
    const url=new URL(req.url,'http://owned.invalid'),page=Number(url.searchParams.get('page')||1);
    if(path==='/api/v1/duplicates')return send(200,{scan,reviews,minimum_similarity:98.5});
    if(path==='/api/v1/duplicates/groups')return send(200,{items:reviewed||url.searchParams.get('kind')==='video'?[]:[group()],page:1,pages:1,total:reviewed?0:1});
    if(path===`/api/v1/duplicates/groups/${id(1)}/members`)return send(200,{items:members.slice((page-1)*12,page*12),page,pages:2,total:14});
    if(path.startsWith('/api/v1/duplicates/preview/')){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(svg(Number(path.split('/').at(-1))));}
    if(path==='/api/v1/duplicates/scans'&&req.method==='POST'){posts.push({path,body:await body()});scan={id:id(200),status:'queued',can_cancel:true,cancel_requested:false,progress:{done:0,total:14}};return send(202,scan);}
    if(path===`/api/v1/duplicates/scans/${id(200)}`&&req.method==='DELETE'){scan={...scan,status:'cancelled',can_cancel:false,cancel_requested:true};return send(200,scan);}
    if(path==='/api/v1/duplicates/reviews'&&req.method==='POST'){const data=await body();posts.push({path,body:data});assert.equal(data.group_id,id(1));assert.equal(data.scan_id,id(100));assert.equal(data.keeper_key,'picture:0');const job={id:id(300),group_id:id(1),keeper_key:data.keeper_key,status:'queued',total:13,done:0,failed:0};reviews=[job];return send(202,job);}
    if(path===`/api/v1/duplicates/reviews/${id(300)}`)return send(200,{...reviews[0],items:members.slice(1,14).map(item=>({key:item.key,filename:item.filename,status:'done',message:'已移入暂存区'})),page:1,pages:1});
    return send(404,{detail:'Missing fixture route'});
  }});t.after(()=>fixture.close());
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(page=>new URL(page.url).pathname==='/rhvideo.html');},'owned media library');
  const view=await cdpSession(target,30000);t.after(()=>view.close());await view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const click=async selector=>{
    await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'});true`);
    await view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await view.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(node.disabled)throw Error('Disabled control');const r=node.getBoundingClientRect();if(!r.width||!r.height||!node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Control is not the physical hit target');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    for(const type of ['mousePressed','mouseReleased'])await view.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  };
  const state=()=>invoke(view,'duplicates.state');
  await until(()=>view.evaluate('RHFilesAPI.list().some(action=>action.id==="rhvideo.duplicates.open")'),'duplicates API installed');
  await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  await click('#duplicates-nav');await until(async()=>(await state()).groups.length===1,'physical duplicate entry loads groups');
  await until(()=>view.evaluate("[...document.querySelectorAll('#wb-duplicates .dup-preview img')].length===4&&[...document.querySelectorAll('#wb-duplicates .dup-preview img')].every(image=>image.complete&&image.naturalWidth>0)"),'all authenticated native preview images decoded');
  await click('[data-member-key="picture:0"] [data-api-action="rhvideo.duplicates.preview"]');
  await until(()=>view.evaluate("document.querySelector('#wb-image-preview img')?.naturalWidth>0"),'physical full image preview');
  await invoke(view,'panel.close',{id:'wb-image-preview'});
  await click('[data-api-action="rhvideo.duplicates.more"]');await until(async()=>(await state()).groups[0].members.items.length===12,'first bounded members page');
  await click('[data-api-action="rhvideo.duplicates.more"]');await until(async()=>(await state()).groups[0].members.items.length===14,'last member remains reachable');
  await click('[data-member-key="picture:0"] [data-api-action="rhvideo.duplicates.keep"]');await until(async()=>(await state()).choices[id(1)]==='picture:0','physical keeper selected');
  const old=(await state()).revision;
  await app.screenshot('duplicates-main-owner');
  const shot=await view.send('Page.captureScreenshot',{format:'png'});
  const fs=await import('node:fs'),pathModule=await import('node:path');fs.writeFileSync(pathModule.join(app.artifactDir,'duplicate-review.png'),Buffer.from(shot.data,'base64'));
  await click('[data-api-action="rhvideo.duplicates.confirm"]');await until(()=>posts.some(post=>post.path.endsWith('/reviews')),'one explicit review POST');
  assert.equal(posts.filter(post=>post.path.endsWith('/reviews')).length,1);
  await assert.rejects(invoke(view,'duplicates.confirm',{groupId:id(1),scanId:id(100),keeperKey:'picture:0',expectedRevision:old}),/保留项|正在处理|已有后台|改变/);
  await invoke(view,'duplicates.close');reviews=[{...reviews[0],status:'completed',done:13}];reviewed=true;
  await click('#duplicates-nav');await until(async()=>(await state()).reviews[0]?.status==='completed','durable task survives closing');
  await click('[data-api-action="rhvideo.duplicates.review"]');await until(()=>view.evaluate("document.querySelector('#wb-duplicate-review')?.open&&document.querySelectorAll('#wb-duplicate-review .dup-review-row').length===13"),'physical per-file results');
  await invoke(view,'panel.close',{id:'wb-duplicate-review'});
  await click('[data-api-action="rhvideo.duplicates.scan"]');await until(async()=>(await state()).scan?.status==='queued','explicit background scan');
  await click('[data-api-action="rhvideo.duplicates.cancelScan"]');await until(async()=>(await state()).scan?.status==='cancelled','owned active scan cancellation');
  const report=await invoke(view,'ui.contract');assert.deepEqual(report.missing,[],'Every new physical UI control has an enumerable public action');
  assert(fixture.requests.filter(request=>request.path.startsWith('/api/v1/duplicates')).every(request=>request.authorization==='Bearer fixture-bearer-do-not-persist'));
  await invoke(view,'connection.logout');assert.equal((await state()).groups.length,0);assert.equal((await state()).choices[id(1)],undefined);
  t.diagnostic('Actual duplicate UI evidence: '+app.artifactDir);
});
