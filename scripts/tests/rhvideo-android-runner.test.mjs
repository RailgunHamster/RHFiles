import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8'),java=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');let success,artifact,traffic,failure;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.object?.name==='assert'&&node.arguments[0]?.name==='output'){if(node.callee.property?.name==='match')success=node.arguments[1];if(node.callee.property?.name==='doesNotMatch')failure=node.arguments[1];}if(node.type==='VariableDeclarator'&&node.id?.name==='artifact')artifact=node.init;if(node.type==='FunctionDeclaration'&&node.id?.name==='verifyContractTraffic')traffic=node;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
const modes={actualMode:false,rulesMode:false,loginMode:false,exportsMode:false,gridRotationMode:false,gridRestoreMode:false,gridMode:false,playlistMode:false,previewMode:false,singleMode:true,favoritesMode:false,stripMode:false,ticketsMode:false,rotationMode:false};
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
