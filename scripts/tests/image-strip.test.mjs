import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';import fc from 'fast-check';
const {create}=createRequire(import.meta.url)('../../src/js/image-strip.js');
test('auto scroll speed changes, pause cancels frames, and the last image stops the loop',()=>{
  const {autoScroll}=createRequire(import.meta.url)('../../src/js/image-strip.js'),pending=new Map();let sequence=0,pixels=0;
  const a=autoScroll({move:delta=>{pixels+=delta;return pixels<20;},request:fn=>{pending.set(++sequence,fn);return sequence;},cancel:id=>pending.delete(id)});
  const tick=now=>{const tasks=[...pending.values()];pending.clear();tasks.forEach(fn=>fn(now));};
  a.start();tick(0);tick(50);assert.equal(pixels,3);a.setSpeed(120);tick(100);assert.equal(pixels,9);a.pause();assert.equal(pending.size,0);tick(200);assert.equal(pixels,9);
  a.start();tick(300);tick(350);tick(400);assert.equal(a.state().running,false);assert.equal(pending.size,0);assert.throws(()=>a.setSpeed(0));
});
test('desktop and Android use identical continuous image geometry',()=>assert.deepEqual(fs.readFileSync('src/js/image-strip.js'),fs.readFileSync('android/web/js/image-strip.js')));
test('fitted portrait, landscape and panoramic image edges meet without letterbox gaps',()=>{
  const s=create(4);s.resize(1200,700);[[350,700],[1400,700],[100,900],[12000,1000]].forEach(([w,h],i)=>s.measure(i,w,h));
  for(const angle of [0,90,180,270]){s.resize(1200,700,angle);for(const p of [0,.3,1,1.6,2.8,3]){const frames=s.layout(p);for(let n=0;n<frames.length;n++){const f=frames[n];assert.ok(f.width<=1200&&f.height<=700);if(n)assert.ok(Math.abs(frames[n-1].left+frames[n-1].width-f.left)<1e-7);}}}
});
test('dragging follows pixels across differently sized pictures and round-trips',()=>{
  const s=create(6);s.resize(1000,700);[200,1200,80,900,600,350].forEach((w,i)=>s.measure(i,w,900));
  fc.assert(fc.property(fc.double({min:0,max:5,noNaN:true}),fc.integer({min:-1500,max:1500}),(p,delta)=>{
    const start=s.offset(p),end=Math.max(0,Math.min(s.offset(5),start+delta)),next=s.move(p,delta);assert.ok(Math.abs(s.offset(next)-end)<1e-6);assert.ok(Math.abs(s.offset(s.move(next,start-end))-start)<1e-6);
  }));
});
test('many narrow pictures cover the viewport while huge albums keep a bounded visible neighborhood',()=>{
  const s=create(50000);s.resize(412,700);for(let i=24950;i<25050;i++)s.measure(i,100,700);
  const frames=s.layout(25000.2);assert.ok(frames.length<=32&&frames.length>3);assert.ok(frames[0].left<0&&frames.at(-1).left+frames.at(-1).width>412);
});
