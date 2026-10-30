import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {holdPresentationReplyScript,fourPresentationMarkers} from '../testing/rhvideo-presentation-input.mjs';

test('native reply shim calls the actual transport once with untouched arguments and holds only the claimed reply',async()=>{
 const context=vm.createContext({});context.window=context;vm.runInContext(holdPresentationReplyScript,context);
 const calls=[];let sequence=0;const original=(action,args)=>{calls.push({action,args});return Promise.resolve({inputId:++sequence});};
 context.RHVideoWorkbench={install:ctx=>ctx.native};const native=context.RHVideoWorkbench.install({native:original}),args={id:'synthetic'};context.__qaHoldPresentationReply=true;
 let settled=false;const held=native('presentation.open',args).then(value=>{settled=true;return value;});assert.equal((await native('presentation.open',args)).inputId,2);
 assert.equal(settled,false);assert.equal(calls.length,2);assert(calls.every(row=>row.args===args));assert.equal(context.__qaPresentationNative,original);assert.equal(context.__qaHeldPresentationInput,1);
 context.__qaReleasePresentationReply();assert.equal((await held).inputId,1);assert.equal(calls.length,2,'No operation replay or fake native result');
});
test('native marker validation cannot pass a black, transparent-looking or missing picture',()=>{
 assert(fourPresentationMarkers([[255,0,0],[0,255,0],[0,0,255],[255,255,0]]));
 for(const colors of [[],[[255,0,0]],Array(4).fill([0,0,0]),Array(4).fill([255,255,255]),[[255,0,0],[0,255,0],[0,0,255],[20,20,0]]])assert.equal(fourPresentationMarkers(colors),false);
});
