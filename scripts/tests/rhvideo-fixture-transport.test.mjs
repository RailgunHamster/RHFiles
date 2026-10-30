import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import http from 'node:http';
import {fixtureTransport} from '../testing/rhvideo-fixture-transport.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('fixture transport distinguishes queued, finished and cancelled responses without storing payload/credentials',()=>{
  let now=100;const transport=fixtureTransport({now:()=>now}),pending=new EventEmitter(),finished=new EventEmitter();
  Object.assign(pending,{headersSent:false,statusCode:200,writableFinished:false});
  Object.assign(finished,{headersSent:true,statusCode:206,writableFinished:true});
  transport.observe(pending,0);now=120;transport.observe(finished,1);
  assert.equal(transport.snapshot().requests[0].finishedMs,null);
  now=130;pending.emit('close');now=140;finished.emit('finish');now=150;finished.emit('close');
  assert.deepEqual(transport.snapshot().requests,[
    {requestIndex:0,startedMs:0,finishedMs:null,closedMs:30,statusCode:null,writableFinished:false,errorClass:null},
    {requestIndex:1,startedMs:20,finishedMs:40,closedMs:50,statusCode:206,writableFinished:true,errorClass:null},
  ]);
  const copy=transport.snapshot();copy.requests[0].finishedMs=999;assert.equal(transport.snapshot().requests[0].finishedMs,null);
});

test('fixture transport caps retained records, does not observe discarded responses and records no error text',()=>{
  const transport=fixtureTransport({limit:2}),responses=Array.from({length:3},()=>new EventEmitter());
  responses.forEach((response,i)=>transport.observe(response,i));
  responses[0].emit('error',new TypeError('Bearer secret URL/path/password'));
  const result=transport.snapshot();assert.equal(result.requests.length,2);assert.equal(result.dropped,1);
  assert.equal(responses[2].eventNames().length,0);assert.equal(result.requests[0].errorClass,'TypeError');
  assert.doesNotMatch(JSON.stringify(result),/secret|Bearer|password|URL/);
  responses[1].emit('error',{});assert.equal(transport.snapshot().requests[1].errorClass,'Error');
  responses[1].emit('error',{name:'secret/address'});assert.equal(transport.snapshot().requests[1].errorClass,'Error');
  for(const limit of [0,-1,4097,Infinity,1.5])assert.throws(()=>fixtureTransport({limit}));
  for(const index of [-1,Infinity,1.5])assert.throws(()=>transport.observe(new EventEmitter(),index));
});

test('real fixture transport reports a complete split image and an actual client-aborted response separately',{timeout:10000},async()=>{
  let release,arrived;const held=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>arrived=resolve);
  const fixture=await rhvideoFixture({beforeMedia:async({path})=>{
    if(path==='/storage/pictures/hold.svg'){arrived();await held;return {body:Buffer.from('held')};}
    return {body:Buffer.from('first-last'),contentType:'application/octet-stream',splitAt:5};
  }});
  let heldResponse;
  fixture.server.prependListener('request',(request,response)=>{if(request.url==='/storage/pictures/hold.svg')heldResponse=response;});
  try{
    const headers={Authorization:'Bearer fixture-bearer-do-not-persist'};
    const response=await fetch(fixture.url+'/storage/pictures/0.svg',{headers});assert.equal(await response.text(),'first-last');
    const complete=fixture.transport.snapshot().requests[0];assert.equal(complete.statusCode,200);assert.equal(complete.writableFinished,true);assert(complete.finishedMs>=complete.startedMs);
    const request=http.get(fixture.url+'/storage/pictures/hold.svg',{headers});request.on('error',()=>{});await waiting;
    // The server response is already observed; wait for its real close event,
    // not an arbitrary sleep or a manually emitted synthetic cancellation.
    assert(heldResponse);const closed=once(heldResponse,'close');request.destroy();await closed;
    const aborted=fixture.transport.snapshot().requests[1];
    assert.equal(aborted.finishedMs,null);assert.equal(aborted.writableFinished,false);assert(aborted.closedMs>=aborted.startedMs);
  }finally{release();await fixture.close();}
});
