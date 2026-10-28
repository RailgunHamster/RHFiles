import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
import fc from 'fast-check';
const I=createRequire(import.meta.url)('../../src/js/rhvideo-index.js');
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html'),functions=new Map();
if(fs.existsSync(reference))for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration')functions.set(node.id.name,script[1].slice(node.start,node.end));
const picture=(id,resolution)=>({id,kind:'picture',original_resolution:resolution,resolution});
test('differential: horizontal long pictures keep every reference segment and its exact crop geometry',{skip:!functions.has('psBuildCells')},()=>{
 const items=[picture('wide','1600x900'),picture('long','100x1000'),picture('small','100x200')],context=vm.createContext({});vm.runInContext(functions.get('psParseSize')+'\n'+functions.get('psBuildCells'),context);
 const expected=context.psBuildCells(items,300),actual=I.stripLayout(items,{vertical:false,lanes:1,extent:300,gap:0}).lanes[0];
 assert.equal(actual.length,expected.length,'Do not replace the reference 3:4 crop count with arbitrary five-screen chunks');
 for(let i=0;i<expected.length;i++){assert.equal(actual[i].item.id,expected[i].p.id);assert(Math.abs(actual[i].start-expected[i].x)<1e-8);assert(Math.abs(actual[i].length-expected[i].w)<1e-8);assert.equal(actual[i].part,expected[i].seg);assert.equal(actual[i].cuts,expected[i].segCount);}
});
test('vertical strip is one full-width uncut document, not a two-column masonry layout',()=>{
 const items=[picture('long','100x1000'),picture('wide','1600x900')],actual=I.stripLayout(items,{vertical:true,lanes:2,extent:800,gap:0});
 assert.equal(actual.lanes.length,1);assert.equal(actual.items.length,2);assert.equal(actual.items[0].cuts,1);assert.equal(actual.items[0].cross,800);assert.equal(actual.items[0].length,8000);assert.equal(actual.items[1].start,8000);
});
test('double horizontal strip divides the ordered pool into contiguous halves, not whichever lane is shortest',()=>{
 const items=[picture('a','100x100'),picture('b','1000x100'),picture('c','100x100'),picture('d','100x100'),picture('e','100x100')],actual=I.stripLayout(items,{vertical:false,lanes:2,extent:600,gap:0});
 assert.deepEqual(actual.lanes.map(row=>row.map(tile=>tile.item.id)),[['a','b','c'],['d','e']]);
});
test('differential: vertical ends stop, horizontal rows wrap independently at their own leading-copy boundary',{skip:!functions.has('picStripAutoTick')},()=>{
 for(const vertical of [true,false])for(const speed of [100,400,2000]){
  const rows=[{id:'a',scrollLeft:989,scrollTop:490,scrollWidth:1400,clientWidth:200,scrollHeight:700,clientHeight:200},{id:'b',scrollLeft:1495,scrollWidth:1900,clientWidth:200}],context=vm.createContext({picStripAutoOn:true,picStripAutoLastTs:0,picStripVMode:vertical,picStripSpeed:speed/200,picStripLoopOffsets:{a:1000,b:1500},picStripVContent:()=>rows[0],picStripRows:()=>rows,psUpdateWindows(){},requestAnimationFrame:()=>1,setPicStripScroll:(row,x)=>row.scrollLeft=Math.min(row.scrollWidth-row.clientWidth,x),togglePicStripAuto(value){context.picStripAutoOn=value;}});
  vm.runInContext(functions.get('picStripAutoTick'),context);context.picStripAutoTick(100);
  const first=I.stripAdvance(vertical?490:989,speed*.1,{vertical,maximum:vertical?500:1200,loopOffset:vertical?0:1000});assert.equal(first.position,vertical?rows[0].scrollTop:rows[0].scrollLeft);assert.equal(first.running,context.picStripAutoOn);
  if(!vertical)assert.equal(I.stripAdvance(1495,speed*.1,{maximum:1700,loopOffset:1500}).position,rows[1].scrollLeft);
 }
 assert.deepEqual(I.stripAdvance(0,40,{maximum:0,vertical:true}),{position:0,running:false});
});
test('differential: wheel and arrow distances use the same multiplier as the reference handlers',{skip:!functions.has('picStripKeyHandler')},()=>{
 for(const speed of [100,400,2000]){
  const row={scrollLeft:50},context=vm.createContext({picStripAutoOn:false,picStripSpeed:speed/200,picStripVMode:false,window:{innerWidth:1200},document:{getElementById:()=>({classList:{contains:()=>false}})},picStripRowA:()=>row,psUpdateWindows(){}});vm.runInContext(functions.get('onPicStripWheel')+'\n'+functions.get('picStripKeyHandler'),context);
  context.onPicStripWheel({preventDefault(){},currentTarget:row,deltaY:30,deltaX:5});assert.equal(row.scrollLeft-50,I.stripInput(30,speed));let moved;row.scrollBy=args=>moved=args;context.picStripKeyHandler({key:'ArrowRight',preventDefault(){}});assert.equal(moved.left,I.stripInput(1200*.8,speed));assert.equal(moved.behavior,'smooth');
 }
});
test('loop layout repeats only the bounded complete leading pictures, with no duplicate in the logical selection pool',{skip:!functions.has('psTailCellCount')},()=>{
 const items=Array.from({length:20},(_,i)=>picture('p'+i,i===0?'100x1000':'100x100')),context=vm.createContext({PS_TAIL_CELL_MAX:4000});vm.runInContext(['psParseSize','psBuildCells','psTailCellCount'].map(name=>functions.get(name)).join('\n'),context);const source=context.psBuildCells(items,300),tail=context.psTailCellCount(source,1200),layout=I.stripLayout(items,{extent:300,viewport:1200}),row=layout.rows[0];
 assert.equal(row.cells.length,source.length);assert.equal(row.items.length,row.cells.length+tail);assert(row.items.slice(row.cells.length).every(tile=>tile.tail&&tile.start>=row.mainLength));assert.equal(new Set(row.items.map(tile=>tile.key)).size,row.items.length);assert.equal(new Set(row.cells.map(tile=>tile.item.id)).size,20);
});
test('property differential: reference segment order and coordinates hold across ordinary, threshold and extreme aspect ratios',{skip:!functions.has('psBuildCells')},()=>{
 const context=vm.createContext({});vm.runInContext(functions.get('psParseSize')+'\n'+functions.get('psBuildCells'),context);
 fc.assert(fc.property(fc.array(fc.tuple(fc.integer({min:1,max:2000}),fc.integer({min:1,max:2000})),{maxLength:12}),dimensions=>{
  const items=dimensions.map(([w,h],i)=>picture('p'+i,w+'x'+h)),expected=context.psBuildCells(items,300),actual=I.stripLayout(items,{extent:300}).rows[0].cells;assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++){assert.equal(actual[i].item.id,expected[i].p.id);assert.equal(actual[i].cuts,expected[i].segCount);assert(Math.abs(actual[i].length-expected[i].w)<1e-7);assert(Math.abs(actual[i].start-expected[i].x)<1e-7);}
 }),{numRuns:100,seed:20261029});
});
test('malformed or huge geometry fails before unbounded segmentation; empty pools stay finite',()=>{
 assert.throws(()=>I.stripLayout([picture('too-long','1x2000000')]),/分段过多/);assert.throws(()=>I.stripLayout([picture('overflow','1e308x1')]),/超出/);assert.throws(()=>I.stripAdvance(1e308,1e308,{maximum:1e308}),/超出/);assert.throws(()=>I.stripInput(Infinity,400),/无效/);assert.throws(()=>I.stripInput(1e308,2000),/超出/);assert.equal(I.stripLayout([]).length,0);assert.equal(I.stripInput(10,0),0);
});
