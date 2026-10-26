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
async function target(app,file){
  const found=await until(async()=>{
    const response=await fetch('http://127.0.0.1:'+app.port+'/json/list');
    return (await response.json()).find(t=>new URL(t.url).pathname.endsWith('/'+file));
  },file+' packaged app window');
  const session=await cdpSession(found,30000);
  await until(()=>session.evaluate("!!globalThis.RHFilesAPI?.list().some(a=>a.id==='rhvideo.state'||a.id==='rhvideo.player.state')"),'view actions registered');
  return session;
}
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
test('RHVideo packaged UI, real native HTTP bridge, reader, favorites, paging and credential boundary',async()=>{
  const app=await launchApp({emulateFocus:true}),fixture=await rhvideoFixture();let view;
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
    await until(()=>view.evaluate("document.querySelectorAll('.cover-button img.loaded').length>=8"),'native-authenticated thumbnails decoded');
    const shot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'rhvideo-videos.png'),Buffer.from(shot.data,'base64'));
    assert.equal(await view.evaluate("document.querySelectorAll('iframe,video').length"),0);
    const configPath=path.join(app.profile.dataDirectory,'rhvideo-client.json'),config=fs.readFileSync(configPath,'utf8');
    assert.doesNotMatch(config,/fixture-only|fixture-bearer|password|token/);
    const page=await invoke(view,'page',{direction:1});assert.equal(page.offset,36);assert.equal(page.items.length,16);
    const search=await invoke(view,'search',{query:'清晨'});assert(search.items.length>0&&search.items.every(v=>v.title.includes('清晨')));
    const all=await invoke(view,'search',{query:''}),media=all.items[0];
    await invoke(view,'favorite.toggle',{id:media.id,kind:media.kind});assert(fixture.favorites.has('video:'+media.id));
    const favorite=await invoke(view,'category',{kind:'favorite'});assert.equal(favorite.total,1);
    await invoke(view,'favorite.toggle',{id:media.id,kind:'video'});assert.equal((await invoke(view,'state')).total,0);
    const pictures=await invoke(view,'category',{kind:'picture'});assert.equal(pictures.items.length,8);
    await invoke(view,'media.open',{id:pictures.items[0].id,kind:'picture'});await until(()=>view.evaluate("document.getElementById('full-image').naturalWidth>0"),'full image');
    assert.equal((await invoke(view,'image.step',{direction:1})).index,1);await invoke(view,'image.zoom',{delta:.25});await invoke(view,'image.close');
    await invoke(view,'category',{kind:'novel'});await invoke(view,'media.open',{id:'novel-1',kind:'novel'});
    await until(async()=>{const s=await invoke(view,'state');return s.reader?.loaded&&s.reader.chapter===1;},'saved chapter resumed');
    await invoke(view,'reader.step',{direction:1});await until(async()=>{const s=await invoke(view,'state');return s.reader?.loaded&&s.reader.chapter===2;},'next chapter');
    await invoke(view,'reader.save');assert(fixture.progress.some(p=>p.chapter_index===2));await invoke(view,'reader.close');
    await invoke(view,'category',{kind:'video'});await invoke(view,'timeline.open',{id:'video-0',kind:'video'});
    assert.equal(await view.evaluate("document.querySelectorAll('.frame-button').length"),8);await invoke(view,'timeline.close');
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
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','14','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
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
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.next')");
    await until(async()=>{const v=await player.evaluate("RHFilesAPI.invoke('rhvideo.player.state')");return v.queue?.index===1&&v.title.includes('海边');},'next video in native queue');
    await player.evaluate("RHFilesAPI.invoke('rhvideo.player.previous')");
    assert(fixture.requests.some(r=>r.path.endsWith('/play')));
    await invoke(view,'connection.logout');
    console.log(JSON.stringify({pass:true,checks:'native libVLC HWND, streamed MP4 decode, progress, pause, seek, resume, no HTML video'}));
  }finally{player?.close();view?.close();if(fixture)await fixture.close();app.close();}
});
const realSource=process.env.RHVIDEO_SOURCE||path.resolve(fileURLToPath(new URL('../../..',import.meta.url)),'RHVideo');
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
    console.log(JSON.stringify({pass:true,checks:'actual sibling RHVideo service, isolated SQLite, login, media lists, favorites write, actual chapter reads/progress, frames'}));
  }finally{
    view?.close();if(child?.pid&&child.exitCode===null)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    fs.writeFileSync(path.join(app.artifactDir,'actual-rhvideo.log'),output);app.close();
  }
});
