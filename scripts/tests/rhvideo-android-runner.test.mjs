import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8'),java=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');let success,artifact;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.object?.name==='assert'&&node.callee.property?.name==='match'&&node.arguments[0]?.name==='output')success=node.arguments[1];if(node.type==='VariableDeclarator'&&node.id?.name==='artifact')artifact=node.init;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
const modes={actualMode:false,loginMode:false,exportsMode:false,gridRotationMode:false,gridRestoreMode:false,gridMode:false,playlistMode:false,previewMode:false,singleMode:true,favoritesMode:false,stripMode:false,ticketsMode:false,rotationMode:false};
test('Android runner recognizes the actual expanded Single success receipt, not an obsolete label',()=>{
  assert(success);const pattern=vm.runInNewContext(source.slice(success.start,success.end),modes),message=[...java.matchAll(/result\.putString\("stream","((?:\\.|[^"\\])*)"\)/g)].map(v=>v[1]).find(v=>v.startsWith('PASS: contextual workflow entries'));
  assert(message);assert.match(message,pattern);assert(!pattern.test('PASS: native HTTP'),'A weaker unrelated mode result cannot pass Single');
});
test('every native run has a distinct artifact directory, so failure cannot inherit old success screenshots',()=>{
  assert(artifact);let now=1;const scope=vm.createContext({...modes,path,Date:{now:()=>now}}),expression=source.slice(artifact.start,artifact.end),first=vm.runInContext(expression,scope);now++;const second=vm.runInContext(expression,scope);assert.notEqual(first,second);assert.match(first,/rhvideo-android-single-/);
});
