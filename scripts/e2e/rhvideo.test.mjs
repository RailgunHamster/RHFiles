import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {createHash} from 'node:crypto';
async function target(app,file){
  const found=await until(async()=>{
    const response=await fetch('http://127.0.0.1:'+app.port+'/json/list');
    return (await response.json()).find(t=>new URL(t.url).pathname.endsWith('/'+file));
  },file+' packaged app window');
  const session=await cdpSession(found,30000);
  await until(()=>session.evaluate("!!globalThis.RHFilesAPI?.list().some(a=>['rhvideo.state','rhvideo.player.state','rhvideo.grid.state'].includes(a.id))"),'view actions registered');
  const code={'rhvideo.html':'rhvideo-workbench.js','rhvideo-player.html':'rhvideo-player.js','rhvideo-grid.html':'rhvideo-grid.js'}[file];
  if(code){const served=await session.evaluate('fetch('+JSON.stringify('js/'+code)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+code,import.meta.url),'utf8'),hash=text=>createHash('sha256').update(text).digest('hex');assert.equal(hash(served),hash(source),'The tested executable must embed the current '+code);}
  return session;
}
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
test('RHVideo packaged UI, real native HTTP bridge, reader, favorites, paging and credential boundary',async()=>{
  const app=await launchApp({emulateFocus:true}),fixture=await rhvideoFixture({failTrashIds:['picture:picture-1']});let view;
  try{
    assert.equal(await app.evaluate("!!document.getElementById('rhvideo-open')"),true);
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    view=await target(app,'rhvideo.html');
    await until(()=>view.evaluate("document.getElementById('library-status').textContent.includes('把你的媒体库')"),'disconnected state');
    await invoke(view,'connection.open');
    await assert.rejects(invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'bad'}),/401/);
    assert.equal(await view.evaluate("document.getElementById('password').value"),'');
    const connected=await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    assert.equal(connected.total,52);assert.equal(connected.items.length,36);
    const actions=await view.evaluate("RHFilesAPI.list().map(v=>v.id)");for(const name of ['sort','rules.apply','selection.toggle','novel.preview','gallery.open','viewer.open','grid.open','remote.watch.add','remote.tasks.detail','remote.batches.create','remote.trash.restore','remote.storage.usage','remote.system.restart','remote.cleanup.execute'])assert(actions.includes('rhvideo.'+name),name+' public interface');
    const pinyin=await invoke(view,'search',{query:'shanye'});assert(pinyin.total>0);assert(pinyin.items.every(v=>v.folder==='山野与旅途'));await invoke(view,'search',{query:''});
    const reverse=await invoke(view,'sort',{value:'nameDesc'});assert(reverse.total===52);await invoke(view,'sort',{value:'dateDesc'});
    await invoke(view,'rules.apply',{rule:{mode:'and',include:['山野与旅途'],exclude:[]}});assert.equal((await invoke(view,'state')).total,13);await invoke(view,'rules.apply',{rule:{}});
    await invoke(view,'server.open',{page:'watch'});assert.equal(await view.evaluate("document.querySelectorAll('#wb-server .wb-row').length"),1);await invoke(view,'watch.add',{path:'D:\\OnlyFixture'});assert.equal(fixture.watch.length,2);
    await invoke(view,'remote.watch.update',{params:{id:'watch-0'},body:{enabled:false}});assert.equal(fixture.watch[0].enabled,false);
    await assert.rejects(invoke(view,'remote.watch.remove',{params:{id:'watch-0'}}),/confirmation/);
    const confirmation=await invoke(view,'confirm.begin',{name:'watch.remove',params:{id:'watch-0'}});await invoke(view,'confirm.advance',{ticket:confirmation.ticket});assert.equal(fixture.watch.length,2);await invoke(view,'confirm.advance',{ticket:confirmation.ticket});assert.equal(fixture.watch.length,1);await assert.rejects(invoke(view,'confirm.advance',{ticket:confirmation.ticket}),/失效/);
    await invoke(view,'server.open',{page:'tasks'});assert.equal(await view.evaluate("[...document.querySelectorAll('#wb-server button')].some(b=>/重试|取消失败/.test(b.textContent))"),false);await invoke(view,'task.detail',{kind:'default',id:'video:video-0'});await invoke(view,'panel.close',{id:'wb-info'});
    for(const page of ['trash','storage','system'])await invoke(view,'server.open',{page});await invoke(view,'panel.close',{id:'wb-server'});
    assert.deepEqual((await invoke(view,'ui.contract')).missing,[],'every declared UI action must have an enumerable public API');
    await invoke(view,'gallery.open');assert.equal(await view.evaluate("document.querySelectorAll('.wb-frame').length"),32);await invoke(view,'gallery.save',{name:'固定截图顺序'});await invoke(view,'gallery.shuffle');await invoke(view,'gallery.resume',{name:'固定截图顺序'});await invoke(view,'panel.close',{id:'wb-gallery'});
    await until(()=>view.evaluate("document.querySelectorAll('.cover-button img.loaded').length>=8"),'native-authenticated thumbnails decoded');
    const shot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'rhvideo-videos.png'),Buffer.from(shot.data,'base64'));
    assert.equal(await view.evaluate("document.querySelectorAll('iframe,video').length"),0);
    const configPath=path.join(app.profile.dataDirectory,'rhvideo-client.json'),config=fs.readFileSync(configPath,'utf8');
    assert.doesNotMatch(config,/fixture-only|fixture-bearer|password|token/);
    const page=await invoke(view,'page',{direction:1});assert.equal(page.offset,36);assert.equal(page.items.length,16);
    const search=await invoke(view,'search',{query:'清晨'});assert(search.items.length>0&&search.items.every(v=>v.title.includes('清晨')));
    const all=await invoke(view,'search',{query:''}),media=all.items[0];
    await view.evaluate("window.__favoriteCover=document.querySelector('.cover-button img')");
    await invoke(view,'favorite.toggle',{id:media.id,kind:media.kind});assert(fixture.favorites.has('video:'+media.id));
    assert.equal(await view.evaluate("document.querySelector('.cover-button img')===window.__favoriteCover"),true,'favorite toggle must retain decoded cover DOM');
    const favorite=await invoke(view,'category',{kind:'favorite'});assert.equal(favorite.total,1);
    await invoke(view,'favorite.toggle',{id:media.id,kind:'video'});assert.equal((await invoke(view,'state')).total,0);
    const pictures=await invoke(view,'category',{kind:'picture'});assert.equal(pictures.items.length,8);
    await invoke(view,'viewer.open',{mode:'strip',source:'picture'});assert((await invoke(view,'workbench.diagnostics')).index.collections.picture===8);assert.equal(await view.evaluate("document.querySelectorAll('#wb-viewer video,iframe').length"),0);assert(await view.evaluate("document.querySelector('.wb-strip-minimap').width>0"),'bounded visual minimap');await invoke(view,'viewer.seek',{ratio:.5});await invoke(view,'viewer.toggle');await invoke(view,'panel.close',{id:'wb-viewer'});
    await invoke(view,'viewer.open',{mode:'strip',source:'picture'});assert(Math.abs((await invoke(view,'viewer.state')).ratio-.5)<.05,'strip restores its filter/layout-scoped location');await invoke(view,'viewer.restart');assert((await invoke(view,'viewer.state')).ratio<.05);await invoke(view,'panel.close',{id:'wb-viewer'});
    await invoke(view,'viewer.open',{mode:'slideshow',source:'picture'});await until(()=>view.evaluate("document.querySelector('#wb-viewer .wb-slide img')?.naturalWidth>0"),'slideshow image decoded');await invoke(view,'viewer.toggle');await invoke(view,'viewer.step',{direction:1});await invoke(view,'panel.close',{id:'wb-viewer'});
    await invoke(view,'media.open',{id:pictures.items[0].id,kind:'picture'});await until(()=>view.evaluate("document.getElementById('full-image').naturalWidth>0"),'full image');
    assert.equal((await invoke(view,'image.step',{direction:1})).index,1);await invoke(view,'image.zoom',{delta:.25});assert.equal((await invoke(view,'selection.markCurrent')).enabled,true);assert.equal((await invoke(view,'selection.markCurrent')).enabled,false);await invoke(view,'image.close');
    await invoke(view,'category',{kind:'novel'});await invoke(view,'novel.preview',{id:'novel-0',offset:0});await invoke(view,'novel.previewMode',{flow:true});await invoke(view,'novel.previewStep',{direction:1});assert.equal(await view.evaluate("document.querySelectorAll('.wb-excerpts .wb-row').length"),1);await invoke(view,'panel.close',{id:'wb-preview'});await invoke(view,'media.open',{id:'novel-1',kind:'novel'});
    await until(async()=>{const s=await invoke(view,'state');return s.reader?.loaded&&s.reader.chapter===1;},'saved chapter resumed');
    await invoke(view,'reader.step',{direction:1});await until(async()=>{const s=await invoke(view,'state');return s.reader?.loaded&&s.reader.chapter===2;},'next chapter');
    await invoke(view,'reader.save');assert(fixture.progress.some(p=>p.chapter_index===2));await invoke(view,'reader.close');
    await invoke(view,'category',{kind:'video'});await invoke(view,'timeline.open',{id:'video-0',kind:'video'});
    assert.equal(await view.evaluate("document.querySelectorAll('.frame-button').length"),8);await invoke(view,'timeline.close');
    for(const [kind,id] of [['video','video-0'],['picture','picture-0'],['picture','picture-1']])await invoke(view,'selection.toggle',{kind,id,enabled:true});
    await invoke(view,'search',{query:'no matching title'});assert.equal((await invoke(view,'selection.snapshot')).items.length,3,'selection persists across categories and filtering');
    const batch=await invoke(view,'selection.stage');assert.equal(batch.count,3);await invoke(view,'confirm.advance',{ticket:batch.ticket});assert.equal(fixture.trash.length,0,'preview cannot mutate sources');
    const batchResult=await invoke(view,'confirm.advance',{ticket:batch.ticket});assert.equal(batchResult.succeeded,2);assert.equal(batchResult.failed,1);assert.equal(batchResult.notAttempted,0);assert.equal(fixture.trash.length,2);
    await assert.rejects(invoke(view,'confirm.advance',{ticket:batch.ticket}),/失效/);assert.equal(fixture.requests.filter(r=>r.path==='/api/v1/trash/picture/picture-1').length,1,'failed write is never replayed');
    assert.deepEqual((await invoke(view,'selection.result')).results,batchResult.results);await invoke(view,'panel.close',{id:'wb-info'});await invoke(view,'selection.clear');await invoke(view,'search',{query:''});
    const capabilities=await view.evaluate("[...document.querySelectorAll('.cover-button img')].map(n=>n.src)");
    assert.equal((await fetch(capabilities[0])).status,200);
    const forged=new URL(capabilities[0]);forged.pathname='/wrong-cap/1';assert.equal((await fetch(forged)).status,401);
    await invoke(view,'connection.logout');assert.equal((await fetch(capabilities[0])).status,401);
    await assert.rejects(app.evaluate("call('rhvideo_request',{action:'catalog',args:{kind:'video'}})"),/请先/);
    assert(fixture.requests.some(r=>r.authorization==='Bearer fixture-bearer-do-not-persist'&&r.path.endsWith('/thumbnail')));
    console.log(JSON.stringify({pass:true,artifacts:app.artifactDir,checks:'packaged UI, native bearer broker, favorite writes, pagination, image viewer, chapter/progress, timeline, logout capability revocation, no credential persistence'}));
  }finally{view?.close();await fixture.close();app.close();}
});
test('real libVLC decodes a streamed MP4 into a native Win32 surface without HTML video',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'},async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,view,player;
  try{
    const file=path.join(app.directory,'sample.mp4');
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','14','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
    fixture=await rhvideoFixture({videoFile:file});
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    const connected=await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    assert.equal(connected.nativePlayback,true,'VLC 3.x must be installed for native acceptance');
    await invoke(view,'media.open',{id:'video-0',kind:'video'});player=await target(app,'rhvideo-player.html');
    let lastState,samples=[];
    const playing=await until(async()=>{
      lastState=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.state')");if(samples.length<10)samples.push(lastState);return lastState.nativeSurface&&lastState.durationMs>0&&lastState.positionMs>500?lastState:null;
    },'real native playback progress',25000).catch(error=>{console.log(JSON.stringify({lastState,samples,requests:fixture.requests.filter(r=>r.path.endsWith('/play')).map(({path,range})=>({path,range}))}));throw error;});
    assert.equal(playing.engine,'libVLC');assert.equal(await player.evaluate("document.querySelectorAll('video,iframe').length"),0);
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.control',{command:'pause'})");
    assert(playing.renderedFrames>0,'actual native frames must have been presented');
    if(process.env.RHFILES_NATIVE_SCREENSHOT==='1'){console.log('Native player paused for visual inspection');await new Promise(resolve=>setTimeout(resolve,15000));}
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.control',{command:'seek',value:5000})");
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.control',{command:'resume'})");
    await until(async()=>{const v=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.state')");return v.positionMs>=5000;},'native seek resumed');
    const beforeNext=await invoke(player,'player.control',{command:'pause'});
    await until(async()=>{const s=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.preloadState')");return s.state==='ready';},'bounded native next-video preload',15000);
    await invoke(player,'player.control',{command:'volume',value:37});await invoke(player,'player.control',{command:'rate',value:1.25});
    const preloaded=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.next')");assert.equal(preloaded.preloaded,true,'next must consume a real decoded native preload');assert.equal(preloaded.volume,37);assert.equal(preloaded.rate,1.25);assert.deepEqual((await invoke(player,'ui.contract')).missing,[]);
    const late=await invoke(player,'player.next',{expectedId:beforeNext.queue.id,expectedRevision:beforeNext.queue.revision});assert.equal(late.stale,true);assert.equal(late.queue.index,1,'a delayed auto-next must not skip a second item');
    let afterNext;
    await until(async()=>{afterNext=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.state')");return afterNext.queue?.index===1&&afterNext.title.includes('海边');},'next video in native queue').catch(error=>{console.log(JSON.stringify({preloaded,afterNext}));throw error;});
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.previous')");
    await invoke(view,'favorite.toggle',{id:'video-0',kind:'video'});await invoke(view,'category',{kind:'picture'});await invoke(view,'favorite.toggle',{id:'picture-0',kind:'picture'});await invoke(view,'category',{kind:'favorite'});
    await invoke(view,'viewer.open',{mode:'slideshow',source:'favorite'});await invoke(view,'viewer.toggle');await invoke(view,'viewer.step',{direction:1});
    await until(async()=>{const s=await invoke(view,'viewer.mediaState');return s.nativeSurface&&s.renderedFrames>0;},'native video inside the mixed slideshow',20000);
    assert.equal(await view.evaluate("document.querySelectorAll('#wb-viewer video,iframe').length"),0);await invoke(view,'viewer.mediaControl',{command:'pause'});await invoke(view,'viewer.step',{direction:1});assert.equal((await invoke(view,'viewer.mediaState')).opened,false);await invoke(view,'panel.close',{id:'wb-viewer'});await invoke(view,'category',{kind:'video'});
    await invoke(view,'grid.open');const grid=await target(app,'rhvideo-grid.html');
    assert.deepEqual((await invoke(grid,'ui.contract')).missing,[]);
    try{await until(async()=>{const s=await invoke(grid,'grid.state');return s.cells.length===4&&s.cells.every(c=>c.renderedFrames>0);},'four native video surfaces decode',25000);await invoke(grid,'grid.control',{target:-1,command:'pause'});await invoke(grid,'grid.control',{target:0,command:'seek',value:3000});await invoke(grid,'grid.expand',{target:1});assert.equal((await invoke(grid,'grid.state')).expanded,1);await invoke(grid,'grid.expand',{target:-1});const nextGroup=await invoke(grid,'grid.page',{direction:1});assert.equal(nextGroup.offset,4);assert.equal(nextGroup.total,52);await until(async()=>{const s=await invoke(grid,'grid.state');return s.cells.every(c=>c.renderedFrames>0);},'next native group frames',25000);assert.equal((await invoke(grid,'grid.page',{direction:-1})).offset,0);console.log('PASS: four native libVLC cells, independent seek, all-player pause, expand/restore and full-library group navigation');await invoke(view,'grid.close');}finally{grid.close();}
    assert(fixture.requests.some(r=>r.path.endsWith('/play')));
    await invoke(view,'connection.logout');
    console.log(JSON.stringify({pass:true,checks:'native libVLC HWND, streamed MP4 decode, progress, pause, seek, resume, no HTML video'}));
  }finally{player?.close();view?.close();if(fixture)await fixture.close();app.close();}
});
const realSource=process.env.RHVIDEO_SOURCE||path.resolve(fileURLToPath(new URL('../../..',import.meta.url)),'RHVideo');
test('native 1080p H.264 and 4K HEVC streams decode actual input frames',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'},async()=>{
  const records=[];
  for(const entry of [{codec:'libx264',name:'H264-1080p',width:1920,height:1080},{codec:'libx265',name:'HEVC-4K',width:3840,height:2160}]){
    const app=await launchApp({emulateFocus:true});let fixture,view,player;
    try{
      const sample=path.join(app.directory,entry.name+'.mp4');
      execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i',`testsrc2=size=${entry.width}x${entry.height}:rate=12`,'-t','4','-c:v',entry.codec,'-threads','2','-preset','ultrafast',...(entry.codec==='libx265'?['-x265-params','pools=2:frame-threads=2:log-level=error']:[]),'-pix_fmt','yuv420p','-movflags','+faststart',sample],{windowsHide:true,timeout:120000,stdio:'pipe'});
      fixture=await rhvideoFixture({videoFile:sample});await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
      await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});const start=performance.now();await invoke(view,'timeline.play',{id:'video-0',seconds:0});player=await target(app,'rhvideo-player.html');
      const decoded=await until(async()=>{const s=await invoke(player,'player.state');return s.renderedFrames>0&&s.videoWidth===entry.width&&s.videoHeight===entry.height?s:null;},entry.name+' real native decoded frames',20000);
      records.push({codec:entry.name,firstFrameMs:performance.now()-start,renderer:decoded.renderer,width:decoded.videoWidth,height:decoded.videoHeight,displayed:decoded.renderedFrames,decoded:decoded.decodedFrames,lost:decoded.lostFrames});
      await invoke(player,'player.control',{command:'pause'});await invoke(view,'connection.logout');
    }finally{player?.close();view?.close();if(fixture)await fixture.close();app.close();}
  }
  console.log(JSON.stringify({pass:true,nativeCodecAcceptance:records,note:'isolated Windows environment; not a claim about every physical device or a full reference-app performance comparison'}));
});
test('server/account switches revoke panels, selections, gallery caches and destructive tickets',async()=>{
  const app=await launchApp({emulateFocus:true}),first=await rhvideoFixture(),second=await rhvideoFixture();let view;
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    const login=server=>invoke(view,'connection.connect',{server,username:'preview',password:'fixture-only'});
    await login(first.url);await invoke(view,'preferences.set',{key:'readerFont',value:25});await invoke(view,'preferences.flush');await invoke(view,'gallery.open');
    await invoke(view,'selection.toggle',{kind:'video',id:'video-0',enabled:true});const pending=await invoke(view,'selection.stage');
    await login(second.url);assert.equal(await view.evaluate("document.querySelectorAll('.wb-dialog[open]').length"),0);
    assert.equal((await invoke(view,'workbench.diagnostics')).selected,0);assert.equal((await invoke(view,'preferences.state')).readerFont,20);
    await assert.rejects(invoke(view,'confirm.advance',{ticket:pending.ticket}),/失效/);await invoke(view,'gallery.open');assert(second.requests.some(r=>r.path==='/api/v1/screenshots/grid'),'gallery must be fetched from the new server');
    await login(first.url);assert.equal((await invoke(view,'preferences.state')).readerFont,25);assert.equal(first.trash.length,0);assert.equal(second.trash.length,0);
    await invoke(view,'connection.logout');assert.equal(await view.evaluate("document.querySelectorAll('.wb-dialog[open]').length"),0);
  }finally{view?.close();await first.close();await second.close();app.close();}
});
test('fifty-thousand packaged image entries remain reachable and bounded in the browser',async()=>{
  const app=await launchApp({emulateFocus:true}),fixture=await rhvideoFixture({pictureCount:50000});let view;
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke(view,'category',{kind:'picture'});
    const started=performance.now();await invoke(view,'viewer.open',{mode:'strip',source:'picture'});await invoke(view,'viewer.toggle');
    for(let i=0;i<30;i++)await invoke(view,'viewer.seek',{ratio:(i%2)?.99:.01});await invoke(view,'viewer.seek',{ratio:1});
    await until(()=>view.evaluate("(()=>{const nodes=[...document.querySelectorAll('.wb-strip-tile')];return nodes.length>0&&nodes.every(n=>Number(n.dataset.logicalStart)>1000000);})()"),'last logical image window resolves',20000);
    const state=await invoke(view,'viewer.state');assert.equal(state.total,50000);assert(state.ratio>.99);assert(state.tiles<=80);
    const geometry=await view.evaluate("(()=>{const s=document.querySelector('.wb-viewer-surface');return {scrollWidth:s.scrollWidth,children:document.querySelectorAll('.wb-strip-tile').length};})()");assert(geometry.scrollWidth<8100000);assert(geometry.children<=80);
    const requests=fixture.requests.filter(r=>r.path.startsWith('/storage/pictures/')).length;assert(requests<250,'rapid scrolling coalesces media requests');
    assert.deepEqual((await invoke(view,'ui.contract')).missing,[]);await invoke(view,'panel.close',{id:'wb-viewer'});
    console.log(JSON.stringify({pass:true,imageStripBrowser:{count:50000,elapsedMs:performance.now()-started,...geometry,requests},note:'generated SVGs/browser geometry, not a real-device codec comparison'}));
  }finally{view?.close();await fixture.close();app.close();}
});
test('actual RHVideo FastAPI/SQLite contracts, not a mocked API',{skip:!fs.existsSync(path.join(realSource,'app/main.py'))},async()=>{
  const app=await launchApp({emulateFocus:true});let child,view,output='';
  try{
    const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));
    const directory=path.join(app.directory,'actual-rhvideo');fs.mkdirSync(directory);
    const script=fileURLToPath(new URL('../testing/rhvideo-real-server.py',import.meta.url));
    child=spawn('uv',['run','--project',realSource,'--no-sync','python',script,realSource,directory,String(port)],{windowsHide:true,cwd:directory,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    await until(()=>{if(child.exitCode!==null)throw Error('Isolated RHVideo exited: '+output.slice(-1500));return output.includes('RHVIDEO_QA_READY');},'actual RHVideo server started',45000);
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    const result=await invoke(view,'connection.connect',{server:'http://127.0.0.1:'+port,username:'preview',password:'fixture-only'});
    assert.equal(result.total,1);assert.equal(result.items[0].title,'真实接口视频.mp4');
    await invoke(view,'favorite.toggle',{id:'real-video',kind:'video'});assert.equal((await invoke(view,'category',{kind:'favorite'})).total,1);
    assert.equal((await invoke(view,'category',{kind:'picture'})).items[0].id,'real-picture');
    await invoke(view,'category',{kind:'novel'});await invoke(view,'media.open',{id:'real-novel',kind:'novel'});
    await until(()=>view.evaluate("document.getElementById('chapter-text').textContent.includes('真实后端')"),'actual chapter text');
    await until(async()=>{const v=await invoke(view,'state');return v.reader?.loaded;},'actual chapter settled');
    await invoke(view,'reader.save');await invoke(view,'reader.close');
    await invoke(view,'category',{kind:'video'});await invoke(view,'timeline.open',{id:'real-video'});
    assert.equal(await view.evaluate("document.querySelectorAll('.frame-button').length"),1);
    await invoke(view,'timeline.close');
    await invoke(view,'server.open',{page:'watch'});await invoke(view,'panel.close',{id:'wb-server'});
    await invoke(view,'server.open',{page:'tasks'});await invoke(view,'panel.close',{id:'wb-server'});
    const previews=await invoke(view,'novel.preview',{id:'real-novel',offset:0});assert.equal(previews.total,3);await invoke(view,'panel.close',{id:'wb-preview'});
    const staged=await invoke(view,'confirm.begin',{name:'trash.stage',params:{kind:'picture',id:'real-picture'}});await invoke(view,'confirm.advance',{ticket:staged.ticket});await invoke(view,'confirm.advance',{ticket:staged.ticket});assert.equal(fs.existsSync(path.join(directory,'original.png')),false,'only the isolated fixture source was staged');
    await invoke(view,'remote.trash.restore',{params:{kind:'picture',id:'real-picture'}});assert.equal(fs.existsSync(path.join(directory,'original.png')),true,'real server restores the exact source path');
    assert.deepEqual((await invoke(view,'ui.contract')).missing,[]);
    console.log(JSON.stringify({pass:true,checks:'actual sibling RHVideo service, isolated SQLite, login, media lists, favorites write, actual chapter reads/progress, frames'}));
  }finally{
    view?.close();if(child?.pid&&child.exitCode===null)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    fs.writeFileSync(path.join(app.artifactDir,'actual-rhvideo.log'),output);app.close();
  }
});
