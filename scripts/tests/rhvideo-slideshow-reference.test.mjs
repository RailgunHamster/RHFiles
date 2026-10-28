import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{parse}from'acorn';import{createRequire}from'node:module';
const I=createRequire(import.meta.url)('../../src/js/rhvideo-index.js'),reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const C=createRequire(import.meta.url)('../../src/js/rhvideo-configuration.js');

test('differential: backup values preserve the reference percentage, speed multiplier and 60-second fade bound',{skip:!fs.existsSync(reference)},()=>{
 const wanted=new Set(['kenClampNum','updateKenburnsFadeCfg','updatePicStripSpeedUI','picStripAutoTick']),functions=[];
 for(const match of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest',sourceType:'script'}).body)if(node.type==='FunctionDeclaration'&&wanted.has(node.id.name))functions.push(match[1].slice(node.start,node.end));assert.equal(functions.length,wanted.size);
 for(const [scrollSpeed,ratio]of [[100,.05],[400,.3],[2000,.9]]){
  const config={volume:20,autoRotate:false,mixPictures:false,rule:{},lanes:1,scrollSpeed,stay:7,min:1,max:60,ratio,overlap:true,readerFont:19,readerLine:1.9,readerTheme:'sepia',favoriteStay:5,videoStay:15,favoriteFadeMs:800},values=C.referencePreferences(config),stored=new Map(),row={id:'qa',scrollLeft:0,scrollWidth:10000,clientWidth:100},nodes=new Map(Object.entries({'kenburns-fade-min':values.kenburns_fade_min,'kenburns-fade-max':values.kenburns_fade_max,'kenburns-fade-ratio':values.kenburns_fade_ratio,'pic-strip-speed':values.strip_speed}).map(([id,value])=>[id,{value}]));
  const context=vm.createContext({Math,parseFloat,kenOn:false,kenFadeMin:1,kenFadeMax:2.5,kenFadeRatio:30,picStripSpeed:2,picStripAutoOn:true,picStripAutoLastTs:0,picStripVMode:false,picStripLoopOffsets:{},document:{getElementById:id=>nodes.get(id)||{}},localStorage:{setItem:(key,value)=>stored.set(key,value)},kenburnsFminKey:()=> 'min',kenburnsFmaxKey:()=> 'max',kenburnsFratioKey:()=> 'ratio',picStripSpeedKey:()=> 'speed',picStripRows:()=>[row],setPicStripScroll:(target,x)=>target.scrollLeft=x,psUpdateWindows(){},requestAnimationFrame:()=>1,togglePicStripAuto(){throw Error('Unexpected end of fixture');}});
  assert.equal(values.kenburns_fade_ratio,String(ratio*100));assert.equal(values.strip_speed,String(scrollSpeed/200));
  vm.runInContext(functions.join('\n'),context);vm.runInContext('updateKenburnsFadeCfg();updatePicStripSpeedUI();picStripAutoTick(100)',context);
  assert.equal(Number(stored.get('ratio')),ratio*100,'Reference persists a percentage, not a 0..1 fraction');assert(Math.abs(row.scrollLeft-scrollSpeed*.1)<1e-9,'Reference speed is 200 px/s times the saved multiplier');
  const restored=C.restoredPreferences({kenburns_fade_ratio:String(ratio*100),strip_speed:String(scrollSpeed/200),kenburns_fade_max:'60'});assert.deepEqual(restored.ignored,[]);assert.equal(restored.patch.ratio,ratio);assert.equal(restored.patch.scrollSpeed,scrollSpeed);assert.equal(restored.patch.max,60);
 }
});
test('differential: mixed slideshow timing and progress agree with the real reference functions, including End',{skip:!fs.existsSync(reference)},()=>{
 const wanted=new Set(['favClampNum','favshowImgSecs','favshowVidSecs','favshowFadeMs','favshowTotalDur','favshowProgressCommit']),functions=[];
 for(const match of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest',sourceType:'script'}).body)if(node.type==='FunctionDeclaration'&&wanted.has(node.id.name))functions.push(match[1].slice(node.start,node.end));assert.equal(functions.length,wanted.size);
 for(const settings of [{favoriteStay:5,videoStay:15,favoriteFadeMs:800},{favoriteStay:60,videoStay:300,favoriteFadeMs:5000},{favoriteStay:12,videoStay:45,favoriteFadeMs:1300}]){
  const items=[{mediaType:'picture'},{mediaType:'video'},{mediaType:'picture'}],inputs={'favshow-img-secs':{value:String(settings.favoriteStay)},'favshow-vid-secs':{value:String(settings.videoStay)},'favshow-fade-ms':{value:String(settings.favoriteFadeMs)}};
  const context=vm.createContext({favshowItems:items,favshowIdx:0,favshowOn:false,favshowPausedElapsed:0,favshowPlayStartAt:0,document:{getElementById:id=>inputs[id]},performance:{now:()=>1000},favshowPlay(index){context.favshowIdx=index;},favshowUpdateProgress(){}});vm.runInContext(functions.join('\n'),context);
  const plan=I.slideshowPlan(items,settings,'favorite');assert.equal(plan.total*1000,vm.runInContext('favshowTotalDur()',context));assert.equal(I.slideshowSettings(settings,'favorite').fade*1000,vm.runInContext('favshowFadeMs()',context));
  for(const ratio of [0,.1,.25,.5,.8,1]){context.ratio=ratio;vm.runInContext('favshowProgressCommit({value:String(ratio*1000)})',context);const actual=I.slideshowTarget(plan,ratio);assert.equal(actual.index,context.favshowIdx);assert(Math.abs(actual.elapsed-context.favshowPausedElapsed/1000)<1e-9,JSON.stringify({settings,ratio,actual,referenceElapsed:context.favshowPausedElapsed/1000}));}
 }
});

test('reference: favorite slideshow snapshots all filtered pages, excludes books and starts at the first item on every opening',{skip:!fs.existsSync(reference)},async()=>{
 let source;
 for(const match of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest',sourceType:'script'}).body)if(node.type==='FunctionDeclaration'&&node.id.name==='openFavSlideshow')source=match[1].slice(node.start,node.end);
 assert(source,'Execute the actual current reference entry, not a copied model');
 const rows=Array.from({length:60},(_,i)=>({id:String(i),mediaType:i%3===0?'novel':i%3===1?'picture':'video'})),nodes=new Map(),starts=[];
 const context=vm.createContext({favNormItems:rows,favshowItems:[],favshowIdx:37,favshowLayers:[{style:{}},{style:{}}],favshowCurLayer:0,favshowOn:false,localStorage:{getItem:()=>null},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{remove(){}}});return nodes.get(id);},addEventListener(){}},favClampNum:(_v,_lo,_hi,fallback)=>fallback,favShowKey:key=>key,favshowKeyHandler(){},favshowProgressRafStart(){},favshowPlay:index=>starts.push(index),loadFavorites(){throw Error('Do not reload or truncate an already-loaded filtered catalog');},notify(){throw Error('Unexpected empty queue');}});
 vm.runInContext(source,context);await vm.runInContext('openFavSlideshow()',context);const expected=rows.filter(row=>row.mediaType!=='novel').map(row=>row.id);assert.deepEqual(Array.from(context.favshowItems,row=>row.id),expected);assert.equal(context.favshowItems.length,40);
 context.favNormItems=[];assert.deepEqual(Array.from(context.favshowItems,row=>row.id),expected,'Later collection edits do not mutate the running queue');
 context.favNormItems=rows;context.favshowIdx=39;await vm.runInContext('openFavSlideshow()',context);assert.deepEqual(starts,[0,0]);
});
