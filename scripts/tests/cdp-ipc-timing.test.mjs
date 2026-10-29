import test from 'node:test';import assert from 'node:assert/strict';
import {ipcTimingCollector,ownedIpcTarget} from '../testing/cdp-ipc-timing.mjs';
const request=(id,action='play')=>({method:'Network.requestWillBeSent',params:{requestId:id,timestamp:100,request:{url:'http://ipc.localhost/rhvideo_request',postData:JSON.stringify({action,password:'never-save',args:{token:'never-save'}}),headers:{Authorization:'Bearer never-save'}}}});
test('IPC timing stores numeric phases without request bodies, headers, URLs or credentials',()=>{
 const c=ipcTimingCollector();c.accept(request('one','login'));c.accept(request('two'));
 c.accept({method:'Network.responseReceived',params:{requestId:'two',timestamp:100.3,response:{status:200,url:'private',headers:{Secret:'never-save'},timing:{receiveHeadersStart:299,remoteAddress:'never-save'}}}});
 c.accept({method:'Network.dataReceived',params:{requestId:'two',timestamp:100.31,dataLength:1200,data:'never-save'}});
 c.accept({method:'Network.loadingFinished',params:{requestId:'two',timestamp:100.32,encodedDataLength:1500}});
 const rows=c.snapshot();assert.deepEqual(rows.map(r=>r.phase),['sent','headers','data','finished']);assert(Math.abs(rows[1].atMs-300)<.001);
 assert.deepEqual(rows[1].timing,{receiveHeadersStart:299});assert(!/never-save|password|private|http:/.test(JSON.stringify(rows)));
});
test('IPC timing is bounded, ignores unknown requests and does not retain arbitrary error URLs',()=>{
 const c=ipcTimingCollector();for(let i=0;i<100;i++)c.accept(request(String(i)));
 for(let i=0;i<100;i++)c.accept({method:'Network.loadingFailed',params:{requestId:'0',timestamp:101,errorText:'ERR_FAILED https://private/password'}});
 assert.equal(c.snapshot().filter(r=>r.phase==='sent').length,4);assert.equal(c.snapshot().length,64);assert(!JSON.stringify(c.snapshot()).includes('password'));
 const copy=c.snapshot();copy[0].phase='changed';assert.equal(c.snapshot()[0].phase,'sent');
});
test('network observers cannot attach to another port, remote host, credential URL or browser target',()=>{
 const target=url=>({webSocketDebuggerUrl:url});assert.equal(ownedIpcTarget(target('ws://127.0.0.1:32222/devtools/page/one'),32222).port,'32222');
 for(const url of ['ws://127.0.0.1:32223/devtools/page/one','ws://example.com:32222/devtools/page/one','wss://127.0.0.1:32222/devtools/page/one','ws://u:p@127.0.0.1:32222/devtools/page/one','ws://127.0.0.1:32222/devtools/browser/one','ws://127.0.0.1:32222/devtools/page/one?token=secret'])assert.throws(()=>ownedIpcTarget(target(url),32222),/owned local debugger/);
});
