import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {visibleCoverReadiness} from '../testing/rhvideo-visible-covers.mjs';

function fixture({hidden=false,expire=false}={}) {
  const nodes=[],calls={decode:0,deadline:0,clears:0};
  const context=vm.createContext({document:{visibilityState:hidden?'hidden':'visible',querySelectorAll(selector){assert.equal(selector,'.covers');return nodes;}},innerWidth:800,innerHeight:600,
    setTimeout(callback,ms){calls.deadline=ms;if(expire)queueMicrotask(callback);return 1;},clearTimeout(){calls.clears++;}});
  const add=(rect={},imagePatch={})=>{
    const image={hidden:false,complete:true,naturalWidth:160,naturalHeight:90,async decode(){calls.decode++;},...imagePatch};
    const cover={isConnected:true,querySelector:()=>image,getBoundingClientRect:()=>({width:160,height:90,left:0,top:0,right:160,bottom:90,...rect})};
    nodes.push(cover);return {cover,image};
  };
  return {nodes,calls,add,context,run:()=>vm.runInContext('('+visibleCoverReadiness.toString()+')(".covers")',context)};
}

test('both partially intersecting and wholly visible covers must decode; offscreen or collapsed containers do not add work',async()=>{
  const f=fixture();f.add();f.add({left:790,right:950});f.add({top:-80,bottom:10});f.add({left:900,right:1060});f.add({height:0});
  const value=await f.run();assert.equal(value.visibleCovers,3);assert.equal(value.decodedVisibleCovers,3);assert.equal(f.calls.decode,3);assert.equal(f.calls.deadline,10000);assert.equal(f.calls.clears,1);
});

test('missing/hidden/undecoded image cannot disappear from the expected visible workload',async()=>{
  for(const bad of ['missing','hidden','zero','incomplete','reject']){
    const f=fixture();f.add();const {cover,image}=f.add();
    if(bad==='missing')cover.querySelector=()=>null;
    if(bad==='hidden')image.hidden=true;
    if(bad==='zero')image.naturalWidth=0;
    if(bad==='incomplete')image.complete=false;
    if(bad==='reject')image.decode=()=>Promise.reject(Error('owned decode failure'));
    await assert.rejects(f.run());
  }
});

test('zero-sized, empty, background and detached workloads cannot pass cover admission',async()=>{
  for(const variant of ['empty','zero','hidden','detached']){
    const f=fixture({hidden:variant==='hidden'});
    if(variant!=='empty'){const {cover}=f.add(variant==='zero'?{width:0}:{});if(variant==='detached')cover.isConnected=false;}
    await assert.rejects(f.run());
  }
});

test('a stalled decode has a fixed deadline and always releases its timer',async()=>{
  const f=fixture({expire:true});f.add({}, {decode:()=>new Promise(()=>{})});
  await assert.rejects(f.run(),/10000 ms/);assert.equal(f.calls.deadline,10000);assert.equal(f.calls.clears,1);
});
