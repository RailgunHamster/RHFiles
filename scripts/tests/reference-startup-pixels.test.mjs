import test from 'node:test';
import assert from 'node:assert/strict';
import {referencePixels} from '../testing/reference-startup-pixels.mjs';
const source={width:100,height:100},box={rect:{x:10,y:5,width:80,height:50},viewport:{width:100,height:60},objectFit:'contain',objectPosition:'50% 50%'};
const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
function image(){const bytes=Buffer.alloc(54+200*120*4);bytes.write('BM');bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(200,18);bytes.writeInt32LE(-120,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(32,28);return bytes;}
function mark(bytes,points){points.forEach(([x,y],i)=>bytes.set([colors[i][2],colors[i][1],colors[i][0],0],54+(y*200+x)*4));}
test('reference evidence uses the actual video rectangle, letterbox and device scale, not the whole window',()=>{
 const bytes=image();assert.equal(referencePixels(bytes,box,source).visible,false);mark(bytes,[[60,20],[140,20],[60,100],[140,100]]);assert.deepEqual(referencePixels(bytes,box,source),{width:200,height:120,colors,visible:true});
 const wrong=image();mark(wrong,[[52,12],[148,12],[52,108],[148,108]]);assert.equal(referencePixels(wrong,box,source).visible,false);
});
test('unknown object fitting, out-of-viewport media and nonmatching native geometry cannot produce a false pass',()=>{
 for(const change of [{objectFit:'cover'},{objectPosition:'0% 0%'},{rect:{...box.rect,x:-1}},{rect:{...box.rect,width:Infinity}},{rect:{...box.rect,height:100}},{viewport:{width:100,height:80}}])assert.throws(()=>referencePixels(image(),{...box,...change},source));
 for(const invalid of [{width:0,height:100},{width:NaN,height:100},{width:100,height:Infinity}])assert.throws(()=>referencePixels(image(),box,invalid));
});
test('only a complete owned top-down 32-bit native bitmap is accepted',()=>{
 assert.throws(()=>referencePixels(Buffer.alloc(4),box,source));assert.throws(()=>referencePixels(image().subarray(0,-1),box,source));
 for(const corrupt of [b=>b.writeInt32LE(120,22),b=>b.writeInt32LE(0,18),b=>b.writeUInt16LE(24,28),b=>b.writeUInt16LE(2,26),b=>b.writeUInt32LE(1,30),b=>b.writeUInt32LE(55,10)]){const bytes=image();corrupt(bytes);assert.throws(()=>referencePixels(bytes,box,source));}
});
