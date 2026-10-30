import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8'),java=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');let success,artifact,traffic,failure,audioCapture;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.object?.name==='assert'&&node.arguments[0]?.name==='output'){if(node.callee.property?.name==='match')success=node.arguments[1];if(node.callee.property?.name==='doesNotMatch')failure=node.arguments[1];}if(node.type==='VariableDeclarator'&&node.id?.name==='artifact')artifact=node.init;if(node.type==='FunctionDeclaration'&&node.id?.name==='verifyContractTraffic')traffic=node;if(node.type==='FunctionDeclaration'&&node.id?.name==='captureGridAudio')audioCapture=node;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
const modes={actualMode:false,lifecycleMode:false,closeReceiptMode:false,singleClockMode:false,taskCenterMode:false,priorityMode:false,duplicatesMode:false,rulesMode:false,loginMode:false,exportsMode:false,gridSurfaceMode:false,gridRotationMode:false,gridRestoreMode:false,gridMode:false,playlistMode:false,previewMode:false,singleMode:true,favoritesMode:false,stripMode:false,ticketsMode:false,rotationMode:false};

for(const [mode,prefix,namespace]of [['closeReceiptMode','library self-close semantic/UI process receipts','close-receipt'],['gridSurfaceMode','surface-only grid diagnostic','grid-surface'],['singleClockMode','single-player real-clock diagnostic; not full product acceptance','single-clock']])test(`${mode} requires its own native receipt and cannot inherit another mode's artifacts`,()=>{
  const scope={...modes,singleMode:false,[mode]:true,path,Date};
  const pattern=vm.runInNewContext(source.slice(success.start,success.end),scope);
  const message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: '+prefix));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'));assert(!pattern.test('PASS: reference grid'));
  assert.match(vm.runInNewContext(source.slice(artifact.start,artifact.end),scope),new RegExp('rhvideo-android-'+namespace+'-'));
});

test('single-clock control decodes authenticated media but cannot mutate server state',()=>{
  const verify=vm.runInNewContext('('+source.slice(traffic.start,traffic.end)+')',{assert});
  const request={method:'GET',path:'/api/v1/videos/video-0/play',authorization:'Bearer fixture-bearer-do-not-persist'};
  verify({requests:[request,{method:'POST',path:'/api/v1/auth/login'}]},{singleClockMode:true});
  for(const requests of [[],[{...request,authorization:''}],[request,{method:'PUT',path:'/api/v1/favorites/video/video-0'}],[request,{method:'POST',path:'/api/v1/progress/video/video-0'}],[request,{method:'DELETE',path:'/api/v1/auth/login'}]])assert.throws(()=>verify({requests},{singleClockMode:true}));
});
test('Android runner recognizes the actual expanded Single success receipt, not an obsolete label',()=>{
  assert(success);const pattern=vm.runInNewContext(source.slice(success.start,success.end),modes),message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: contextual workflow entries'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'),'A weaker unrelated mode result cannot pass Single');
});
test('every native run has a distinct artifact directory, so failure cannot inherit old success screenshots',()=>{
  assert(artifact);let now=1;const scope=vm.createContext({...modes,path,Date:{now:()=>now}}),expression=source.slice(artifact.start,artifact.end),first=vm.runInContext(expression,scope);now++;const second=vm.runInContext(expression,scope);assert.notEqual(first,second);assert.match(first,/rhvideo-android-single-/);
});
test('tag-only native acceptance verifies authenticated catalogs and no writes, not unrelated playback',()=>{
  assert(traffic);const verify=vm.runInNewContext('('+source.slice(traffic.start,traffic.end)+')',{assert}),request=path=>({method:'GET',path,authorization:'Bearer fixture-bearer-do-not-persist'}),fixture={requests:['/api/v1/videos','/api/v1/pictures/catalog','/api/v1/screenshots/grid'].map(request)};
  verify(fixture,{rulesMode:true});
  assert.throws(()=>verify({requests:fixture.requests.slice(1)},{rulesMode:true}),/authenticated actual catalog/);
  assert.throws(()=>verify({requests:fixture.requests.map(r=>({...r,authorization:''}))},{rulesMode:true}),/authenticated actual catalog/);
  assert.throws(()=>verify({requests:[...fixture.requests,{method:'DELETE',path:'/api/v1/videos/video-0'}]},{rulesMode:true}),/cannot modify server media/);
  assert.throws(()=>verify(fixture,{mediaMode:true}),/actually request authenticated media/);
  verify({requests:[request('/api/v1/videos/video-0/play')]},{mediaMode:true});
  verify({requests:[request('/storage/pictures/0.svg')]},{mediaMode:true,stripMode:true});
  assert.throws(()=>verify({requests:[request('/api/v1/videos/video-0/play')],progress:[],favorites:new Set()},{mediaMode:false}),/Reader progress reached server/);
});
test('rules mode accepts only its own expanded native success receipt',()=>{
  const pattern=vm.runInNewContext(source.slice(success.start,success.end),{...modes,singleMode:false,rulesMode:true}),message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: native tag rules'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'));assert(!pattern.test('PASS: contextual workflow entries'));
});
test('native ANR output is a failure even when adb exits zero or an earlier phase printed PASS',()=>{
  assert(failure);const pattern=vm.runInNewContext(source.slice(failure.start,failure.end));for(const text of ['FAIL: failed assertion','INSTRUMENTATION_FAILED','INSTRUMENTATION_RESULT: shortMsg=keyDispatchingTimedOut','PASS: native HTTP\nInput dispatching timed out'])assert(pattern.test(text),text);assert(!pattern.test('PASS: native tag rules'));
});

test('duplicate native acceptance has its own real-backend receipt and artifact namespace',()=>{
  const scope={...modes,duplicatesMode:true,actualMode:true,path,Date},pattern=vm.runInNewContext(source.slice(success.start,success.end),scope);
  const message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: actual duplicates'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'));assert(!pattern.test('PASS: contextual workflow entries'));
  assert.match(vm.runInNewContext(source.slice(artifact.start,artifact.end),scope),/rhvideo-android-duplicates-/);
});

test('task priority acceptance cannot pass using a duplicate or generic native receipt',()=>{
  const scope={...modes,priorityMode:true,actualMode:true,path,Date},pattern=vm.runInNewContext(source.slice(success.start,success.end),scope);
  const message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: actual task priority'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: actual duplicates'));assert(!pattern.test('PASS: native HTTP'));
  assert.match(vm.runInNewContext(source.slice(artifact.start,artifact.end),scope),/rhvideo-android-task-priority-/);
});

test('task center acceptance requires its own receipt, namespace and authenticated read-only task traffic',()=>{
  const scope={...modes,taskCenterMode:true,path,Date},pattern=vm.runInNewContext(source.slice(success.start,success.end),scope);
  const message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: packaged task center'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: actual task priority'));assert(!pattern.test('PASS: native HTTP'));
  assert.match(vm.runInNewContext(source.slice(artifact.start,artifact.end),scope),/rhvideo-android-task-center-/);
  const verify=vm.runInNewContext('('+source.slice(traffic.start,traffic.end)+')',{assert}),request={method:'GET',path:'/api/v1/processing-tasks/default/video:metrics',authorization:'Bearer fixture-bearer-do-not-persist'};
  verify({requests:[request]},{taskCenterMode:true});assert.throws(()=>verify({requests:[{...request,authorization:''}]},{taskCenterMode:true}),/authenticated native HTTP/);
  assert.throws(()=>verify({requests:[request,{method:'POST',path:'/api/v1/processing-tasks/default/video:metrics/prioritize'}]},{taskCenterMode:true}),/never mutates media/);
});

test('lifecycle acceptance requires its own real-media receipt and cannot hide server writes',()=>{
  const scope={...modes,lifecycleMode:true,singleMode:false,path,Date},pattern=vm.runInNewContext(source.slice(success.start,success.end),scope);
  const message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: native HTTP lifecycle'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'));assert(!pattern.test('PASS: packaged task center'));
  assert(!pattern.test('PASS: native HTTP lifecycle, real subtitle fixture, HOME/stop/resume'),'An older Single-only lifecycle receipt cannot pass the expanded grid coverage');
  assert.match(vm.runInNewContext(source.slice(artifact.start,artifact.end),scope),/rhvideo-android-lifecycle-/);
  const verify=vm.runInNewContext('('+source.slice(traffic.start,traffic.end)+')',{assert}),request={method:'GET',path:'/api/v1/videos/video-2/play',authorization:'Bearer fixture-bearer-do-not-persist'};
  verify({requests:[request]},{lifecycleMode:true});assert.throws(()=>verify({requests:[{...request,authorization:''}]},{lifecycleMode:true}),/authenticated media/);
  assert.throws(()=>verify({requests:[request,{method:'POST',path:'/api/v1/trash/video/video-2'}]},{lifecycleMode:true}),/cannot replay/);
  verify({requests:[request,{method:'POST',path:'/api/v1/auth/login'}]},{lifecycleMode:true});
  assert.throws(()=>verify({requests:[request,{method:'DELETE',path:'/api/v1/auth/login'}]},{lifecycleMode:true}),/cannot replay/);
});

for(const failed of [false,true])test(`live grid audio snapshot is a bounded asynchronous read with a truthful ${failed?'failed':'captured'} receipt`,async()=>{
  assert(audioCapture);const writes=new Map();let calls=0;
  const capture=vm.runInNewContext('('+source.slice(audioCapture.start,audioCapture.end)+')',{
    adb:'owned-adb.exe',serial:'emulator-5584',artifact:'artifact',path,fs:{writeFileSync:(file,text)=>writes.set(path.basename(file),text)},
    execFile:(file,args,options,done)=>{calls++;assert.equal(file,'owned-adb.exe');assert.deepEqual(Array.from(args),['-s','emulator-5584','shell','dumpsys','media.audio_flinger']);assert.equal(options.timeout,10000);assert.equal(options.maxBuffer,4*1024*1024);assert.equal(options.encoding,'utf8');assert.equal(options.windowsHide,true);const error=failed?Object.assign(new Error('secret-diagnostic-message'),{code:'ETIMEDOUT'}):null;queueMicrotask(()=>done(error,'owned audio tracks'));}
  });
  const receipt=await capture(321);assert.equal(calls,1);assert.equal(receipt.expectedPid,321);assert.equal(receipt.captured,!failed);assert.equal(receipt.reason,failed?'ETIMEDOUT':null);
  assert.equal(writes.get('native-audio-flinger-at-failure.log'),'owned audio tracks');const saved=JSON.parse(writes.get('native-audio-flinger-receipt.json'));assert.equal(saved.captured,!failed);assert(!JSON.stringify(saved).includes('secret-diagnostic-message'));
  assert.match(source,/if\(gridAudioCapture\)await gridAudioCapture/,'The host must drain its own in-flight read before ending instrumentation');
});

test('a playback failure captures bounded power/display/app-frame reads without resetting any service',async()=>{
  const node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='capturePlaybackEnvironment');assert(node);
  const calls=[],writes=new Map(),callbacks=[];
  const capture=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{
    assert,adb:'owned-adb.exe',serial:'emulator-5586',artifact:'artifact',path,fs:{writeFileSync:(file,text)=>writes.set(path.basename(file),text)},
    execFile:(file,args,options,done)=>{assert.equal(file,'owned-adb.exe');assert.equal(options.timeout,10000);assert.equal(options.maxBuffer,4*1024*1024);assert.equal(options.windowsHide,true);calls.push(Array.from(args));callbacks.push(done);}
  });
  const pending=capture(456);assert.equal(calls.length,3,'Queue each independent read without blocking the HTTP fixture');
  assert.deepEqual(calls,[['-s','emulator-5586','shell','dumpsys','power'],['-s','emulator-5586','shell','dumpsys','display'],['-s','emulator-5586','shell','dumpsys','gfxinfo','com.railgunhamster.rhfiles']]);
  callbacks[0](null,'Awake');callbacks[1](Object.assign(new Error('private reason'),{code:'ETIMEDOUT'}),'partial display');callbacks[2](null,'app frames');
  const receipt=await pending;assert.equal(receipt.length,3);assert.equal(receipt[1].captured,false);assert.equal(receipt[1].reason,'ETIMEDOUT');assert(receipt.every(v=>v.expectedPid===456));
  assert.equal(writes.get('native-power-at-failure.log'),'Awake');assert.equal(writes.get('native-display-at-failure.log'),'partial display');
  assert(!writes.get('native-environment-receipt.json').includes('private reason'));
  assert.match(source,/Promise\.all\(\[captureGridAudio\(Number\(failure\[1\]\)\),capturePlaybackEnvironment\(Number\(failure\[1\]\)\)\]\)/);
  assert.throws(()=>capture(0));
});
