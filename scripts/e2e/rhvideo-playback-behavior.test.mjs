// Behavioral acceptance, alongside the differential oracle that executes the
// reference functions. These tests inspect real native frames/server writes,
// not only API enumeration. All media/profiles are generated and disposable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp,until,sleep} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
const native={skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'};
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
const command=(app,action,args={})=>app.evaluate('call("rhvideo_request",'+JSON.stringify({action,args})+')');
async function target(app,file){
  const found=await until(async()=>{const all=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return all.find(t=>new URL(t.url).pathname.endsWith('/'+file));},file+' window');
  const view=await cdpSession(found,30000);
  const action=file==='rhvideo-player.html'?'rhvideo.player.state':'rhvideo.playlist.sequential';
  await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==='+JSON.stringify(action)+')'),'behavior APIs ready');return view;
}
async function setup(options={}){
  const app=await launchApp({emulateFocus:true});let fixture,view;
  try{
    const {portraitIndices=[],picturesOnly=false,videoMetadataDuration,...fixtureOptions}=options,duration=options.videoDuration??14,file=path.join(app.directory,'behavior.mp4');
    const make=(file,size)=>execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size='+size+':rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
    if(!picturesOnly)make(file,'640x360');
    const portrait=path.join(app.directory,'portrait.mp4');
    if(portraitIndices.length)make(portrait,'360x640');
    const orientation=portraitIndices.length?{videoFiles:Object.fromEntries(portraitIndices.map(i=>['video-'+i,portrait])),videoResolutions:Array.from({length:options.videoCount??6},(_,i)=>portraitIndices.includes(i)?'360x640':'640x360')}:{};
    fixture=await rhvideoFixture({videoFile:picturesOnly?null:file,videoCount:6,...fixtureOptions,...orientation,videoDuration:videoMetadataDuration??duration});
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    return {app,fixture,view,close:async()=>{view.close();app.close();await fixture.close();}};
  }catch(error){view?.close();app.close();await fixture?.close();throw error;}
}
test('sequential playback keeps the visible full-list order, wraps manually, seeks across entries and resumes its own cursor',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'sort',{value:'nameDesc'});
    const order=(await invoke(s.view,'state')).items.map(i=>i.id);
    assert.equal(await s.view.evaluate("document.querySelectorAll('select[data-api-action=\"rhvideo.play.mode\"]').length"),0,'playback capabilities are explicit actions, not a mode dropdown');
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.id,order[0]);assert.equal(initial.queue.total,6);assert.equal(initial.queue.options.mode,'sequential');assert.equal(initial.queue.options.fullLength,true);
    const last=await invoke(player,'player.previous');assert.equal(last.queue.id,order.at(-1));
    await invoke(player,'player.control',{command:'rate',value:1.5});
    const first=await invoke(player,'player.next');assert.equal(first.queue.id,order[0]);
    assert.equal((await invoke(player,'player.state')).rate,1.5,'switching to a preloaded/new native player must preserve playlist speed');
    const seeked=await invoke(player,'player.seekQueue',{ratio:.25});assert.equal(seeked.queue.index,1);assert.equal(seeked.queue.id,order[1]);
    await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0&&value.decoderPositionMs>=6500;},'actual native cross-entry seek',25000);
    await invoke(player,'player.control',{command:'pause'});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const segment=await invoke(player,'player.state');assert.equal(segment.queue.options.mode,'segments');assert.equal(segment.queue.total,4,'segment pool is the screenshot gallery, not the six-item video list');assert.equal(segment.queue.options.fullLength,false);assert.equal(segment.queue.options.segment,3);
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');assert.equal((await invoke(player,'player.state')).queue.id,order[1],'segment playback cannot overwrite sequential playback history');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential',{super:true});player=await target(s.app,'rhvideo-player.html');
    const low=await invoke(player,'player.state');assert.equal(low.queue.index,0);assert.equal(low.queue.options.mode,'sequential-super');assert.equal(low.queue.options.super,true);
    await until(()=>s.fixture.requests.some(r=>r.path.endsWith('/play')&&r.query==='?super=true'),'actual super stream requested');
    assert.deepEqual((await invoke(player,'ui.contract')).missing,[]);
    await player.send('Emulation.setDeviceMetricsOverride',{width:640,height:420,deviceScaleFactor:1,mobile:false});
    const outside=await player.evaluate("[...document.querySelectorAll('#controls button,#controls input,#controls select')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1}).map(n=>n.id)");
    assert.deepEqual(outside,[],'all player controls remain reachable at minimum size');
  }finally{player?.close();await s.close();}
});

test('live portrait playback filters the original pool, preserves speed, restores all items, and remembers modes independently',native,async()=>{
  const s=await setup({portraitIndices:[0,2,3],videoDuration:20});let player;
  try{
    const original=(await invoke(s.view,'state')).items.map(i=>i.id);
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.sourceTotal,6);assert.equal(initial.queue.portraitTotal,3);assert.equal(initial.queue.options.segment,300);
    await invoke(player,'player.control',{command:'rate',value:1.5});
    const filtered=await invoke(player,'player.options',{portraitOnly:true});assert.equal(filtered.total,3);assert.equal(filtered.options.fullLength,true);assert.equal(filtered.options.portraitOnly,true);
    await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0&&v.videoHeight>v.videoWidth&&v.rate===1.5;},'actual portrait frames after pool switch',25000);
    await assert.rejects(command(s.app,'player.options',{options:{loop:true},expectedId:initial.queue.id,expectedRevision:initial.queue.revision}),/已改变/,'an ABA-same video ID cannot accept old queue settings');
    const restored=await invoke(player,'player.options',{portraitOnly:false});assert.equal(restored.total,6);assert.equal(restored.options.fullLength,false);assert.equal(restored.options.portraitOnly,false);
    assert.equal((await invoke(player,'player.next')).queue.id,original[1]);assert.equal((await invoke(player,'player.state')).rate,1.5);
    await invoke(player,'player.options',{portraitOnly:true});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const resumed=(await invoke(player,'player.state')).queue;assert.equal(resumed.total,3);assert.equal(resumed.sourceTotal,6);assert.equal(resumed.options.portraitOnly,true);
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const segments=(await invoke(player,'player.state')).queue;assert.equal(segments.options.portraitOnly,false);assert.equal(segments.total,4,'a sequential setting cannot filter the independent gallery mode');
    assert.deepEqual((await invoke(player,'ui.contract')).missing,[]);
    await invoke(player,'player.options',{portraitOnly:true});await invoke(player,'player.options',{fullLength:false,segment:2});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const restoredSegments=(await invoke(player,'player.state')).queue;assert.equal(restoredSegments.options.portraitOnly,true);assert.equal(restoredSegments.options.fullLength,false);assert.equal(restoredSegments.segmentLengthMs,2000,'portrait filtering must not overwrite a saved explicit segment choice');
  }finally{player?.close();await s.close();}
});

test('a real pointer toggle with fewer than two portrait videos fails visibly without changing the paused input or queue',native,async()=>{
  const s=await setup({portraitIndices:[0]});let player;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'initial decoded frame',25000);
    const before=await invoke(player,'player.control',{command:'pause'});
    const point=await player.evaluate("(()=>{const r=document.getElementById('portrait-only').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(()=>player.evaluate("document.getElementById('error').textContent.includes('不足 2 个')&&!document.getElementById('portrait-only').checked"),'visible error and reverted checkbox');
    const after=await invoke(player,'player.state');assert.equal(after.queue.id,before.queue.id);assert.equal(after.queue.revision,before.queue.revision);assert.equal(after.queue.total,6);assert.equal(after.state,4);
    assert.equal((await command(s.app,'playlist.state',{mode:'sequential'})).portraitOnly,false,'a rejected UI toggle must not persist as enabled');
  }finally{player?.close();await s.close();}
});

test('failed playlist reads skip forward once even with repeat enabled, and an all-failed queue terminates',native,async()=>{
  const s=await setup({videoCount:3,beforeMedia:async({image})=>image?null:{status:404}});let player;
  try{
    await invoke(s.view,'preferences.set',{key:'loop',value:true});
    await invoke(s.view,'playlist.start');
    await until(()=>s.fixture.requests.some(r=>r.path.endsWith('/play')),'real failed stream attempted');
    await until(async()=>!(await command(s.app,'player.state')).opened,'bounded failed queue closes rather than looping/retrying',20000);
    const reads=s.fixture.requests.filter(r=>r.path.endsWith('/play')).length;assert(reads>0&&reads<=6,'at most the finite queue plus one bounded preload, not a repeated playlist');
    await sleep(1200);assert.equal(s.fixture.requests.filter(r=>r.path.endsWith('/play')).length,reads,'no traffic after terminal failure');
    assert.match(await s.view.evaluate("document.getElementById('notice').textContent"),/加载失败/);
  }catch(error){console.log(JSON.stringify({scenario:'terminal playlist read failures',native:await command(s.app,'player.state').catch(String),reads:s.fixture.requests.filter(r=>r.path.endsWith('/play'))}));throw error;}
  finally{player?.close();await s.close();}
});
test('gallery segment playback starts at the browsed item, deduplicates videos and ignores list multiselection',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:8});
    const image=await invoke(s.view,'image.state');
    await invoke(s.view,'selection.toggle',{kind:'video',id:'video-5',enabled:true});
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const queue=(await invoke(player,'player.state')).queue;
    assert.equal(queue.id,image.current.videoId);assert.equal(queue.total,4);assert.equal(queue.segmentLengthMs,3000);
    await assert.rejects(invoke(s.view,'playlist.sequential'),/多选/);
  }finally{player?.close();await s.close();}
});
test('the final non-looped segment closes playback and returns to the library instead of remaining paused',native,async()=>{
  const s=await setup({videoDuration:6,videoCount:2});let player;
  try{
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.seekQueue',{ratio:1});
    const current=await until(async()=>{const v=await invoke(player,'player.state');return v.queue.index===1&&v.renderedFrames>0?v:null;},'actual final segment displays',25000);
    await invoke(player,'player.control',{command:'seek',value:current.queue.segmentStartMs+current.queue.segmentLengthMs-50});
    await until(async()=>!(await command(s.app,'player.state')).opened,'final segment closes natively',8000);
    assert.equal(await s.view.evaluate("document.querySelectorAll('.wb-dialog[open]').length>0"),true,'existing gallery context survives');
  }finally{player?.close();await s.close();}
});
test('video from a screenshot returns to that exact image; arrows pop to the parent image queue; closing commits marks only once',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    await invoke(s.view,'image.step',{direction:-1});const wrapped=await invoke(s.view,'image.state');assert.equal(wrapped.index,wrapped.total-1);
    await invoke(s.view,'image.step',{direction:1});assert.equal((await invoke(s.view,'image.state')).index,0);
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    assert.equal((await invoke(player,'player.state')).queue.options.origin,'frame');
    await command(s.app,'player.next');player.close();player=null;
    await until(async()=>(await invoke(s.view,'image.state')).index===1,'next returns to parent screenshot rather than a different video queue');
    const parent=await invoke(s.view,'image.state');
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.mark');assert.equal(s.fixture.trash.length,0);
    await command(s.app,'player.back');player.close();player=null;
    assert.equal((await invoke(s.view,'image.state')).index,parent.index);assert.equal(s.fixture.trash.length,0,'returning within the preview stack must not commit pending marks');
    assert.equal((await invoke(s.view,'preview.pending')).items.length,1);
    await invoke(s.view,'image.close');
    await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running;},'explicit marks commit when the preview actually closes');
    assert.equal(s.fixture.trash.length,1);assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path.startsWith('/api/v1/trash/video/')).length,1);
  }finally{player?.close();await s.close();}
});
test('player favorites update the library, and a failed preview write is terminal rather than replayed on the next close',native,async()=>{
  const s=await setup({failTrashIds:['video:video-0']});let player;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.favorite');assert(s.fixture.favorites.has('video:video-0'));
    await invoke(s.view,'favorite.toggle',{kind:'video',id:'video-0'});assert.equal(s.fixture.favorites.has('video:video-0'),false);
    await invoke(player,'player.mark');assert.equal((await invoke(s.view,'workbench.diagnostics')).selected,0,'preview marks are not list multiselection');
    await invoke(s.view,'player.close');player.close();player=null;
    const result=await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running?r:null;},'failed write is shown as a terminal result');
    assert.equal(result.items[0].success,false);assert.match(result.items[0].error,/403|read-only/);
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    await invoke(s.view,'player.close');player.close();player=null;await sleep(300);
    assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/video/video-0').length,1,'no automatic replay or ABA rearming');
  }finally{player?.close();await s.close();}
});

test('a normal video card retains its first matching screenshot as the parent, without displaying the gallery before playback',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    const queue=(await invoke(player,'player.state')).queue;assert.equal(queue.id,'video-1');assert.equal(queue.options.origin,'frame');
    assert.equal(await s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),false,'metadata preparation cannot pop a gallery in front of the clicked video');
    await command(s.app,'player.back');player.close();player=null;
    const parent=await until(async()=>{const v=await invoke(s.view,'image.state');return v.opened&&v.current?.videoId==='video-1'?v:null;},'ordinary video returns to the reference parent screenshot');
    assert.equal(parent.index,8,'first matching frame, not the last browsed frame');
    await invoke(s.view,'image.close');
  }finally{player?.close();await s.close();}
});

test('slideshow preview marks use the same one-shot close lifecycle as image and video previews',native,async()=>{
  const s=await setup();
  try{
    await invoke(s.view,'category',{kind:'picture'});
    await invoke(s.view,'viewer.open',{mode:'slideshow',source:'picture'});
    await until(()=>s.view.evaluate("document.querySelector('#wb-viewer .wb-slide img')?.naturalWidth>0"),'real slideshow picture');
    await invoke(s.view,'viewer.toggle');
    await invoke(s.view,'selection.markCurrent');
    const marks=await invoke(s.view,'preview.pending');assert.equal(marks.items.length,1);assert.equal(s.fixture.trash.length,0);
    await invoke(s.view,'panel.close',{id:'wb-viewer'});
    await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running;},'closing slideshow commits its mark');
    assert.equal(s.fixture.trash[0].id,marks.items[0].id);assert.equal(s.fixture.trash[0].media_type,'picture');
    await invoke(s.view,'panel.close',{id:'wb-viewer'});await sleep(100);
    assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/picture/'+marks.items[0].id).length,1);
  }finally{await s.close();}
});

test('the screenshot collection scrubber, Home/End, wheel and swipe navigate images rather than video time',async()=>{
  const s=await setup({picturesOnly:true,pictureCount:80});
  const key=async(name,code,eventCode=name)=>{await s.view.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:eventCode,windowsVirtualKeyCode:code});await s.view.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:eventCode,windowsVirtualKeyCode:code});};
  try{
    await s.view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    assert.deepEqual(await invoke(s.view,'image.state'),{opened:false,previewId:null,index:0,total:0,current:null},'closed preview state is valid JSON');
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    const count=(await invoke(s.view,'image.state')).total;assert.equal(count,32);
    await until(()=>s.view.evaluate("document.getElementById('full-image').complete&&document.getElementById('full-image').naturalWidth>0"),'first screenshot actually decoded');
    await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await s.view.evaluate("window.__imageKeys=[];document.addEventListener('keydown',event=>window.__imageKeys.push({key:event.key,code:event.code,target:event.target.tagName,active:document.activeElement?.id,prevented:event.defaultPrevented}),true)");
    assert.equal(await s.view.evaluate("document.activeElement?.classList.contains('image-stage')"),true,'opening the preview puts keyboard focus on its navigable region, not an old page input');
    await key('End',35);await until(async()=>(await invoke(s.view,'image.state')).index===count-1,'End selects the last screenshot');
    await key('Home',36);await until(async()=>(await invoke(s.view,'image.state')).index===0,'Home selects the first screenshot');
    await invoke(s.view,'shortcuts.set',{scope:'image',command:'next',combo:'KeyN'});
    await key('ArrowRight',39);await until(()=>s.view.evaluate("window.__imageKeys.some(k=>k.code==='ArrowRight')"),'old key actually delivered');
    assert.equal((await invoke(s.view,'image.state')).index,0,'remapped keys must not fall through to the obsolete arrow binding');
    await key('n',78,'KeyN');await until(async()=>(await invoke(s.view,'image.state')).index===1,'custom image shortcut navigates');
    await invoke(s.view,'shortcuts.reset');await invoke(s.view,'image.seek',{ratio:0});
    const slider=await s.view.evaluate("(()=>{const r=document.getElementById('image-collection-seek').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...slider});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...slider});
    await until(async()=>{const v=await invoke(s.view,'image.state');return v.index>0&&v.index<count-1;},'pointer scrubber reaches a middle frame');
    const ratio=await s.view.evaluate("Number(document.getElementById('image-collection-seek').value)/1000");assert.equal((await invoke(s.view,'image.state')).index,Math.round(ratio*(count-1)));
    await invoke(s.view,'image.seek',{ratio:0});
    const point=await s.view.evaluate("(()=>{const r=document.querySelector('.image-stage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:-120,...point});await until(async()=>(await invoke(s.view,'image.state')).index===count-1,'wheel wraps to previous screenshot');
    await invoke(s.view,'image.seek',{ratio:0});
    await s.view.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1,id:1}]});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-100,y:point.y,radiusX:1,radiusY:1,force:1,id:1}]});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until(async()=>(await invoke(s.view,'image.state')).index===1,'horizontal touch swipe reaches next screenshot');
    assert.equal(s.fixture.requests.filter(r=>r.path.endsWith('/play')).length,0,'collection navigation must not open video streams');
    await invoke(s.view,'image.favorite');assert(s.fixture.favorites.has('video:video-0'),'a screenshot star favorites its video, not the frame ID');
    assert.deepEqual((await invoke(s.view,'ui.contract')).missing,[]);
    for(const [width,height]of [[800,550],[360,800]]){
      await s.view.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const outside=await s.view.evaluate("(()=>{const d=document.getElementById('image-dialog').getBoundingClientRect();return [...document.querySelectorAll('#image-dialog button,#image-dialog input')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.top<d.top||r.bottom>d.bottom+1||r.left<d.left||r.right>d.right+1}).map(n=>n.id||n.textContent)})()");
      assert.deepEqual(outside,[],`all preview controls are reachable at ${width}x${height}`);
      const shot=await s.view.send('Page.captureScreenshot',{format:'png'}),file=path.join(s.app.artifactDir,`rhvideo-image-navigation-${width}.png`);fs.writeFileSync(file,Buffer.from(shot.data,'base64'));console.log(JSON.stringify({imagePreviewScreenshot:file}));
    }
    await invoke(s.view,'image.close');await invoke(s.view,'panel.close',{id:'wb-gallery'});const pictures=await invoke(s.view,'category',{kind:'picture'});
    await invoke(s.view,'media.open',{kind:'picture',id:pictures.items[0].id});await invoke(s.view,'image.seek',{ratio:1});const last=(await invoke(s.view,'image.state')).current;
    assert(!pictures.items.some(item=>item.id===last.id),'favorite target is outside the visible card page');
    await invoke(s.view,'image.favorite');assert(s.fixture.favorites.has('picture:'+last.id));assert.equal(await s.view.evaluate("document.getElementById('wb-image-favorite').getAttribute('aria-pressed')"),'true');
    await invoke(s.view,'image.close');await invoke(s.view,'image.preview',{path:'/storage/pictures/0.svg',title:'任务图片'});
    assert.equal((await invoke(s.view,'image.state')).current,null,'task enlargement uses its own panel, not the catalog preview queue');
    await invoke(s.view,'panel.close',{id:'wb-image-preview'});await invoke(s.view,'trash.preview',{path:'/storage/pictures/0.svg',title:'暂存图片'});
    assert.deepEqual((await invoke(s.view,'image.state')).current,{id:null,kind:null,videoId:null,seconds:null},'non-catalog trash previews also expose serializable state');
  }catch(error){console.log(JSON.stringify({scenario:'image input navigation',state:await invoke(s.view,'image.state').catch(diagnosticError=>({diagnosticError:String(diagnosticError)})),ui:await s.view.evaluate("({keys:window.__imageKeys,notice:document.getElementById('notice').textContent,focused:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,300),dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})").catch(diagnosticError=>({diagnosticError:String(diagnosticError)}))}));throw error;}
  finally{await s.close();}
});

test('full-length playback with missing catalog duration is not cut off at the short segment fallback',native,async()=>{
  const s=await setup({videoMetadataDuration:0});let player;
  try{
    await invoke(s.view,'preferences.set',{key:'fullLength',value:true});
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.segmentDuration,0);assert.equal(initial.queue.segmentLengthMs,86400000,'reference full-length uses a one-day unknown-duration guard, not the three-second segment setting');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'unknown-duration source actually displays frames',25000);
    await invoke(player,'player.control',{command:'pause'});
    await invoke(player,'player.options',{fullLength:false});assert.equal((await invoke(player,'player.state')).queue.segmentLengthMs,3000);
    await invoke(player,'player.options',{fullLength:true});assert.equal((await invoke(player,'player.state')).queue.segmentLengthMs,86400000,'live options use the same reference fallback as initial preparation');
    await invoke(player,'player.control',{command:'seek',value:6000});await invoke(player,'player.control',{command:'resume'});
    await until(async()=>{const v=await invoke(player,'player.state');assert.equal(v.queue?.id,initial.queue.id,'the original source must remain active beyond three seconds');return v.renderedFrames>0&&v.decoderPositionMs>=7000;},'full-length source continues past short-segment cutoff',20000);
  }finally{player?.close();await s.close();}
});

test('closing a parent preview stops its video; an old return cannot navigate a later preview of the same screenshot',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    const old=await invoke(player,'player.state');
    await invoke(s.view,'image.close');player.close();player=null;
    assert.equal((await command(s.app,'player.state')).opened,false,'closing the parent ends the complete preview stack');
    await invoke(s.view,'gallery.inspect',{index:0});
    const image=await invoke(s.view,'image.state');assert.notEqual(image.previewId,old.queue.options.parentPreview);
    const stale=await invoke(s.view,'image.returnFromVideo',{generation:old.generation,parentKey:old.queue.options.parentKey,parentPreview:old.queue.options.parentPreview,direction:1});
    assert.equal(stale.stale,true);assert.equal((await invoke(s.view,'image.state')).index,0);
  }finally{player?.close();await s.close();}
});

test('a reused player window adopts the new native session and never sends favorite writes to its former server',native,async()=>{
  const s=await setup();let player,other;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    const old=await invoke(player,'player.state');
    other=await rhvideoFixture({videoFile:path.join(s.app.directory,'behavior.mp4'),videoDuration:14,videoCount:6});
    await invoke(s.view,'connection.connect',{server:other.url,username:'preview',password:'fixture-only'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});
    await until(async()=>{const v=await invoke(player,'player.state');return v.generation>old.generation&&v.queue?.id==='video-1';},'existing controls adopt the new server session');
    await invoke(player,'player.favorite');assert(other.favorites.has('video:video-1'));assert.equal(s.fixture.favorites.size,0);
  }finally{player?.close();await s.close();await other?.close();}
});

test('clicking the screenshot itself plays its source from the start; the explicit frame action seeks to that screenshot',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:3});
    const image=await invoke(s.view,'image.state');assert.equal(image.current.seconds,6);
    await s.app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    await until(()=>s.view.evaluate("document.getElementById('full-image').complete&&document.getElementById('full-image').naturalWidth>0"),'clicked screenshot actually decoded');
    await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await s.view.evaluate("(()=>{const r=document.getElementById('full-image').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    player=await target(s.app,'rhvideo-player.html');const start=await invoke(player,'player.state');assert.equal(start.queue.id,image.current.videoId);assert(start.positionMs<3000,'the reference screenshot click plays the source, not the selected frame timestamp');
    await command(s.app,'player.back');player.close();player=null;
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');const frame=await invoke(player,'player.state');assert(frame.positionMs>=5900,'the separate play-this-frame action retains timestamp seeking');
  }finally{player?.close();await s.close();}
});
