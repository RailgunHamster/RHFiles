import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waitForLibraryReady} from '../testing/library-session.mjs';

test('registered library APIs do not admit business actions until actual application readiness',async()=>{
  const expressions=[];let ready=false,finished=false;
  const pending=waitForLibraryReady({evaluate:async expression=>{expressions.push(expression);return ready;}},1000).then(()=>finished=true);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(finished,false);
  ready=true;await pending;assert.equal(finished,true);
  assert(expressions.length>=2);assert(expressions.every(value=>value.includes('application?.ready===true')&&!value.includes('invoke(')),'Only read readiness; never replay a business operation');
});

test('a library that never becomes ready fails closed instead of skipping its scenario',async()=>{
  await assert.rejects(waitForLibraryReady({evaluate:async()=>false},10),/never reported ready/);
});

test('a real readiness transport error propagates and is never retried until green',async()=>{
  let reads=0;await assert.rejects(waitForLibraryReady({evaluate:async()=>{reads++;throw Error('Owned transport closed');}},1000),/Owned transport closed/);assert.equal(reads,1);
});

test('library readiness has a bounded timeout',async()=>{
  for(const timeout of [0,-1,60001,Infinity])await assert.rejects(waitForLibraryReady({},timeout),/Invalid library readiness timeout/);
});

test('ordinary library scenarios cannot regress to registration-only startup; login race scenarios retain raw observation',()=>{
  const folder=new URL('../e2e/',import.meta.url);
  for(const name of fs.readdirSync(folder).filter(name=>/^rhvideo.*\.test\.mjs$/.test(name))){
    const source=fs.readFileSync(new URL(name,folder),'utf8');
    if(!source.includes('connection.connect')||name==='rhvideo-login.test.mjs')continue;
    assert(!/import\s*\{[^}]*\bcdpSession\b[^}]*\}\s*from\s*['"]\.\.\/rhfiles-api\.mjs['"]/.test(source),name+': wait for the actual library document to be ready');
  }
  assert(fs.readFileSync(new URL('rhvideo-login.test.mjs',folder),'utf8').includes("from'../rhfiles-api.mjs'"),'Do not hide the real late-restore/logout race tests behind a readiness wait');
});
