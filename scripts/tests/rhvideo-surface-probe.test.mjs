import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const runner=read('scripts/testing/rhvideo-android.mjs');
function actual(name){const node=parse(runner,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name===name);assert(node);return vm.runInNewContext('('+runner.slice(node.start,node.end)+')',{assert});}

test('a direct SurfaceView is an explicit isolated diagnostic, never a product/default gate',()=>{
  const admit=actual('admitSurfaceProbe');
  for(const surface of ['compositor','direct'])admit(surface,'grid-surface-probe',0,'default');
  admit('compositor','grid',0,'default');admit('compositor','grid',20,'default');admit('compositor','grid',0,'synchronous');
  for(const args of [['direct','grid',0,'default'],['direct','grid-rotation',0,'default'],['direct','single',0,'default'],['direct','lifecycle',0,'default'],['direct','grid-surface-probe',20,'default'],['compositor','grid-surface-probe',0,'synchronous'],['unknown','grid-surface-probe',0,'default']])assert.throws(()=>admit(...args));
  const gradle=read('android/gradle/app/build.gradle.kts');
  assert.match(gradle,/rhVideoSurfaceMode == null \|\| \(providers\.gradleProperty\("rhfilesRhVideoProbe"\)\.isPresent && rhVideoSurfaceMode == "direct" && rhVideoAudioStartMs == null && rhVideoCodecMode == null\)/);
  assert.match(gradle,/"RHVIDEO_QA_SURFACE_MODE", "\\"\$\{rhVideoSurfaceMode \?: "compositor"\}\\""/);
});

test('actual host surface verification checks every native output, not only the requested label',()=>{
  const verify=actual('verifyGridSurfaceParameters');
  const presentation=direct=>({surfaceType:'SurfaceView',rotationPipeline:false,rotationRenderer:direct?'surface-view-direct-probe':'surface-compositor',nativeLayerAttached:!direct,autoRotate:false,rotation:0});
  const log=(mode,cells)=>'STEP: grid settled '+JSON.stringify({qaSurfaceMode:mode,cells});
  verify(log('compositor',[{presentation:presentation(false)}]),'compositor');
  verify(log('direct',[{presentation:presentation(true)}]),'direct');
  for(const [mode,cells,expected]of [['direct',[{presentation:presentation(true)}],'compositor'],['compositor',[{presentation:presentation(false)}],'direct'],['direct',[{presentation:presentation(true)},{presentation:presentation(false)}],'direct'],['direct',[{presentation:{...presentation(true),rotation:90}}],'direct'],['direct',[{presentation:{...presentation(true),autoRotate:true}}],'direct'],['direct',[{presentation:{...presentation(true),surfaceType:'TextureView'}}],'direct'],['compositor',[{presentation:{...presentation(false),nativeLayerAttached:false}}],'compositor'],['direct',[{}],'direct'],[undefined,[{presentation:presentation(false)}],'compositor'],['direct',[],'direct']])assert.throws(()=>verify(log(mode,cells),expected));
  assert.throws(()=>verify('PASS: diagnostic only','direct'));
});

test('surface comparison retains the original strict sample and has no media writes or feature-pass receipt',()=>{
  const probe=read('android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java');
  const body=probe.slice(probe.indexOf('private void checkGridSurfaceProbe()'),probe.indexOf('private void checkReferenceGrid()'));
  assert.match(body,/checkGridContinuity\(waitGrid\(3,false\)\)/);
  assert.doesNotMatch(body,/setVolume|setPlayback|seek|retry|restart|pause|mute|favorite|mark|setAutoRotation/);
  assert.match(probe,/PASS: surface-only grid diagnostic; not complete product acceptance/);
  assert.match(runner,/if\(!rulesMode&&!lifecycleMode&&!gridSurfaceMode&&!closeReceiptMode\)/,'A diagnostic cannot pull stale screenshots from a different scenario');
  assert.match(probe,/!"grid-surface-probe"\.equals\(args\.getString\("mode"\)\)/,'A surface-only comparison must not run unrelated file operations first');
  const verify=actual('verifyContractTraffic'),base={method:'GET',path:'/api/v1/videos/video-0/play',authorization:'Bearer fixture-bearer-do-not-persist'};
  verify({requests:[base]},{gridSurfaceMode:true});
  assert.throws(()=>verify({requests:[]},{gridSurfaceMode:true}));
  assert.throws(()=>verify({requests:[base,{method:'PUT',path:'/api/v1/favorites/video/video-0'}]},{gridSurfaceMode:true}));
  assert.match(runner,/verifyContractTraffic\(fixture,\{actualMode,rulesMode,mediaMode,ticketsMode,stripMode,taskCenterMode,lifecycleMode,gridSurfaceMode,closeReceiptMode\}\)/);
});
