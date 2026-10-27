import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('acorn'),{playback:P}=require('../../src/js/rhvideo-model.js');
const source=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const videos=[{id:'a',status:'ready',original_filename:'甲.mp4',duration_seconds:40,original_resolution:'1080x1920',folder_label:'旅行'}, {id:'b',status:'processing',original_filename:'乙.mp4',duration_seconds:7,original_resolution:'1080x1150'}, {id:'c',status:'failed',original_filename:'丙.mp4',duration_seconds:2}];
const frames=[{videoId:'a'},{videoId:'a'},{pictureId:'p'},{videoId:'b'},{videoId:'a'},{videoId:'c'}];
test('playback pools, source-sized segments and navigation have distinct reference semantics',()=>{
  assert.deepEqual(P.listIds(videos),['a','b']);
  assert.deepEqual(P.galleryIds(frames,3),['b','a','c']);
  assert.equal(P.portrait('1080x1150'),false);assert.equal(P.portrait('1080x1920'),true);
  const entries=P.entries(['a','b'],videos,{segment:3,random:()=>.5});
  assert.deepEqual(entries.map(e=>[e.id,e.segmentStart,e.segmentLength]),[['a',18.5,3],['b',2,3]]);
  assert.equal(P.step(0,-1,2),1);assert.equal(P.step(1,1,2),0);
  assert.deepEqual(P.seek(entries,.75),{index:1,offset:1.5,total:6});
  assert.deepEqual(P.seek(entries,1),{index:1,offset:0,total:6});
  assert.deepEqual(P.entries(['a','b'],videos,{fullLength:true}).map(e=>[e.segmentStart,e.segmentLength]),[[0,40],[0,7]]);
});
test('differential: execute RHVideo actual playback functions against the same input',{skip:!fs.existsSync(source)},()=>{
  const html=fs.readFileSync(source,'utf8'),wanted=new Set(['collectListOrderVideoIds','collectPlaylistVideoIds','buildPlaylistEntries','isPortraitResolution','playlistNav','playlistProgressCommit','playlistTotalDur','navMedia','popMediaViewer']),functions=[];
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
    const body=match[1];if(!body.trim())continue;
    const ast=parse(body,{ecmaVersion:'latest',sourceType:'script'});
    for(const node of ast.body)if(node.type==='FunctionDeclaration'&&wanted.has(node.id.name))functions.push(body.slice(node.start,node.end));
  }
  assert.equal(functions.length,wanted.size,'reference changes require reviewing the behavioral oracle');
  const context=vm.createContext({allVideos:videos,filteredVideos:videos,gridMedia:frames,token:'fixture',playlistSuper:false,localStorage:{getItem:()=>null},findBrowseIndex:()=>0,API_BASE:'/api/v1',Math:Object.assign(Object.create(Math),{random:()=>.5}),document:{getElementById:()=>({pause(){},removeEventListener(){}})},clearTimeout,playlistCheckEnd:null,playlistSeekTimer:null,playlistEntries:[{start:18.5,duration:3},{start:2,duration:3}],playlistCurrentIdx:0,playlistDoPlayEntry:index=>context.index=index,playlistDesiredOffset:null});
  vm.runInContext(functions.join('\n'),context);
  const plain=v=>JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(vm.runInContext('collectListOrderVideoIds()',context)),P.listIds(videos));
  assert.deepEqual(plain(vm.runInContext('collectPlaylistVideoIds()',context)),P.galleryIds(frames));
  const actual=plain(vm.runInContext("buildPlaylistEntries(['a','b'],3,false)",context));
  assert.deepEqual(actual.map(e=>[e.video_id,e.start,e.duration,e.title]),P.entries(['a','b'],videos,{segment:3,random:()=>.5}).map(e=>[e.id,e.segmentStart,e.segmentLength,e.title]));
  for(const ratio of [0,.25,.5,.75,1]){vm.runInContext(`playlistProgressCommit({value:${ratio*1000}})`,context);const expected=P.seek(P.entries(['a','b'],videos,{segment:3,random:()=>.5}),ratio);assert.equal(context.index,expected.index);assert.equal(context.playlistDesiredOffset,expected.offset);}
  vm.runInContext('playlistNav(-1)',context);assert.equal(context.index,1);
  Object.assign(context,{mediaItems:[{type:'video'}],mediaIndex:0,mediaStack:[{items:frames,index:0}],mediaIsGridSession:false,renderMediaItem(){},saveMediaState(){},saveBrowsePosition(){}});
  vm.runInContext('navMedia(-1)',context);assert.equal(context.mediaStack.length,0);assert.equal(context.mediaIndex,P.step(0,-1,frames.length));
  vm.runInContext('navMedia(1)',context);assert.equal(context.mediaIndex,0);
});
