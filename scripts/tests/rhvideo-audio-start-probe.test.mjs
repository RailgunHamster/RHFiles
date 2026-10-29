import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const read=relative=>fs.readFileSync(new URL('../../'+relative,import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('audio start experiment is an explicit probe build and defaults to unchanged platform output',()=>{
  const gradle=read('android/gradle/app/build.gradle.kts'),grid=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoGridActivity.kt');
  assert.match(gradle,/rhVideoAudioStartMs == null \|\| \(providers\.gradleProperty\("rhfilesRhVideoProbe"\)\.isPresent && rhVideoAudioStartMs in 1\.\.100\)/);
  assert.match(gradle,/buildConfigField\("int", "RHVIDEO_QA_AUDIO_START_MS", \(rhVideoAudioStartMs \?: 0\)\.toString\(\)\)/);
  assert.match(grid,/if\(BuildConfig\.RHVIDEO_QA_AUDIO_START_MS==0\)DefaultRenderersFactory\(this\)else/);
});
test('experimental grid output cannot be mistaken for default playback acceptance',()=>{
  const probe=read('android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java'),runner=read('scripts/testing/rhvideo-android.mjs');
  assert.match(probe,/if\(ready\)\{checkAudioStartExperiment\(state\);step\("grid settled /);
  assert.match(probe,/state\.getInt\("qaAudioStartMs"\)==expected/);
  assert.match(probe,/getInt\("bufferSizeFrames"\)==receipt\.getInt\("capacityFrames"\)/);
  assert.match(runner,/'-e','audioStartMs',String\(audioStartMs\)/);
  assert.match(runner,/JSON\.stringify\(\{audioStartMs,codecMode,productDefault:audioStartMs===0&&codecMode==='default'\}/);
});
test('the actual host verifier rejects experimental, missing and reduced-buffer receipts',()=>{
  const source=read('scripts/testing/rhvideo-android.mjs'),node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='verifyGridAudioParameters');
  assert(node);const verify=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{assert});
  const log=(ms,receipt)=>'STEP: grid settled '+JSON.stringify({qaAudioStartMs:ms,qaCodecMode:'default',cells:[{diagnostics:{audioStartExperiment:receipt,codecAdapters:null}}]});
  const receipt={requestedMs:20,afterFrames:960,capacityFrames:24000,bufferSizeFrames:24000};
  verify(log(0,null),0);verify(log(20,receipt),20);
  for(const [text,expected]of [[log(20,receipt),0],[log(0,null),20],[log(undefined,null),0],[log(20,{...receipt,bufferSizeFrames:960}),20],[log(20,null),20],['PASS: reference grid',0],[log(0,receipt),0]])assert.throws(()=>verify(text,expected));
});

test('codec queueing is a separate explicit experiment and validates both actual adapter types',()=>{
  const gradle=read('android/gradle/app/build.gradle.kts'),runner=read('scripts/testing/rhvideo-android.mjs');
  assert.match(gradle,/rhVideoCodecMode == null \|\| \(providers\.gradleProperty\("rhfilesRhVideoProbe"\)\.isPresent && rhVideoCodecMode == "synchronous" && rhVideoAudioStartMs == null\)/);
  assert.match(gradle,/"RHVIDEO_QA_CODEC_MODE", "\\"\$\{rhVideoCodecMode \?: "default"\}\\""/);
  const node=parse(runner,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='verifyGridAudioParameters');
  const verify=vm.runInNewContext('('+runner.slice(node.start,node.end)+')',{assert});
  const type='androidx.media3.exoplayer.mediacodec.SynchronousMediaCodecAdapter';
  const log=(mode,adapters,ms=0)=>'STEP: grid settled '+JSON.stringify({qaAudioStartMs:ms,qaCodecMode:mode,cells:[{diagnostics:{codecAdapters:adapters,audioStartExperiment:null}}]});
  verify(log('synchronous',{audio:type,video:type}),0,'synchronous');
  for(const [text,ms,mode]of [[log('synchronous',{audio:type,video:type}),0,'default'],[log('default',null),0,'synchronous'],[log('synchronous',{audio:type,video:'wrong.adapter'}),0,'synchronous'],[log('synchronous',null),0,'synchronous'],[log('synchronous',{audio:type,video:type},20),20,'synchronous'],[log('default',{audio:type,video:type}),0,'default']])assert.throws(()=>verify(text,ms,mode));
});
