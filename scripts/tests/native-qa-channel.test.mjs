import test from 'node:test';import assert from 'node:assert/strict';
import {nativeQaChannel} from '../testing/native-qa-channel.mjs';
const nonce='0123456789abcdef0123456789abcdef';
function fixture(){const writes=[],channel=nativeQaChannel({write:(text,callback)=>{writes.push(JSON.parse(text));callback();}},nonce);return {writes,...channel};}
test('owned native replies may be fragmented among logs and must match the request and nonce',async()=>{
 const qa=fixture();try{const result=qa.request('ping');qa.feed('irrelevant log\nRHFILES_NATIVE_QA '+JSON.stringify({nonce:'f'.repeat(32),id:'1',result:'unowned'})+'\n');qa.feed('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'old',result:'stale'})+'\n');const reply='RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:qa.writes[0].id,result:{protocol:1}})+'\r\n';qa.feed(reply.slice(0,21));qa.feed(reply.slice(21,40));qa.feed(reply.slice(40));assert.deepEqual(await result,{protocol:1});}finally{qa.close();}
});
test('native QA cannot submit playback, arbitrary windows/paths or concurrent captures',async()=>{
 const qa=fixture();try{for(const[action,args]of [['player.control',{command:'play'}],['main.frame',{hwnd:123}],['player.frame',{path:'outside.bmp'}],['player.frame',{expectedInput:0}],['player.frame',{expectedInput:'7'}]])await assert.rejects(qa.request(action,args),/read-only/);assert.equal(qa.writes.length,0);const first=qa.request('player.frame',{expectedInput:7});await assert.rejects(qa.request('ping'),/one readback/);qa.feed('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'1',error:'Input changed'})+'\n');await assert.rejects(first,/Input changed/);}finally{qa.close();}
});
test('native reply chunks preserve split UTF-8 titles',async()=>{
 const qa=fixture();try{const result=qa.request('player.state'),reply=Buffer.from('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'1',result:{title:'海边的蓝色时刻'}})+'\n');for(const byte of reply)qa.feed(Buffer.from([byte]));assert.deepEqual(await result,{title:'海边的蓝色时刻'});}finally{qa.close();}
});
test('an oversized log line is discarded without losing a later valid reply',async()=>{
 const qa=fixture();try{const result=qa.request('ping');qa.feed('x'.repeat(65537));qa.feed('tail\n');qa.feed('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'1',result:true})+'\n');assert.equal(await result,true);}finally{qa.close();}
});
test('a readback deadline closes the channel instead of queuing retries or accepting a late reply',async()=>{
 const qa=fixture();const result=qa.request('ping',{},10);await assert.rejects(result,/timed out/);qa.feed('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'1',result:'late'})+'\n');await assert.rejects(qa.request('ping'),/closed/);assert.equal(qa.writes.length,1);
});
test('closing an owned process rejects an outstanding native readback',async()=>{
 const qa=fixture();const result=qa.request('ping');qa.close();await assert.rejects(result,/closed/);await assert.rejects(qa.request('ping'),/closed/);assert.throws(()=>nativeQaChannel({},'short'),/nonce/);
});
test('startup trace reads bind to the expected input and cannot change trace or decoder settings',async()=>{
 const qa=fixture();try{
  for(const args of [{path:'outside.json'},{reset:true},{expectedInput:0},{expectedInput:1,verbose:2}])await assert.rejects(qa.request('player.trace',args),/read-only/);
  const reply=qa.request('player.trace',{expectedInput:9});assert.deepEqual(qa.writes[0].args,{expectedInput:9});
  qa.feed('RHFILES_NATIVE_QA '+JSON.stringify({nonce,id:'1',result:{inputId:9,clock:'producer-monotonic',events:[]}})+'\n');
  assert.equal((await reply).inputId,9);
 }finally{qa.close();}
});
