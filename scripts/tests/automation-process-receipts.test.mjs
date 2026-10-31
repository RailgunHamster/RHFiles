import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {receiptTransport,readProcessReceipt,matchingReceipt} from '../rhfiles-receipts.mjs';
import {recoverProcessReceipt} from '../rhfiles-api.mjs';
const {create}=createRequire(import.meta.url)('../../src/js/automation-core.js');
const transport={type:'windows-pipe',path:'\\\\.\\pipe\\RHFiles.receipts.'+'a'.repeat(32),secret:'b'.repeat(64)};
const request={jsonrpc:'2.0',id:'caller',method:'actions.run',params:{action:'rhvideo.grid.close',key:'once',args:{}}};
const done={id:'grid:1',action:request.params.action,state:'succeeded',startedAt:1,finishedAt:2,result:{closed:true}};

test('local transport discovery is explicit, singleton, schema-checked and absent from state',async()=>{
  const api=create({instanceId:'test'});let calls=0;
  const rpc=params=>api.rpc({jsonrpc:'2.0',id:'read',method:'runs.transport',params});
  assert.equal((await rpc({})).result,null);api.provideRunTransport(async()=>{calls++;return transport;});assert.equal(calls,0);
  assert.deepEqual((await rpc({})).result,transport);assert.equal(calls,1);assert.equal((await rpc({action:'delete'})).error.data.code,'INVALID_PARAMS');assert.equal(calls,1);
  assert.throws(()=>api.provideRunTransport(()=>null),{code:'INVALID_RUN_TRANSPORT'});assert(!JSON.stringify(api.snapshot()).includes(transport.secret));
});
test('transport descriptors reject remote pipes, other namespaces, extra fields and non-Windows hosts',()=>{
  assert.deepEqual(receiptTransport(transport,'win32'),transport);
  for(const value of [null,{...transport,type:'tcp'},{...transport,path:'\\\\server\\pipe\\RHFiles.receipts.'+'a'.repeat(32)},{...transport,path:'\\\\.\\pipe\\other'},{...transport,secret:'short'},{...transport,action:'delete'}])assert.equal(receiptTransport(value,'win32'),null);
  for(const platform of ['linux','darwin','android'])assert.equal(receiptTransport(transport,platform),null);
});
test('an invalid descriptor or already-aborted read cannot open any connection',async()=>{
  let opened=0;const connect=()=>{opened++;throw Error('Must not open');};
  await assert.rejects(readProcessReceipt({...transport,path:'\\\\server\\pipe\\anything'},{},Date.now()+1000,{platform:'win32',connect}),{code:'INVALID_RECEIPT_TRANSPORT'});
  const controller=new AbortController();controller.abort();await assert.rejects(readProcessReceipt(transport,{},Date.now()+1000,{platform:'win32',connect,signal:controller.signal}),{code:'READ_ABORTED'});assert.equal(opened,0);
});
async function wire(response,work){
  const sockets=new Set(),requests=[];
  let received;const requestReceived=new Promise(resolve=>received=resolve);
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let input='';socket.on('data',bytes=>{input+=bytes;if(!input.includes('\n'))return;const value=JSON.parse(input);requests.push(value);received(value);response(socket,value);});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const connect=()=>net.createConnection({host:'127.0.0.1',port:server.address().port}),read=(query={runId:done.id},options={})=>readProcessReceipt(transport,query,Date.now()+1000,{connect,platform:'win32',...options});
  try{await work({read,requests,sockets,requestReceived});}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
test('one authenticated read can receive a fragmented real-stream response without submitting an action',async()=>{
  await wire((socket,value)=>{assert.equal(value.secret,transport.secret);assert.deepEqual(value.query,{runId:done.id});socket.write('{"res');setImmediate(()=>socket.end('ult":'+JSON.stringify(done)+'}\n'));},async({read,requests})=>{assert.deepEqual((await read()).result,done);assert.equal(requests.length,1);assert.deepEqual(Object.keys(requests[0]).sort(),['query','secret']);});
});
for(const response of ['not-json\n','{}\n','{"result":null,"error":{}}\n','{"result":null}\ntrailing'])test('malformed native packet is not a confirmed completion: '+response.trim(),async()=>{
  await wire(socket=>socket.end(response),async({read})=>assert.rejects(read(),{code:'INVALID_RECEIPT'}));
});
test('an oversized response is bounded and incomplete EOF is not success',async()=>{
  await wire(socket=>socket.end('x'.repeat(1024*1024+1)),async({read})=>assert.rejects(read(),{code:'INVALID_RECEIPT'}));
  await wire(socket=>socket.end('{"result":'),async({read})=>assert.rejects(read(),{code:'RECEIPT_UNAVAILABLE'}));
});
test('abort and deadline close only the read; they neither cancel nor repeat the accepted operation',async()=>{
  await wire(()=>{},async({read,requests,requestReceived})=>{const controller=new AbortController(),observed=read({runId:done.id},{signal:controller.signal}).then(value=>({value}),error=>({error}));const first=await Promise.race([requestReceived.then(()=>({accepted:true})),observed]);assert.equal(first.accepted,true,'The read must reach the server before testing an accepted-query abort: '+String(first.error?.code||''));controller.abort();assert.equal((await observed).error?.code,'READ_ABORTED');assert.equal(requests.length,1);});
  let opened=0;await assert.rejects(readProcessReceipt(transport,{runId:done.id},Date.now()-1,{platform:'win32',connect:()=>opened++}),{code:'REQUEST_TIMEOUT'});assert.equal(opened,0);
});
test('only the matching action and confirmed native result can win recovery',async()=>{
  const calls=[],read=async(_transport,query)=>{calls.push(query);return {result:done};};
  const reply=await recoverProcessReceipt(transport,request,done.id,Date.now()+1000,{read});assert.equal(reply.id,'caller');assert.deepEqual(reply.result,done);assert.equal(calls.length,1);assert.equal(calls[0].runId,done.id);assert(!Object.hasOwn(calls[0],'action'));
  for(const value of [{...done,id:'other:1'},{...done,action:'file.delete'},{...done,result:undefined},{...done,finishedAt:null},{...done,state:'failed',error:{code:'FAIL'}}]){assert.equal(matchingReceipt(value,request,done.id),false);assert.equal(await recoverProcessReceipt(transport,request,done.id,Date.now()+1000,{read:async()=>({result:value})}),null);}
});
test('an unknown run ID uses its original key; expiration never authorizes another operation',async()=>{
  let query;const reply=await recoverProcessReceipt(transport,request,undefined,Date.now()+1000,{read:async(_transport,value)=>{query=value;return {error:{code:'RESULT_EXPIRED'}};}});assert.equal(query.key,'once');assert(!Object.hasOwn(query,'runId'));assert.equal(reply.error.data.code,'RESULT_EXPIRED');
});
