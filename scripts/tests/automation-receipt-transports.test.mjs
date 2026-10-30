import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {main,waitWithReceipt,recoverRun} from '../rhfiles-api.mjs';

async function withTransportFixture(wait,work){
  const calls=[],sockets=[],writes=[],oldFetch=globalThis.fetch,oldSocket=globalThis.WebSocket;
  const receipt={id:'grid:1',action:'rhvideo.grid.close',state:'succeeded',startedAt:1,finishedAt:2,result:{closed:true}};
  const producer={type:'page',id:'producer',url:'http://tauri.localhost/rhvideo-grid.html',webSocketDebuggerUrl:'ws://127.0.0.1:9222/producer'};
  const survivors=Array.from({length:12},(_,i)=>({type:'page',id:'survivor-'+i,url:'http://tauri.localhost/rhvideo.html',webSocketDebuggerUrl:'ws://127.0.0.1:9222/survivor-'+i}));
  const untrusted={...producer,id:'untrusted',url:'http://localhost/untrusted.html',webSocketDebuggerUrl:'ws://127.0.0.1:9222/untrusted'};
  let discoveries=0;
  globalThis.fetch=async()=>{discoveries++;assert.equal(discoveries,1,'A completed close cannot depend on a second enumeration');return {ok:true,json:async()=>[producer,untrusted,...survivors]};};
  globalThis.WebSocket=class extends EventTarget{
    constructor(url){super();this.id=new URL(url).pathname.slice(1);this.closed=false;sockets.push(this);calls.push({kind:'connect',id:this.id});queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
    send(raw){const message=JSON.parse(raw),query=vm.runInNewContext(message.params.expression,{RHFilesAPI:{rpc:value=>value}});calls.push({kind:'rpc',id:this.id,method:query.method});
      if(this.id==='producer'&&query.method==='runs.wait'){queueMicrotask(()=>this.close());return;}
      const value=query.method==='actions.run'?{result:{...receipt,state:'running',finishedAt:null}}:{result:receipt};
      queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:message.id,result:{result:{value}}})})));
    }
    close(){if(this.closed)return;this.closed=true;calls.push({kind:'close',id:this.id});this.dispatchEvent(new Event('close'));}
  };
  try{
    await main(['--endpoint','http://127.0.0.1:9222','--target','producer','--timeout','500',...(wait?['--wait']:[]),'--key','once','run','rhvideo.grid.close','{}'],{write:value=>writes.push(value)});
    await work({calls,sockets,writes,discoveries});
  }finally{globalThis.fetch=oldFetch;globalThis.WebSocket=oldSocket;}
}

test('waiting CLI reserves at most eight survivor transports before one action and closes every socket',async()=>{
  await withTransportFixture(true,async({calls,sockets,writes})=>{
    assert.equal(writes[0].result.state,'succeeded');assert.equal(writes[0].result.result.closed,true);
    const sent=calls.findIndex(call=>call.kind==='rpc'&&call.method==='actions.run');assert.equal(calls.slice(0,sent).filter(call=>call.kind==='connect').length,9,'The selected producer plus eight bounded survivors');
    assert.equal(sockets.length,9);assert(sockets.every(socket=>socket.closed),'No receipt transport may outlive the CLI connection');
    const actions=calls.filter(call=>call.kind==='rpc'&&call.method==='actions.run');assert.deepEqual(actions,[{kind:'rpc',id:'producer',method:'actions.run'}]);
    assert(calls.some(call=>call.kind==='rpc'&&call.id==='survivor-0'&&call.method==='runs.status'));assert(!sockets.some(socket=>socket.id==='untrusted'));
    assert.equal(calls.filter(call=>call.kind==='connect').length,9,'Recovery reuses a reserved socket, not a new handshake');
  });
});

test('a non-waiting CLI does not open unused receipt transports',async()=>{
  await withTransportFixture(false,async({sockets,writes})=>{assert.equal(sockets.length,1);assert.equal(writes[0].result.state,'running');assert(sockets[0].closed);});
});

test('opt-in CLI traces carry wall and monotonic timestamps without request arguments',async()=>{
  const previous=process.env.RHFILES_CLI_TRACE,write=process.stderr.write,rows=[],started=Date.now();
  process.env.RHFILES_CLI_TRACE='1';process.stderr.write=chunk=>{rows.push(JSON.parse(String(chunk)));return true;};
  try{
    await withTransportFixture(false,async()=>{});
    assert.deepEqual(rows.map(row=>row.rhfilesClientTrace),['request.send','request.reply']);
    for(const row of rows){assert(Number.isSafeInteger(row.wallMs)&&row.wallMs>=started&&row.wallMs<=Date.now());assert(Number.isSafeInteger(row.atMs)&&row.atMs>=0);assert(!Object.hasOwn(row,'args'));assert(!Object.hasOwn(row,'key'));}
  }finally{process.stderr.write=write;if(previous===undefined)delete process.env.RHFILES_CLI_TRACE;else process.env.RHFILES_CLI_TRACE=previous;}
});

test('a silent producer cannot consume the deadline before a completed process receipt is read',async()=>{
  let reads=0;const completed={result:{state:'succeeded',result:{closed:true}}};
  const result=await waitWithReceipt(()=>new Promise(()=>{}),async()=>{reads++;return completed;});assert.equal(result,completed);assert.equal(reads,1);
});

test('a producer disconnect does not discard an already pending completion read',async()=>{
  let finish;const deferred=new Promise(resolve=>finish=resolve),pending=waitWithReceipt(async()=>{throw Error('Disconnected');},()=>deferred);
  const completed={result:{state:'succeeded'}};finish(completed);assert.equal(await pending,completed);
});

test('a missing process receipt preserves the primary reply and original primary error',async()=>{
  const completed={result:{state:'succeeded'}},error=Error('Original disconnect');
  assert.equal(await waitWithReceipt(async()=>completed,async()=>null),completed);
  await assert.rejects(waitWithReceipt(async()=>{throw error;},async()=>null),value=>value===error);
  await assert.rejects(waitWithReceipt(async()=>{throw error;},async()=>{throw Error('Lookup unavailable');}),value=>value===error);
});

test('finishing the primary request aborts an unfinished receipt read and closes its transport',async()=>{
  const controller=new AbortController();let entered,closed=0;
  const started=new Promise(resolve=>entered=resolve),request={method:'actions.run',params:{action:'rhvideo.grid.close',key:'once'}},target={type:'page',id:'survivor',url:'http://tauri.localhost/rhvideo.html'};
  let rejectPending;const result=await waitWithReceipt(async()=>{await started;return {result:{state:'succeeded'}};},()=>recoverRun('',{},request,'grid:1',Date.now()+1000,{signal:controller.signal,knownTargets:[target],fetchTargets:async()=>{throw Error('No discovery after completion');},openSession:async()=>({evaluate:()=>{entered();return new Promise((_,reject)=>rejectPending=reject);},close(){closed++;rejectPending?.(Error('Read ended'));}})}));
  controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(result.result.state,'succeeded');assert(closed>0);
});
