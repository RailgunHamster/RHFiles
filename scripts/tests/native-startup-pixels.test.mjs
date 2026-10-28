import test from 'node:test';
import assert from 'node:assert/strict';
import {markerPixels} from '../testing/native-startup-pixels.mjs';
function image(){
  const bytes=Buffer.alloc(54+200*120*4);bytes.write('BM');bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(200,18);bytes.writeInt32LE(-120,22);bytes.writeUInt16LE(32,28);
  return bytes;
}
const points=[[52,12],[148,12],[52,108],[148,108]],colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
function mark(bytes,index,rgb=colors[index]){const [x,y]=points[index];bytes.set([rgb[2],rgb[1],rgb[0],0],54+(y*200+x)*4);}
test('first-frame evidence requires all four source markers at the fitted canvas positions',()=>{
  const bytes=image();assert.equal(markerPixels(bytes,100,100).visible,false);
  for(let i=0;i<3;i++)mark(bytes,i);assert.equal(markerPixels(bytes,100,100).visible,false);
  mark(bytes,3);assert.deepEqual(markerPixels(bytes,100,100),{width:200,height:120,colors,visible:true});
  mark(bytes,3,[255,255,255]);assert.equal(markerPixels(bytes,100,100).visible,false);
});
test('invalid geometry, unsupported pixels and truncated native data are not treated as a visible frame',()=>{
  assert.throws(()=>markerPixels(Buffer.alloc(3),100,100));
  for(const corrupt of [b=>b.writeInt32LE(120,22),b=>b.writeInt32LE(0,18),b=>b.writeUInt16LE(24,28),b=>b.writeUInt32LE(1,30),b=>b.writeUInt32LE(55,10)]){const bytes=image();corrupt(bytes);assert.throws(()=>markerPixels(bytes,100,100));}
  assert.throws(()=>markerPixels(image().subarray(0,-1),100,100));assert.throws(()=>markerPixels(image(),0,100));
});
