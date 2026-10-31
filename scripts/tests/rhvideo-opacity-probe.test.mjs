import test from 'node:test';import assert from 'node:assert/strict';import {opacityCases,visibleSourceInterval} from '../testing/rhvideo-opacity-probe.mjs';
const row=(startedMs,finishedMs,values={})=>({startedMs,finishedMs,alpha:255,markers:{visible:false},...values});
const picture={markers:{visible:true},identity:{frame:16,sourceMs:16*1000/24}};
test('visibility diagnostic has a fixed ABBA order, not selectable retries',()=>{assert.deepEqual(opacityCases,['control-read','early-reveal','early-reveal','control-read']);assert(Object.isFrozen(opacityCases));});
test('source pixels behind an alpha-zero surface are not a displayed first picture',()=>{assert.equal(visibleSourceInterval([row(10,20,{...picture,alpha:0}),row(30,40,{...picture,alpha:0})]),null);});
test('first visible evidence retains a conservative last-negative to completed-positive interval',()=>{
 assert.deepEqual(visibleSourceInterval([row(0,10,{absent:true}),row(20,30,{...picture,alpha:0}),row(40,50),row(60,70,{ambiguous:true,error:'alpha changed'}),row(80,100,picture)]),{lowerMs:40,upperMs:100,sourceFrame:16,sourceMs:16*1000/24});
});
test('an unidentified partial frame does not become a fabricated negative or positive',()=>{assert.deepEqual(visibleSourceInterval([row(10,20),row(30,40,{ambiguous:true,error:'partial barcode'}),row(50,60,picture)]),{lowerMs:10,upperMs:60,sourceFrame:16,sourceMs:16*1000/24});});
test('a first positive capture cannot invent an exact first-visible timestamp',()=>{assert.equal(visibleSourceInterval([row(40,100,picture)]).lowerMs,0);});
test('unknown observer failures and invalid timing fail rather than proving absence',()=>{
 assert.throws(()=>visibleSourceInterval([row(0,10,{error:'wrong process'})]),/Unclassified/);assert.throws(()=>visibleSourceInterval([row(10,5)]),/timing/);assert.throws(()=>visibleSourceInterval([row(0,10),row(5,20)]),/timing/);assert.throws(()=>visibleSourceInterval([row(0,10,{alpha:NaN})]),/alpha/);
});
