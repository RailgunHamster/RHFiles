import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('the admitted bundle actually decodes video and AAC with its matching prebuilt plugin index', {skip:!process.env.RHFILES_EXPECT_BUNDLED_VLC?'Opt in with the exact bundled runtime version':false},async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,view;
 try{
  const file=path.join(app.directory,'bundle-aac.mp4');execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','12','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
  fixture=await rhvideoFixture({videoFile:file,videoCount:1,pictureCount:0,videoDuration:12});await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const page=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'actual library');view=await cdpSession(page,30000);await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.media.open")'),'library actions');
  await view.evaluate('RHFilesAPI.invoke("rhvideo.connection.connect",'+JSON.stringify({server:fixture.url,username:'preview',password:'fixture-only'})+')');
  await view.evaluate('RHFilesAPI.invoke("rhvideo.media.open",{kind:"video",id:"video-0"})');
  const state=await until(async()=>{const state=await app.evaluate('call("rhvideo_request",{action:"player.state",args:{}})');return state.renderedFrames>0&&state.decodedAudioBlocks>0?state:null;},'real native video and AAC blocks',20000);
  assert.equal(state.engineVersion.split(' ')[0],process.env.RHFILES_EXPECT_BUNDLED_VLC,'Read the loaded library, not the installed system runtime or file metadata alone');assert.equal(state.pluginIndexMode,'prebuilt-no-scan');assert.equal(state.nativeSurface,true);assert.equal(state.videoWidth,640);assert.equal(state.videoHeight,360);if(process.env.RHFILES_EXPECT_RENDERER)assert.equal(state.renderer,process.env.RHFILES_EXPECT_RENDERER);
  assert(fixture.requests.some(r=>r.path.endsWith('/play')));fs.writeFileSync(path.join(app.artifactDir,'bundled-runtime.json'),JSON.stringify({engineVersion:state.engineVersion,pluginIndexMode:state.pluginIndexMode,renderer:state.renderer,decodedAudioBlocks:state.decodedAudioBlocks,renderedFrames:state.renderedFrames},null,2));await app.evaluate('call("rhvideo_request",{action:"player.close",args:{}})');
  console.log(JSON.stringify({bundledNativeRuntime:state.engineVersion,index:state.pluginIndexMode,videoFrames:state.renderedFrames,aacBlocks:state.decodedAudioBlocks,note:'Real native decode; not a measurement of physical speaker output'}));
 }finally{view?.close();app.close();let timer;try{await Promise.race([app.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned native output did not drain')),5000);})]);}finally{clearTimeout(timer);await fixture?.close();}}
 if(process.env.RHFILES_ASSERT_INDEX_LOG==='1'){
  const log=fs.readFileSync(path.join(app.artifactDir,'app.log'),'utf8');assert.match(log,/loading plugins cache file/);assert(!log.includes('recursively browsing'),'The real libVLC must not rescan timestamp-normalized plugins');assert(!log.includes('stale plugins cache'),'A successful decode must not hide a full stale-index rebuild');
 }
});
