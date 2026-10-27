// Behavioral acceptance, alongside the differential oracle that executes the
// reference functions. These tests inspect real native frames/server writes,
// not only API enumeration. All media/profiles are generated and disposable.
import test from 'node:test';
import assert from 'node:assert/strict';
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
    const duration=options.videoDuration??14,file=path.join(app.directory,'behavior.mp4');
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
    fixture=await rhvideoFixture({videoFile:file,videoDuration:duration,videoCount:6,...options});
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
