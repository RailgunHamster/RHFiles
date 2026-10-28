import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('native source replacement displays new pixels and dimensions without carrying old input state', {skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'},async()=>{
  const app=await launchApp({emulateFocus:true});let view,fixture;
  const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
  const native=(action,args={})=>app.evaluate('call("rhvideo_request",'+JSON.stringify({action,args})+')');
  try{
    const make=(name,size,color)=>{
      const file=path.join(app.directory,name+'.mp4');
      execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i',`color=c=${color}:size=${size}:rate=24`,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','12','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});return file;
    };
    const red=make('landscape','640x360','red'),blue=make('portrait','180x320','blue');
    fixture=await rhvideoFixture({videoFile:red,videoFiles:{'video-1':blue},videoCount:2,pictureCount:0,videoDuration:12,videoResolutions:['640x360','180x320']});
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname.endsWith('/rhvideo.html'));},'library target');
    view=await cdpSession(target,30000);await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.media.open")'),'library API');
    await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('rotation.set',{enabled:false});
    const center=async state=>{
      const frame=await native('player.diagnosticFrame',{expectedInput:state.inputId});assert.equal(path.dirname(frame.path),app.directory);assert.match(path.basename(frame.path),/^rhvideo-native-[a-f0-9]{32}\.bmp$/);
      try{const bytes=fs.readFileSync(frame.path),width=bytes.readInt32LE(18),height=-bytes.readInt32LE(22);assert.equal(bytes.length,54+width*height*4);const offset=54+(Math.floor(height/2)*width+Math.floor(width/2))*4;const [b,g,r]=bytes.subarray(offset,offset+3);return [r,g,b];}finally{fs.unlinkSync(frame.path);}
    };
    let previous;
    for(const [id,width,height,color]of [['video-0',640,360,'red'],['video-1',180,320,'blue'],['video-0',640,360,'red']]){
      await invoke('media.open',{kind:'video',id});
      const current=await until(async()=>{const s=await native('player.state');return s.opened&&s.queue.id===id&&s.renderedFrames>=2&&s.videoWidth===width&&s.videoHeight===height?s:null;},'replacement source really displays frames',25000);
      if(process.env.RHFILES_EXPECT_RENDERER)assert.equal(current.renderer,process.env.RHFILES_EXPECT_RENDERER);
      assert.equal(current.rotation,0);assert(current.positionMs<6000,'a replacement starts its own timeline, not the previous seek');
      const [r,g,b]=await center(current);assert(color==='red'?r>160&&g<90&&b<90:b>160&&r<90&&g<90,'actual replacement canvas: '+[r,g,b]);
      if(previous){assert.notEqual(current.inputId,previous.inputId);await assert.rejects(native('player.control',{command:'seek',value:8000,expectedInput:previous.inputId}),/输入已改变/);}
      await native('player.control',{command:'pause',expectedInput:current.inputId});await native('player.control',{command:'seek',value:7000,expectedInput:current.inputId});
      await until(async()=>{const s=await native('player.state');return s.state===4&&Math.abs(s.positionMs-7000)<300;},'old input has a distinct paused position');previous=current;
    }
    console.log(JSON.stringify({replacementPixels:'red landscape → blue portrait → red landscape',renderer:process.env.RHFILES_EXPECT_RENDERER}));
  }finally{view?.close();await app.close();await fixture?.close();}
});
