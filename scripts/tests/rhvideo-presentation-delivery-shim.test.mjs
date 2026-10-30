import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {holdPresentationReplyScript,fourPresentationMarkers} from '../testing/rhvideo-presentation-input.mjs';
import {presentationOptions} from '../testing/rhvideo-presentation-input-android.mjs';
import {missingNativePlane} from '../testing/rhvideo-presentation-modal.mjs';
import {observeMediaRevealScript} from '../testing/rhvideo-media-reveal.mjs';

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

test('Android native presentation scenarios cannot turn optional flags into unknown operations or duplicate installation requests',()=>{
 assert.deepEqual(presentationOptions([]),{installedOnly:false,modal:false,reveal:false});
 assert.deepEqual(presentationOptions(['--installed','--modal']),{installedOnly:true,modal:true,reveal:false});
 assert.deepEqual(presentationOptions(['--modal','--installed']),{installedOnly:true,modal:true,reveal:false});
 assert.deepEqual(presentationOptions(['--installed','--reveal']),{installedOnly:true,modal:false,reveal:true});
 for(const flags of [['--modal','--modal'],['--installed','--installed'],['--retry'],['--phone'],['--reset'],['--modal','--reveal'],null])assert.throws(()=>presentationOptions(flags));
});

test('hidden-plane admission distinguishes zero visible native windows from ambiguous or broken observation',()=>{
 assert(missingNativePlane(Error('Owned frame: No visible owned player surface is present')));
 for(const message of ['Exactly one visible owned player surface is required','Multiple visible surfaces','Access denied','No current owned player input','',null])assert.equal(missingNativePlane(message),false);
});

test('catalog observation preserves the real call, argument identity, result and rejection without replay',async()=>{
 const context=vm.createContext({});context.window=context;vm.runInContext(observeMediaRevealScript,context);const calls=[],answer={items:[{id:'generated'}],total:1,offset:72};let failure=null;
 context.RHVideoWorkbench={install:()=>({catalog:async(...args)=>{calls.push(args);if(failure)throw failure;return answer;}})};
 const client=context.RHVideoWorkbench.install({native(){},state:{offset:0,loadId:7}}),args={kind:'picture',id:'generated'};context.__qaObserveCatalog=true;
 assert.equal(await client.catalog(false,args),answer);assert.equal(calls.length,1);assert.equal(calls[0][1],args);assert.equal(context.__qaCatalogReads[0].finalOffset,72);assert.equal(context.__qaCatalogReads[0].status,'fulfilled');
 failure=Error('owned failure');await assert.rejects(client.catalog(false,args),error=>error===failure);assert.equal(calls.length,2);assert.equal(context.__qaCatalogReads[1].status,'rejected');
});
