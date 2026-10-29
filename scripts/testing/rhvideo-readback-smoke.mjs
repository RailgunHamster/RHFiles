// Real owned processes: the debug pipe can read only its own window; the
// release executable must not implement this private instrumentation at all.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {launchApp} from './app-session.mjs';
assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1');
const debug=process.env.RHFILES_TEST_EXECUTABLE,release=process.argv[2];
assert(debug&&release&&fs.existsSync(debug)&&fs.existsSync(release),'Supply the actual debug and release executables');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let app;
try{
 app=await launchApp({nativeDiagnostics:true});
 assert.equal((await app.diagnostic('player.state')).opened,false);
 await assert.rejects(app.diagnostic('player.control',{command:'play'}),/read-only/);
 await assert.rejects(app.diagnostic('player.frame'),/播放器没有打开/);
 const frame=await app.diagnostic('main.frame');assert.equal(frame.scope,'main');assert.equal(path.dirname(frame.path),app.directory);assert.match(path.basename(frame.path),/^rhvideo-main-[a-f0-9]{32}\.bmp$/);
 try{
  const bytes=fs.readFileSync(frame.path);assert.equal(bytes.subarray(0,2).toString(),'BM');assert.equal(bytes.readUInt32LE(10),54);assert.equal(bytes.readInt32LE(18),frame.width);assert.equal(-bytes.readInt32LE(22),frame.height);assert.equal(bytes.length,54+frame.width*frame.height*4);
  let lit=0;const colors=new Set();for(let offset=54;offset<bytes.length;offset+=4){if(bytes[offset]>24||bytes[offset+1]>24||bytes[offset+2]>24)lit++;if(colors.size<256)colors.add(bytes.readUIntLE(offset,3));}assert(lit>frame.width*frame.height/10&&colors.size>8,'The actual own-window capture must not be an empty/flat buffer');
  fs.copyFileSync(frame.path,path.join(app.artifactDir,'owned-main-window.bmp'));
  console.log(JSON.stringify({ownedMainReadback:true,width:frame.width,height:frame.height,debugSha256:hash(debug),artifact:app.artifactDir}));
 }finally{fs.unlinkSync(frame.path);}
}finally{await app?.close();}
process.env.RHFILES_TEST_EXECUTABLE=path.resolve(release);
let forbidden;
try{await assert.rejects(async()=>{forbidden=await launchApp({nativeDiagnostics:true});},/Owned native readback timed out/);console.log(JSON.stringify({releaseReadbackAbsent:true,releaseSha256:hash(release)}));}
finally{await forbidden?.close();process.env.RHFILES_TEST_EXECUTABLE=debug;}
