import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementIntentControl} from '../testing/rhvideo-replacement-intent.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {until} from '../testing/app-session.mjs';
test('the metadata gate holds only video reads, not an unrelated picture catalog',async()=>{
  const control=replacementIntentControl(),gate=control.arm();let finished=false;const pending=control.beforeCatalog('video').then(()=>finished=true);
  assert.equal(await control.beforeCatalog('picture'),null);assert.equal(gate.reads,1);assert.equal(finished,false);gate.release();await pending;assert.equal(finished,true);
});
test('one explicit gate at a time, with idempotent bound teardown',()=>{const control=replacementIntentControl(),gate=control.arm();assert.throws(()=>control.arm(),/Only one/);gate.release();gate.release();control.release();assert.doesNotThrow(()=>control.arm());control.release();});
test('a stale gate release cannot release a newer metadata operation',async()=>{
  const control=replacementIntentControl(),old=control.arm();old.release();const current=control.arm();let finished=false;const pending=control.beforeCatalog('video').then(()=>finished=true);
  old.release();await Promise.resolve();assert.equal(finished,false);assert.equal(current.reads,1);current.release();await pending;assert.equal(finished,true);
});
test('the actual generated HTTP response remains held until its matching release',async()=>{
  const control=replacementIntentControl(),fixture=await rhvideoFixture({videoCount:3,beforeCatalog:control.beforeCatalog}),gate=control.arm();
  try{let finished=false;const request=fetch(fixture.url+'/api/v1/videos',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}}).then(async response=>{assert.equal(response.status,200);const rows=await response.json();finished=true;return rows;});
    await until(()=>gate.reads===1,'actual held HTTP request');assert.equal(finished,false);gate.release();assert.equal((await request).length,3);assert.equal(fixture.requests.filter(row=>row.path==='/api/v1/videos').length,1);
  }finally{control.release();await fixture.close();}
});
