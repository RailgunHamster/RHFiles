// A behavioral oracle, not a list of API names: execute the upstream functions
// unmodified and compare their output with our native-player planning model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('acorn'),{grid:G}=require('../../src/js/rhvideo-model.js');
const source=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const plain=v=>JSON.parse(JSON.stringify(v));
function oracle(){
  const wanted=new Set(['getVideoAspectRatio','calcGridLayout','scoreGroup','buildGroups','startGridPlay','resolveVideoUrl','restoreGridPlayGroup','gridVideoCell','gridVideoState','gridCaptureVideoState','gridBindVideoControls']),functions=[];
  for(const match of fs.readFileSync(source,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
    const body=match[1];if(!body.trim())continue;
    for(const node of parse(body,{ecmaVersion:'latest',sourceType:'script'}).body)if(node.type==='FunctionDeclaration'&&wanted.has(node.id.name))functions.push(body.slice(node.start,node.end));
  }
  assert.equal(functions.length,wanted.size,'upstream grid changes require reviewing the behavioral oracle');
  const context=vm.createContext({API_BASE:'/api/v1',gridPlayGroups:[],gridPlayControlStates:{},gridPlayStateKeyCounter:0,localStorage:{getItem:()=>null},token:'fixture'});
  vm.runInContext(functions.join('\n'),context);return context;
}

test('grid planning uses only deduplicated gallery videos in gallery order',()=>{
  const frames=[{videoId:'c'},{pictureId:'p'},{videoId:'c'},{videoId:'a'},{videoId:'unknown'},{videoId:'b'}];
  const videos=['a','b','c','d'].map(id=>({id,original_filename:id+'.mp4',status:'ready',original_resolution:'360x640'}));
  assert.deepEqual(G.entries(frames,videos).map(v=>v.id),['c','a','b']);
  const plan=G.plan(G.entries(frames,videos));assert.deepEqual(plan.map(v=>v.id),['c','a','b']);
  assert.equal(plan.at(-1).gridEnd,true);assert(plan.every(v=>v.gridRect.length===4));
});

test('differential: real RHVideo group scoring, sizes and aspect-ratio layouts',{skip:!fs.existsSync(source)},()=>{
  const ctx=oracle(),ratios=[16/9,9/16,1,2.4,.4,1.1];
  // Vary both length and order; explicitly include mixed-aspect and tie cases.
  for(let count=1;count<=64;count++)for(let seed=0;seed<8;seed++){
    const entries=Array.from({length:count},(_,i)=>({id:String(i),aspectRatio:ratios[(i*i+seed*i+seed)%ratios.length]}));
    ctx.entries=entries;
    const expected=plain(vm.runInContext('buildGroups(entries)',ctx)),actual=G.groups(entries);
    assert.deepEqual(actual,expected,`groups count=${count}, pattern=${seed}`);
    if(count>1)assert(actual.every(g=>g.length>=2&&g.length<=4),'automatic grouping never strands one video');
    for(const group of actual){
      ctx.entries=group;
      assert(Math.abs(G.score(group.map(v=>v.aspectRatio))-vm.runInContext('scoreGroup(entries,0,entries.length)',ctx))<1e-12);
      const layout=plain(vm.runInContext('calcGridLayout(entries.map(v=>v.aspectRatio))',ctx)),rects=G.rects(group.map(v=>v.aspectRatio));
      const widths=layout.columns.split(' ').map(v=>v.endsWith('%')?parseFloat(v)/100:1/layout.columns.split(' ').length),height=1/layout.rows.split(' ').length;
      layout.cells.forEach((cell,i)=>{
        const column=typeof cell.c==='number'?cell.c:1,x=widths.slice(0,column-1).reduce((a,b)=>a+b,0),width=typeof cell.c==='number'?widths[column-1]:widths.reduce((a,b)=>a+b,0);
        const expected=[x,(cell.r-1)*height,width,height];
        expected.forEach((value,j)=>assert(Math.abs(rects[i][j]-value)<=.00101,`layout ${JSON.stringify(group)} cell ${i}, coordinate ${j}`));
      });
    }
  }
});

test('differential: start resets cell state, restores only an exact ordered group, and keeps all cells audible',{skip:!fs.existsSync(source)},async()=>{
  const ctx=oracle(),videos=Array.from({length:6},(_,i)=>({id:'v'+i,original_filename:'v'+i+'.mp4',folder_label:'sample',original_resolution:i%2?'1080x1920':'1920x1080'}));
  const frames=[{videoId:'v3'},{videoId:'v3'},{pictureId:'p'},{videoId:'v1'},{videoId:'v5'},{videoId:'missing'},{videoId:'v2'}];
  const entries=G.entries(frames,videos),groups=G.groups(entries),saved=groups.at(-1).map(v=>v.id);
  Object.assign(ctx,{allVideos:videos,gridMedia:frames,gridRefreshPending:false,gridPlayControlStates:{v3:{volume:0}},localStorage:{getItem:()=>JSON.stringify({groupIds:saved})},document:{getElementById:()=>({classList:{remove(){}},addEventListener(){}}),addEventListener(){}},gridKeyHandler(){},gridWheelHandler(){},gridTouchStart(){},gridTouchEnd(){},renderGridPlayGroup(){}});
  await vm.runInContext('startGridPlay()',ctx);
  assert.deepEqual(plain(ctx.gridPlayAllVideos).map(v=>[v.id,v.title,v.aspectRatio]),entries.map(v=>[v.id,v.title,v.aspectRatio]));
  assert.equal(ctx.gridPlayGroupIdx,groups.length-1);assert.deepEqual(plain(ctx.gridPlayControlStates),{},'fresh viewer must not persist old cell mute/time/pause');
  const video={closest:()=>({getAttribute:()=>entries[0].id}),muted:true,playbackRate:1.5,currentTime:6,paused:true};ctx.video=video;
  const state=plain(vm.runInContext('gridVideoState(video)',ctx));assert.deepEqual(state,{volume:1,muted:false,playbackRate:1,currentTime:0,paused:false,lastVolume:1});
  vm.runInContext('gridCaptureVideoState(video)',ctx);
  assert.deepEqual(plain(vm.runInContext('gridVideoState(video)',ctx)),{...state,muted:true,playbackRate:1.5,currentTime:6,paused:true});
  Object.assign(video,{duration:5,addEventListener(){},pause(){this.paused=true;}});
  Object.assign(ctx,{gridPlayRenderToken:3,gridApplyVideoVolume(){},gridUpdateVideoControls(){},gridRequestVideoPlay(){throw Error('a saved paused cell must not autoplay');}});
  vm.runInContext('gridBindVideoControls(video,3)',ctx);
  assert.equal(video.loop,true);assert.equal(video.autoplay,false);assert.equal(video.muted,true);assert.equal(video.playbackRate,1.5);assert.equal(video.currentTime,4.95);assert.equal(video.paused,true);
  ctx.localStorage={getItem:()=>JSON.stringify({groupIds:[...saved].reverse()})};
  assert.equal(vm.runInContext('restoreGridPlayGroup()',ctx),0,'same IDs in a different order are not the saved group');
});
