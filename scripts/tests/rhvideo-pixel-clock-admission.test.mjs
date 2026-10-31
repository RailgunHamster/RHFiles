import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Admission-only negative controls. These files are deliberately not playable
// executables; neither ffmpeg nor an application may run in either test.
for(const external of [false,true])test('source-clock probe rejects '+(external?'an external generator':'a PATH-only generator')+' before launching anything',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-clock-admission-'));
 try{
  const artifacts=path.join(directory,'test-artifacts');fs.mkdirSync(artifacts);const executable=path.join(artifacts,'not-an-application.exe');fs.writeFileSync(executable,'admission negative control');
  const env={...process.env,RHFILES_NATIVE_PLAYER_QA:'1',RHFILES_TEST_EXECUTABLE:executable};
  for(const key of ['FFMPEG','RHFILES_VLC_DEBUG','RHFILES_PLAY_NATIVE_TRACE','RHFILES_VLC_NATIVE_TRACE','RHFILES_VLC_COMPATIBILITY','RHFILES_VLC_NETWORK_CACHE_MS','RHFILES_VLC_DECODE_THREADS','RHFILES_QA_READBACK'])delete env[key];
  if(external){const pinned=path.join(directory,'src-tauri/thirdparty');fs.mkdirSync(pinned,{recursive:true});fs.writeFileSync(path.join(pinned,'ffmpeg.exe'),'admitted dummy tool');env.FFMPEG=path.join(directory,'external.exe');fs.writeFileSync(env.FFMPEG,'unadmitted dummy tool');}
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('../testing/rhvideo-pixel-clock-probe.mjs',import.meta.url))],{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(child.status,1,child.stderr);const match=/Source pixel clock receipt: ([^\r\n]+)/.exec(child.stdout);assert(match,child.stdout);const receipt=JSON.parse(fs.readFileSync(path.join(match[1],'receipt.json')));
  assert.equal(receipt.passed,false);assert.match(receipt.error,external?/Use the admitted snapshot media tool/:/Select the frozen media generator explicitly/);assert.equal(receipt.artifactDir,undefined);assert.equal(receipt.generator,undefined);assert.deepEqual(receipt.samples,[]);assert.equal(receipt.sourceSha256,undefined);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
