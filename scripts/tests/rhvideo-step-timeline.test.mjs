import test from 'node:test';
import assert from 'node:assert/strict';
import {stepTimeline} from '../testing/rhvideo-step-timeline.mjs';
test('step delivery observation handles partial lines and does not record arguments or logs',()=>{
  let now=100;const trace=stepTimeline({now:()=>now});
  trace.push('STEP: rhvideo.gall');now=120;trace.push('ery.open\r\nSTEP: native.automation.media.control\n');
  trace.push('STEP: rhvideo.secret Bearer password\nSTEP: gallery scope {"private":"data"}\n'+('x'.repeat(6000)));
  now=150;trace.push('\nSTEP: files.native.media.state\n');
  assert.deepEqual(trace.snapshot().steps,[{command:'rhvideo.gallery.open',deliveredMs:20},{command:'native.automation.media.control',deliveredMs:20},{command:'files.native.media.state',deliveredMs:50}]);
  assert.doesNotMatch(JSON.stringify(trace.snapshot()),/Bearer|password|private|6000/);
});
test('step delivery records are bounded and snapshots cannot mutate the observer',()=>{
  const trace=stepTimeline({now:()=>1,limit:2});trace.push('STEP: rhvideo.state\n'.repeat(3));const snapshot=trace.snapshot();assert.equal(snapshot.steps.length,2);assert.equal(snapshot.dropped,1);snapshot.steps[0].command='changed';assert.equal(trace.snapshot().steps[0].command,'rhvideo.state');
  for(const limit of [0,-1,1.1,Infinity,4097])assert.throws(()=>stepTimeline({limit}));
});
