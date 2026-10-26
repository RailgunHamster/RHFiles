import test from 'node:test';import assert from 'node:assert/strict';import {allocateAdbForward} from '../rhfiles-api.mjs';
test('ADB debugging uses a bounded high port and cannot replace another task forward',()=>{
 let n=22000;const calls=[];const port=allocateAdbForward(args=>{calls.push(args);if(calls.length===1)throw Error('cannot bind listener: address in use');},'localabstract:webview_devtools_remote_123',{randomPort:()=>n++});
 assert.equal(port,'22001');assert.deepEqual(calls[0],['forward','--no-rebind','tcp:22000','localabstract:webview_devtools_remote_123']);
});
test('ADB offline/auth errors are not retried, collisions have a finite budget',()=>{
 let calls=0;assert.throws(()=>allocateAdbForward(()=>{calls++;throw Error('device offline');},'tcp:39128'),/offline/);assert.equal(calls,1);
 calls=0;assert.throws(()=>allocateAdbForward(()=>{calls++;throw Error('cannot bind listener');},'tcp:39128'),/bounded allocation/);assert.equal(calls,16);
 assert.throws(()=>allocateAdbForward(()=>{},'localabstract:other_app'),/Invalid local/);assert.throws(()=>allocateAdbForward(()=>{},'tcp:39128',{randomPort:()=>1719}),/Invalid local debugging port/);
});
