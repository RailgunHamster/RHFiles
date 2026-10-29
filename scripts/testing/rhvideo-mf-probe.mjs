// Independent native-engine experiment. Not a product/backend acceptance test.
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

assert.equal(process.platform,'win32');
assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1','Explicitly opt in to the own-window native experiment');
const scenario=process.argv[2]||'h264-1080',format=startupScenarios[scenario];assert(format);
const sourceMode=process.argv[3]||'http';assert(['http','file'].includes(sourceMode));
const source=path.resolve(process.env.RHFILES_STARTUP_MEDIA||'');assert(process.env.RHFILES_STARTUP_MEDIA,'Reuse a byte-identical generated media fixture');
const metadata=JSON.parse(execFileSync(process.env.FFPROBE||'ffprobe',['-v','error','-show_entries','stream=width,height,codec_name,codec_type','-of','json',source],{encoding:'utf8',windowsHide:true,timeout:10000})).streams;
const video=metadata.find(row=>row.codec_type==='video');
assert.equal(video.width,format.width);assert.equal(video.height,format.height);assert.equal(video.codec_name,format.codec==='libx265'?'hevc':'h264');
assert(metadata.some(row=>row.codec_type==='audio'&&row.codec_name==='aac'),'Keep the original AAC stream');
const executable=path.join(root,'test-artifacts/mf-engine-probe/native-mf-probe.exe');assert(fs.existsSync(executable),'Build scripts/testing/build-mf-probe.ps1 first');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-mf-probe-'));
const artifacts=path.join(root,'test-artifacts',path.basename(directory));fs.mkdirSync(artifacts);
const mediaPath='/'+randomBytes(16).toString('hex')+'.mp4',size=fs.statSync(source).size;
const requests=[];let started,child,output='',errorOutput='',timer,ended=false;
const report={scenario,sourceMode,measure:'new independent native process; no WebView/library/IPC; default hardware DComp output; after-stats own-window capture',sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),executableSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),source:metadata,requests,artifacts};
const server=http.createServer((request,response)=>{
  if(request.url!==mediaPath||!['GET','HEAD'].includes(request.method)||requests.length>=128){response.writeHead(404);return response.end();}
  let first=0,last=size-1;
  if(request.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);if(!match){response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();}first=Number(match[1]);last=match[2]?Math.min(Number(match[2]),last):last;}
  if(first>last||first>=size){response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();}
  const ranged=!!request.headers.range;
  requests.push({atMs:performance.now()-started,method:request.method,first,last});
  response.writeHead(ranged?206:200,{'Content-Type':'video/mp4','Content-Length':last-first+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(ranged?{'Content-Range':`bytes ${first}-${last}/${size}`}:{})});
  if(request.method==='HEAD')return response.end();
  const stream=fs.createReadStream(source,{start:first,end:last});
  response.on('close',()=>stream.destroy());stream.on('error',()=>response.destroy());stream.pipe(response);
});
try{
  await listenBrowserLoopback(server);
  if(sourceMode==='file')fs.copyFileSync(source,path.join(directory,'mf-probe-source.mp4'));
  started=performance.now();
  child=spawn(executable,[sourceMode==='file'?'mf-probe-source.mp4':`http://127.0.0.1:${server.address().port}${mediaPath}`],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{if(output.length<262144)output+=String(data);});
  child.stderr.on('data',data=>{if(errorOutput.length<65536)errorOutput+=String(data);});
  timer=setTimeout(()=>{report.hostTimeout=true;if(child.pid&&!ended)child.kill();},20000);
  const [exitCode,signal]=await once(child,'close');ended=true;clearTimeout(timer);report.exitCode=exitCode;report.signal=signal;report.elapsedHostMs=performance.now()-started;
  report.events=output.split(/\r?\n/).filter(line=>line.startsWith('MF_PROBE ')).map(line=>JSON.parse(line.slice(9)));
  report.completed=report.events.find(row=>row.stage==='completed')||null;
  const image=path.join(directory,'mf-probe-frame.bmp');
  if(fs.existsSync(image)){report.pixels=markerPixels(fs.readFileSync(image),format.width,format.height);fs.copyFileSync(image,path.join(artifacts,'own-window.bmp'));}
  fs.writeFileSync(path.join(artifacts,'probe.stdout.log'),output);fs.writeFileSync(path.join(artifacts,'probe.stderr.log'),errorOutput);
  assert.equal(exitCode,0,'Native engine must finish playback/control/shutdown checks');
  assert(report.events.some(row=>row.stage==='first-render-statistic'&&row.width===format.width&&row.height===format.height&&row.hasAudio),'Full resolution and AAC must reach the real engine');
  assert.equal(report.pixels?.visible,true,'All four actual video markers must appear in the owned window');
  assert(report.events.some(row=>row.stage==='pause-verified'));assert(report.events.some(row=>row.stage==='seek-verified'));assert(report.events.some(row=>row.stage==='rate-resume-verified'));assert(report.events.some(row=>row.stage==='shutdown-complete'));
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
  clearTimeout(timer);if(child&&!ended)child.kill();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(artifacts,'measurement.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
