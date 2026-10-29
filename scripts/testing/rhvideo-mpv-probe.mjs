// Test-only standalone player comparison. Not an RHFiles integration or
// product-performance pass. Keep the same full-resolution + AAC source bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {root} from './source.mjs';
import {listenBrowserLoopback} from './browser-loopback.mjs';
import {startupScenarios} from './rhvideo-startup-media.mjs';
import {markerPixels} from './native-startup-pixels.mjs';

assert.equal(process.platform,'win32');assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1','Explicit own-window opt-in is required');
const scenario=process.argv[2]||'h264-1080',format=startupScenarios[scenario];assert(format);
const sourceMode=process.argv[3]||'http',gpu=process.argv[4]||'auto';assert(['http','file'].includes(sourceMode));assert(['auto','d3d11'].includes(gpu));
assert(process.env.RHFILES_STARTUP_MEDIA,'Reuse the generated source, do not generate a different video inside the measurement');
const source=fs.realpathSync(process.env.RHFILES_STARTUP_MEDIA),relative=path.relative(path.join(root,'test-artifacts'),source);
assert(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.basename(source)===scenario+'.mp4','Only an owned generated startup fixture is accepted');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),candidate=path.join(root,'test-artifacts/mpv-engine-probe');
const executable=path.join(candidate,'native-mpv-probe.exe'),dll=path.join(candidate,'runtime/libmpv-2.dll');
assert.equal(hash(dll),'266f26a95c2a7dad16513fc0b8771b91fe8054716b433e3653d667966c046931','Candidate DLL must match the verified release extraction');
assert.equal(hash(path.join(candidate,'runtime/include/mpv/client.h')),'3da9b8c61c3fb4e2d76bd248cebf72f3ee830331411b71a76adbd5e05660cc50');
const metadata=JSON.parse(execFileSync(process.env.FFPROBE||'ffprobe',['-v','error','-show_entries','stream=width,height,codec_name,codec_type','-of','json',source],{encoding:'utf8',windowsHide:true,timeout:10000})).streams;
const video=metadata.find(row=>row.codec_type==='video');assert.equal(video.width,format.width);assert.equal(video.height,format.height);assert.equal(video.codec_name,format.codec==='libx265'?'hevc':'h264');assert(metadata.some(row=>row.codec_type==='audio'&&row.codec_name==='aac'),'Do not remove the original audio track');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-mpv-probe-')),artifacts=path.join(root,'test-artifacts',path.basename(directory));fs.mkdirSync(artifacts);
const mediaPath='/'+randomBytes(16).toString('hex')+'.mp4',size=fs.statSync(source).size,requests=[];
let started,child,output='',errorOutput='',timer,ended=false;
const report={scenario,sourceMode,gpu,measure:'new independent libmpv process; native gpu-next/auto decode, real owned-window captures; no WebView/RHFiles IPC. Capture samples bound visibility, not exact first presentation',sourceSha256:hash(source),executableSha256:hash(executable),dllSha256:hash(dll),source:metadata,requests,artifacts};
const server=http.createServer((request,response)=>{
  if(request.url!==mediaPath||!['GET','HEAD'].includes(request.method)||requests.length>=128){response.writeHead(404);return response.end();}
  let first=0,last=size-1;
  if(request.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);if(!match){response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();}first=Number(match[1]);last=match[2]?Math.min(Number(match[2]),last):last;}
  if(first>last||first>=size){response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();}
  const ranged=!!request.headers.range;requests.push({atMs:performance.now()-started,method:request.method,first,last});
  response.writeHead(ranged?206:200,{'Content-Type':'video/mp4','Content-Length':last-first+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(ranged?{'Content-Range':`bytes ${first}-${last}/${size}`}:{})});
  if(request.method==='HEAD')return response.end();const stream=fs.createReadStream(source,{start:first,end:last});response.on('close',()=>stream.destroy());stream.on('error',()=>response.destroy());stream.pipe(response);
});
try{
  await listenBrowserLoopback(server);if(sourceMode==='file')fs.copyFileSync(source,path.join(directory,'mpv-probe-source.mp4'));
  started=performance.now();child=spawn(executable,[sourceMode==='file'?'mpv-probe-source.mp4':`http://127.0.0.1:${server.address().port}${mediaPath}`,gpu],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,APPDATA:path.join(directory,'roaming'),LOCALAPPDATA:path.join(directory,'local')}});
  child.stdout.on('data',data=>{if(output.length<524288)output+=String(data);});child.stderr.on('data',data=>{if(errorOutput.length<65536)errorOutput+=String(data);});
  timer=setTimeout(()=>{report.hostTimeout=true;if(child.pid&&!ended)child.kill();},20000);
  const [exitCode,signal]=await once(child,'close');ended=true;clearTimeout(timer);report.exitCode=exitCode;report.signal=signal;report.elapsedHostMs=performance.now()-started;
  report.events=output.split(/\r?\n/).filter(line=>line.startsWith('MPV_PROBE ')).map(line=>JSON.parse(line.slice(10)));
  for(const [file,key]of [['mpv-probe-before.bmp','beforePixels'],['mpv-probe-frame.bmp','pixels']]){const image=path.join(directory,file);if(fs.existsSync(image)){report[key]=markerPixels(fs.readFileSync(image),format.width,format.height);fs.copyFileSync(image,path.join(artifacts,file));}}
  const first=report.events.find(row=>row.stage==='first-owned-pixels');report.firstObservedVisibleMs=first?.atMs??null;report.sourceToObservedVisibleMs=first?first.atMs-first.sourceAtMs:null;
  assert.equal(exitCode,0,'Native candidate must finish its controls and shutdown, not merely open a window');assert.equal(report.beforePixels?.visible,false,'Owned pre-load canvas is independently verified negative');assert.equal(report.pixels?.visible,true,'All four actual source markers must appear in the owned native window');
  assert(first&&first.width===format.width&&first.height===format.height&&first.hasAudio,'Full-resolution source and audio reach the actual candidate');
  for(const stage of ['pause-verified','seek-verified','rate-resume-verified','shutdown-complete'])assert(report.events.some(row=>row.stage===stage),stage);
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
  clearTimeout(timer);if(child&&!ended)child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(artifacts,'probe.stdout.log'),output);fs.writeFileSync(path.join(artifacts,'probe.stderr.log'),errorOutput);fs.writeFileSync(path.join(artifacts,'measurement.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
