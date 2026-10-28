// Experience regressions: exercise the real packaged client and native broker,
// not only whether an API exists or an ideal localhost file eventually plays.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp,until,sleep} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

async function viewFor(app,file){
  const target=await until(async()=>{
    const response=await fetch(`http://127.0.0.1:${app.port}/json/list`);
    return (await response.json()).find(t=>new URL(t.url).pathname.endsWith('/'+file));
  },file+' target');
  const view=await cdpSession(target,30000);
  const action=file==='rhvideo-player.html'?'rhvideo.player.state':'rhvideo.category';
  await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==='+JSON.stringify(action)+')'),'real UI APIs');
  return view;
}
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
async function library(app,fixture){
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const view=await viewFor(app,'rhvideo.html');
  await invoke(view,'category',{kind:'video'});await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  return view;
}
function makeVideo(directory,duration=12){
  const file=path.join(directory,'pressure-sample.mp4');
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
  return file;
}

test('slow concurrent media reads queue instead of permanently failing image requests with 503',async()=>{
  const app=await launchApp({emulateFocus:true});let held=false,entered=0,release;
  const gate=new Promise(resolve=>release=resolve);
  const fixture=await rhvideoFixture({beforeMedia:async()=>{if(held){entered++;await gate;}}});let view;
  try{
    view=await library(app,fixture);
    await until(()=>view.evaluate("[...document.querySelectorAll('.cover-button img')].filter(n=>n.complete&&n.naturalWidth>0).length>=12"),'initial covers loaded');
    const urls=await view.evaluate("[...document.querySelectorAll('.cover-button img')].map(n=>n.src)");
    held=true;
    const pending=urls.slice(0,12).map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();return r.status;});
    await until(()=>entered>=12,'twelve real upstream image reads held');
    const overflow=fetch(urls[12],{signal:AbortSignal.timeout(10000)}).then(async r=>{await r.arrayBuffer();return r.status;});
    await sleep(200);release();
    const statuses=await Promise.all([...pending,overflow]);
    const direct=await Promise.all(Array.from({length:13},async(_,i)=>{const r=await fetch(fixture.url+'/api/v1/videos/video-'+i+'/thumbnail',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}});await r.arrayBuffer();return r.status;}));
    assert.deepEqual(direct,Array(13).fill(200),'the upstream itself does not reject this concurrency');
    console.log(JSON.stringify({scenario:'slow media concurrency',statuses,direct,upstreamRequests:entered}));
    assert.deepEqual(statuses,Array(13).fill(200),'a temporary local concurrency limit must not become a broken image');
  }finally{release();view?.close();app.close();await fixture.close();}
});

test('an explicitly refreshed failed cover is requested again rather than reusing a hidden broken image',async()=>{
  const app=await launchApp({emulateFocus:true});let failures=1,view;
  const fixture=await rhvideoFixture({beforeMedia:async({path})=>{if(path==='/api/v1/videos/video-0/thumbnail'&&failures-->0)return {status:404};}});
  try{
    view=await library(app,fixture);
    await until(()=>view.evaluate("document.querySelector('.media-card[data-id=\"video-0\"] img')?.hidden===true"),'failed cover visibly marked');
    await invoke(view,'refresh');
    await until(()=>view.evaluate("(()=>{const n=document.querySelector('.media-card[data-id=\"video-0\"] img');return n?.complete&&n.naturalWidth>0&&!n.hidden;})()"),'explicit refresh loads failed cover again',4000);
    assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/videos/video-0/thumbnail').length,2,'one failed read, one explicit refresh; no automatic retry loop');
  }finally{view?.close();app.close();await fixture.close();}
});

const native={skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'};

test('valid streamed WebP is content-detected without byte loss, while HTML mislabeled as an image is rejected',async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view;
  try{
    const webp=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=teal:size=640x360','-frames:v','1','-c:v','libwebp','-f','image2pipe','pipe:1'],{windowsHide:true,timeout:15000});
    fixture=await rhvideoFixture({beforeMedia:async({path})=>{
      if(path==='/api/v1/videos/video-0/thumbnail')return {body:webp,splitAt:7};
      if(path==='/api/v1/videos/video-1/thumbnail')return {body:Buffer.from('<html>sign in required</html>'),contentType:'image/png'};
    }});
    view=await library(app,fixture);
    await until(()=>view.evaluate("document.querySelector('.media-card[data-id=\"video-0\"] img')?.naturalWidth===640"),'actual octet-stream WebP renders');
    const urls=await view.evaluate("['video-0','video-1'].map(id=>document.querySelector('.media-card[data-id=\"'+id+'\"] img').src)");
    const response=await fetch(urls[0]);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),webp,'prefix inspection replays all bytes in order, including a split signature');
    assert.equal((await fetch(urls[1])).status,415,'a successful HTTP status/image MIME label cannot turn HTML into an image');
  }finally{view?.close();app.close();await fixture?.close();}
});
test('clicking one video opens that exact file, not the selected/portrait-filtered playlist',native,async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory),videoDuration:12});view=await library(app,fixture);
    await invoke(view,'selection.toggle',{kind:'video',id:'video-0',enabled:true});
    await invoke(view,'media.open',{kind:'video',id:'video-1'});player=await viewFor(app,'rhvideo-player.html');
    const state=await invoke(player,'player.state');
    assert.equal(state.queue.id,'video-1','the clicked ID must not silently become a different selected file');
    assert.equal(state.queue.total,1,'ordinary playback is distinct from explicitly starting a playlist');
    await invoke(view,'player.close');player.close();player=null;
    await invoke(view,'selection.clear');await invoke(view,'preferences.set',{key:'portraitOnly',value:true});
    await invoke(view,'media.open',{kind:'video',id:'video-2'});player=await viewFor(app,'rhvideo-player.html');
    assert.equal((await invoke(player,'player.state')).queue.id,'video-2','playlist-only filters must not prevent direct playback');
  }finally{player?.close();view?.close();app.close();await fixture?.close();}
});

test('playlist preloading starts only after the current native video has displayed a frame',native,async()=>{
  const app=await launchApp({emulateFocus:true});let release,fixture,view,player;
  const gate=new Promise(resolve=>release=resolve);
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory),videoDuration:12,beforeMedia:async({path})=>{if(path==='/api/v1/videos/video-0/play')await gate;}});
    view=await library(app,fixture);await invoke(view,'playlist.sequential');player=await viewFor(app,'rhvideo-player.html');
    await until(()=>fixture.requests.some(r=>r.path==='/api/v1/videos/video-0/play'),'current video requested');
    await sleep(800);
    assert.equal(fixture.requests.some(r=>r.path==='/api/v1/videos/video-1/play'),false,'prefetch must not compete with a current video still waiting for its first byte');
    release();
    await until(async()=>{const s=await invoke(player,'player.state');return s.renderedFrames>0;},'actual first frame',25000);
    await until(()=>fixture.requests.some(r=>r.path==='/api/v1/videos/video-1/play'),'next video preloaded after first frame',10000);
  }finally{release();player?.close();view?.close();app.close();await fixture?.close();}
});

test('repeat loops the current video instead of silently advancing through the queue',native,async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory,6),videoDuration:6,videoCount:3});view=await library(app,fixture);
    await invoke(view,'volume.set',{value:50});
    await invoke(view,'playlist.sequential');player=await viewFor(app,'rhvideo-player.html');
    const playing=await until(async()=>{const s=await invoke(player,'player.state');return s.renderedFrames>0&&s.durationMs>5000?s:null;},'real playback before repeat',25000);
    await invoke(player,'player.loop');
    await player.send('Page.setWebLifecycleState',{state:'frozen'});
    await app.evaluate("call('rhvideo_request',{action:'player.control',args:{command:'seek',value:"+(playing.durationMs-150)+"}})");
    await sleep(1800);
    const repeated=await app.evaluate("call('rhvideo_request',{action:'player.state',args:{}})");
    console.log(JSON.stringify({repeat:{before:{id:playing.queue.id,revision:playing.queue.revision},after:repeated,error:await player.evaluate("document.getElementById('error').textContent")}}));
    assert.equal(repeated.queue.id,playing.queue.id,'RHVideo repeat means the current item, not queue wraparound');
    assert(repeated.positionMs<4000,'the current item must have restarted rather than staying ended');
    await until(async()=>{const s=await app.evaluate("call('rhvideo_request',{action:'player.state',args:{}})");return s.queue.id===playing.queue.id&&s.state===3&&s.renderedFrames>0&&s.positionMs>100&&s.positionMs<4000;},'actual resumed current-item frames',10000);
    const stale=await app.evaluate("call('rhvideo_request',{action:'player.repeatCurrent',args:"+JSON.stringify({expectedId:playing.queue.id,expectedRevision:playing.queue.revision})+"})");
    assert.equal(stale.stale,true,'a repeat request from before the loop option revision cannot control this queue');
  }finally{player?.close();view?.close();app.close();await fixture?.close();}
});

test('repeating a gallery segment keeps its planned start instead of drawing a new random segment on each repeat',native,async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory,12),videoDuration:12,videoCount:2});view=await library(app,fixture);
    await invoke(view,'preferences.set',{key:'fullLength',value:false});await invoke(view,'preferences.set',{key:'segment',value:3});
    await invoke(view,'playlist.start');player=await viewFor(app,'rhvideo-player.html');
    const current=await until(async()=>{const s=await invoke(player,'player.state');return s.renderedFrames>0&&s.durationMs===12000?s:null;},'real random segment frames',25000);
    assert.equal(current.queue.total,2);assert.equal(current.queue.hasNext,true);
    const start=current.queue.segmentStartMs,end=start+3000;assert(start>0&&end<=12000);
    await invoke(player,'player.loop');
    await invoke(player,'player.control',{command:'seek',value:end-100});
    const repeated=await until(async()=>{const s=await invoke(player,'player.state');return s.state===3&&s.decoderPositionMs>=start-200&&s.decoderPositionMs<end-900?s:null;},'repeat returns to the same segment start',6000);
    assert.equal(repeated.queue.id,current.queue.id);assert.equal(repeated.queue.segmentStartMs,start);
  }finally{player?.close();view?.close();app.close();await fixture?.close();}
});

test('closing the single-video player leaves independent multi-video playback running',native,async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory),videoDuration:12,videoCount:4});view=await library(app,fixture);
    await invoke(view,'preferences.set',{key:'gridCount',value:4});
    await invoke(view,'grid.open');
    await until(async()=>{const s=await invoke(view,'grid.state');return s.cells?.length===4&&s.cells.every(c=>c.renderedFrames>0);},'four actual independent video surfaces',25000);
    await invoke(view,'media.open',{kind:'video',id:'video-0'});player=await viewFor(app,'rhvideo-player.html');
    const single=await invoke(player,'player.state');
    await invoke(view,'grid.open');
    const afterOpen=await invoke(player,'player.state');assert.equal(afterOpen.opened,true);assert.equal(afterOpen.inputId,single.inputId,'opening an independent grid cannot stop or replace the single-video decoder');
    await invoke(view,'player.close');player.close();player=null;
    const grid=await invoke(view,'grid.state');assert.equal(grid.cells.length,4,'closing one player must not execute stop-all');
    assert(grid.cells.every(c=>c.opened),'independent native engines remain available');
  }finally{player?.close();view?.close();app.close();await fixture?.close();}
});

test('native grid gain is independent for each real audio output, not only the UI slider',native,async t=>{
  const app=await launchApp({emulateFocus:true});let fixture,view;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory),videoDuration:12,videoCount:2});view=await library(app,fixture);
    await invoke(view,'volume.set',{value:50});await invoke(view,'grid.open');
    await until(async()=>{const s=await invoke(view,'grid.state');return s.cells?.length===2&&s.cells.every(c=>c.renderedFrames>0);},'actual grid streams',25000);
    const initial=await invoke(view,'grid.state');
    assert(initial.cells.every(c=>c.volume===100&&!c.muted),'reference defaults all cells to audible; it does not silently mute every cell except the first');
    console.log(JSON.stringify({initialAudio:initial.cells.map(c=>({requested:c.volume,master:c.masterVolume,actual:c.decoderVolume,state:c.state}))}));
    if(initial.cells.every(c=>c.decoderVolume<0)){t.skip('This runner has no available audio output endpoint; no audible-output claim');return;}
    assert(initial.cells.every(c=>Math.abs(c.decoderVolume-Math.floor(c.volume*(c.masterVolume??50)/100))<=3),'each initial decoder gain must honor its own mute/volume and the page gain');
    await invoke(view,'volume.set',{value:100});
    await invoke(view,'grid.control',{target:0,command:'volume',value:0});
    await invoke(view,'grid.control',{target:1,command:'volume',value:50});await sleep(200);
    const state=await invoke(view,'grid.state');
    console.log(JSON.stringify({audio:state.cells.map(c=>({requested:c.volume,actual:c.decoderVolume}))}));
    if(state.cells.every(c=>c.decoderVolume<0)){t.skip('This runner has no available audio output endpoint; no audible-output claim');return;}
    assert.equal(state.cells[0].decoderVolume,0,'a different cell must not unmute this one');
    assert(Math.abs(state.cells[1].decoderVolume-50)<=3,'the unmuted cell retains its own gain');
  }finally{view?.close();app.close();await fixture?.close();}
});

test('native playlist advances even while the controls WebView is frozen',native,async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    fixture=await rhvideoFixture({videoFile:makeVideo(app.directory,6),videoDuration:6,videoCount:3});view=await library(app,fixture);
    await invoke(view,'playlist.sequential');player=await viewFor(app,'rhvideo-player.html');
    const playing=await until(async()=>{const s=await invoke(player,'player.state');return s.renderedFrames>0&&s.durationMs>5000?s:null;},'native current frames',25000);
    await player.send('Page.setWebLifecycleState',{state:'frozen'});
    await app.evaluate("call('rhvideo_request',{action:'player.control',args:{command:'seek',value:"+(playing.durationMs-150)+"}})");
    await until(async()=>{const s=await app.evaluate("call('rhvideo_request',{action:'player.state',args:{}})");return s.queue?.id==='video-1'&&s.renderedFrames>0;},'next native video without UI timers',15000);
  }finally{player?.close();view?.close();app.close();await fixture?.close();}
});
