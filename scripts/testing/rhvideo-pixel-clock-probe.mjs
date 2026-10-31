// One fixed cadence observation, not a retry loop or all-platform acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {launchApp,until,sleep} from './app-session.mjs';import {rhvideoFixture} from './rhvideo-fixture.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {generateClockMedia,decodeFrameIdentity,clockFormat,clockObservations} from './native-media-clock.mjs';import {markerPixels} from './native-startup-pixels.mjs';
const directory=fs.mkdtempSync(path.resolve('test-artifacts/rhvideo-pixel-clock-')),media=path.join(directory,'generated.mp4');let app,fixture,library,failure;
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const receipt={passed:false,kind:'ordinary library PLAYER source-pixel clock diagnostic',samples:[],intervals:[],physicalScreenTiming:false,source:clockFormat};
try{
 for(const key of ['RHFILES_VLC_DEBUG','RHFILES_PLAY_NATIVE_TRACE','RHFILES_VLC_NATIVE_TRACE','RHFILES_VLC_COMPATIBILITY','RHFILES_VLC_NETWORK_CACHE_MS','RHFILES_VLC_DECODE_THREADS','RHFILES_QA_READBACK'])assert(!process.env[key]);
 assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1');assert(process.env.RHFILES_TEST_EXECUTABLE?.includes('test-artifacts'));receipt.executableSha256=sha(process.env.RHFILES_TEST_EXECUTABLE);receipt.helperSha256=sha(new URL('./native-media-clock.mjs',import.meta.url));receipt.probeSha256=sha(new URL(import.meta.url));receipt.policy={fixedSamplesAfterReplyMs:[2000,4000,6000],sourceRate:[.8,1.2],uiClockErrorMs:250,uiClockErrorAddsPostCaptureRead:true,requiresPresentedPixelsAndAudibleAfterState:true,beforeReadinessMayDifferAtFirstPicture:true};
 assert(process.env.FFMPEG&&path.isAbsolute(process.env.FFMPEG),'Select the frozen media generator explicitly before the run, not a PATH fallback');
 const generator=fs.realpathSync(process.env.FFMPEG);assert.equal(generator.toLowerCase(),fs.realpathSync(path.resolve('src-tauri/thirdparty/ffmpeg.exe')).toLowerCase(),'Use the admitted snapshot media tool');
 receipt.generator={executable:generator,sha256:sha(generator),version:execFileSync(generator,['-version'],{encoding:'utf8',windowsHide:true,timeout:10000}).split(/\r?\n/,1)[0],observedBeforeGeneration:true};
 generateClockMedia(media);receipt.sourceSha256=sha(media);
 // Exercise the actual H264 encode/decode and frame expressions first. Mock
 // bitmaps alone cannot prove that ffmpeg wrote the advertised source clocks.
 const raw=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-threads','2','-i',media,'-vf',"select='eq(n,0)+eq(n,257)+eq(n,479)',scale=960:540",'-fps_mode','passthrough','-pix_fmt','bgra','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 const length=960*540*4;assert.equal(raw.length,length*3);receipt.calibration=[];
 for(const [index,frame]of [0,257,479].entries()){
  const bitmap=Buffer.alloc(54+length);bitmap.write('BM');bitmap.writeUInt32LE(bitmap.length,2);bitmap.writeUInt32LE(54,10);bitmap.writeUInt32LE(40,14);bitmap.writeInt32LE(960,18);bitmap.writeInt32LE(-540,22);bitmap.writeUInt16LE(1,26);bitmap.writeUInt16LE(32,28);raw.copy(bitmap,54,index*length,(index+1)*length);const decoded=decodeFrameIdentity(bitmap);assert.equal(decoded.frame,frame);receipt.calibration.push(decoded);
 }
 app=await launchApp();receipt.artifactDir=app.artifactDir;fixture=await rhvideoFixture({videoFile:media,videoCount:1,pictureCount:0,videoDuration:20,videoResolutions:['1920x1080']});
 await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(row=>new URL(row.url).pathname==='/rhvideo.html');},'pixel-clock library');library=await cdpSession(target,30000);await until(()=>library.evaluate('!!globalThis.RHFilesAPI?.list().some(row=>row.id==="rhvideo.media.open")'),'pixel-clock actions');
 const action=(name,args={})=>library.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 await action('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await action('category',{kind:'video'});await action('rotation.set',{enabled:false});
 const began=performance.now();await action('media.open',{kind:'video',id:'video-0'});const replied=performance.now();receipt.openReplyMs=replied-began;
 for(const offset of [2000,4000,6000]){
  await sleep(Math.max(0,replied+offset-performance.now()));const row={scheduledAfterReplyMs:offset,readStartedMs:performance.now()-began};receipt.samples.push(row);
  try{row.before=await action('player.state');assert.equal(row.before.host.kind,'library');row.captureStartedMs=performance.now()-began;const picture=await app.readLibraryPlayerFrame();row.captureEndedMs=performance.now()-began;assert.equal(picture.alpha,255);const bytes=fs.readFileSync(picture.path);row.pixels=markerPixels(bytes,1920,1080);row.identity=decodeFrameIdentity(bytes);fs.copyFileSync(picture.path,path.join(directory,'frame-'+offset+'.bmp'));row.after=await action('player.state');assert.equal(row.after.host.lease,row.before.host.lease);row.readEndedMs=performance.now()-began;}catch(error){row.error=String(error?.message||error);row.readEndedMs=performance.now()-began;}
 }
 Object.assign(receipt,clockObservations(receipt.samples));
 // A capture can straddle the first picture: the before state is recorded,
 // never falsely required to be playing before the picture actually exists.
 for(const row of receipt.samples){assert(row.readEndedMs-row.readStartedMs<1000,'Long observation envelope cannot prove source/UI synchronization');const state=row.after;assert.equal(state.renderer,'native-hardware-auto');assert.equal(state.state,3);assert.equal(state.decoderRate,1);assert(state.decoderVolume>0&&!state.muted&&state.decodedAudioBlocks>0);assert.equal(state.rotation,0);assert.equal(state.inputId,row.before.inputId);assert.equal(state.inputId,receipt.samples[0].before.inputId);}
 assert(receipt.cadenceWithinBudget,'Actual source pixels must advance near 1x, not just the UI');assert(receipt.synchronizationWithinBudget,'UI clock must stay near the actual source-frame time, not permanently lag it');
 receipt.passed=true;
}catch(error){failure=error;receipt.error=String(error?.stack||error);}
finally{library?.close();if(app)await app.close();if(fixture){receipt.transport=fixture.transport.snapshot();await fixture.close();}if(receipt.generator){receipt.generator.unchanged=sha(receipt.generator.executable)===receipt.generator.sha256;if(!receipt.generator.unchanged){receipt.passed=false;failure??=Error('Media generator changed during the observation');receipt.error=String(failure);}}fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2));console.log('Source pixel clock receipt: '+directory);}
if(failure)throw failure;
