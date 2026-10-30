import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {checkMobileCatalogLayout,visibleCatalogCovers} from '../testing/rhvideo-mobile-catalog-layout.mjs';
const geometry=()=>({mobile:true,width:412,height:880,firstCard:{top:390},volumeDirection:'row',toolbars:Array.from({length:2},()=>({height:60,commands:[{action:'rhvideo.selection.mode',width:80,height:44}]}))});
const check=value=>checkMobileCatalogLayout({evaluate:async()=>value});
test('real-layout gate accepts reachable content and full-sized API-backed controls',async()=>{const value=geometry();assert.equal(await check(value),value);});
test('real-layout gate rejects the observed mostly-chrome phone screen',async()=>{const value=geometry();value.firstCard.top=700;await assert.rejects(check(value),/consume most/);});
test('real-layout gate cannot pass by shrinking targets, hiding APIs or wrapping many rows',async()=>{
  for(const change of [value=>value.toolbars[0].height=100,value=>value.toolbars[0].commands[0].height=34,value=>delete value.toolbars[0].commands[0].action,value=>value.volumeDirection='column',value=>value.toolbars.pop()]){const value=geometry();change(value);await assert.rejects(check(value));}
});
test('desktop layout is not mislabeled as Android portrait acceptance',async()=>{const value={mobile:false,width:1280,height:800};assert.equal(await check(value),value);});
const image=()=>({complete:true,naturalWidth:800,naturalHeight:500,classList:{contains:()=>true},getBoundingClientRect:()=>({width:190,height:160})});
const cover=(value,top=100)=>({getBoundingClientRect:()=>({top,bottom:top+160,left:10,right:200,width:190,height:160}),querySelector:()=>value});
const covers=nodes=>vm.runInNewContext('('+visibleCatalogCovers.toString()+')()',{innerWidth:412,innerHeight:867,getComputedStyle:node=>node.styleState||{display:'block',visibility:'visible',opacity:'1'},document:{querySelectorAll:()=>nodes}});
test('visible-cover gate measures the actual production probe and keeps source dimensions',()=>{assert.deepEqual(JSON.parse(JSON.stringify(covers([cover(image()),cover(image())]))),[{width:800,height:500},{width:800,height:500}]);});
test('a missing, failed or hidden IMG cannot leave the visible-container sample',()=>{for(const value of [null,{...image(),complete:false},{...image(),naturalWidth:0},{...image(),classList:{contains:()=>false}},{...image(),getBoundingClientRect:()=>({width:0,height:0})},{...image(),styleState:{display:'none',visibility:'visible',opacity:'1'}},{...image(),styleState:{display:'block',visibility:'hidden',opacity:'1'}},{...image(),styleState:{display:'block',visibility:'visible',opacity:'.5'}}])assert.equal(covers([cover(image()),cover(image()),cover(value)]),null);});
test('an offscreen missing cover is not confused with a visible missing cover',()=>assert.equal(covers([cover(image()),cover(image()),cover(null,1000)]).length,2));
test('fewer than two visible covers cannot satisfy this two-column fixture gate',()=>assert.equal(covers([cover(image()),cover(null,1000)]),null));
