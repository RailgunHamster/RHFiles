import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectVisibleCovers,visibleCoversSettled} from '../testing/rhvideo-visible-cover-settle.mjs';
const ready=()=>({documentVisible:true,covers:[{connected:true,hasSource:true,complete:true,width:800,height:500,loaded:true,hidden:false,opacity:1,display:'block',visibility:'visible',placeholder:false}]});
test('every visible cover must be genuinely loaded and opaque; missing, hidden or partial images never pass',()=>{
 assert(visibleCoversSettled(ready()));
 for(const patch of [{connected:false},{hasSource:false},{complete:false},{width:0},{height:0},{loaded:false},{hidden:true},{opacity:0},{opacity:.97},{opacity:NaN},{display:'none'},{visibility:'hidden'},{placeholder:true}]){const s=ready();s.covers.push({...s.covers[0],...patch});assert.equal(visibleCoversSettled(s),false,JSON.stringify(patch));}
 for(const sample of [{documentVisible:false,covers:ready().covers},{documentVisible:true,covers:[]},{documentVisible:true,covers:Array(101).fill(ready().covers[0])},null])assert.equal(!!visibleCoversSettled(sample),false);
});
test('the actual observer includes a partially visible cover but not text-only rows or offscreen images, and only reads state',()=>{
 const calls=[],image={isConnected:true,complete:true,naturalWidth:800,naturalHeight:500,hidden:false,getAttribute:name=>{calls.push(name);return 'generated';},classList:{contains:()=>true}},make=(id,rect)=>({dataset:{kind:'picture',id},querySelector:()=>({getBoundingClientRect:()=>rect,querySelector:s=>s==='img'?image:null})});
 const rows=[make('partial',{width:100,height:100,left:0,right:100,top:-90,bottom:10}),make('text-only',{width:100,height:100,left:0,right:100,top:-200,bottom:-100}),make('below',{width:100,height:100,left:0,right:100,top:800,bottom:900}),make('right',{width:100,height:100,left:400,right:500,top:0,bottom:100})];
 const sample=vm.runInNewContext('('+collectVisibleCovers.toString()+')()',{innerWidth:400,innerHeight:800,document:{visibilityState:'visible',querySelectorAll:()=>rows},getComputedStyle:()=>({opacity:'1',display:'block',visibility:'visible'})});
 assert.deepEqual(JSON.parse(JSON.stringify(sample.covers.map(c=>c.key))),['picture:partial']);assert.deepEqual(calls,['src']);assert(visibleCoversSettled(sample));
 assert.doesNotMatch(collectVisibleCovers.toString(),/\.decode\(|\.scroll|\.focus\(|\.src\s*=|requestAnimationFrame|setTimeout|\.click\(/);
});
