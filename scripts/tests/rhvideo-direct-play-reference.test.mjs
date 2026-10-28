import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
let play;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='play'&&node.params[0]?.name==='media')play=source.slice(node.start,node.end);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
walk(parse(source,{ecmaVersion:'latest'}));assert(play,'Inspect the shipped direct-play implementation');
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const video={id:'one',title:'one.mp4',kind:'video',duration:20},frame={id:'one-frame',kind:'frame',videoId:'one'};
async function port(cached){
  const calls=[],metadata=[],scope=vm.createContext({gallery:{loaded:cached,seed:1},state:{search:''},epoch:1,singlePlayIntent:0,imageSession:null,
    config:()=>({rule:null,sort:'dateDesc',resume:false}),I:{key:row=>'frame:'+row.id},crypto:{randomUUID:()=> 'test-parent'},
    loadGallery:async()=>{metadata.push('loadGallery');throw Error('An uncached screenshot pool must not delay direct playback');},
    send:async(action)=>{metadata.push(action);assert(cached,'Do not query an unprepared screenshot dataset');return {queue:[frame],total:1};},
    notice(){},prepareQueue:async(items,options)=>{calls.push({items,options});return 'test-ticket';},discardPrepared:async()=>{},
    native:async(action,args)=>{calls.push({action,args});return {opened:true};}});
  vm.runInContext('function galleryReady(){return gallery.loaded;}\n'+play,scope);await scope.play(video);
  return {metadata,calls,parent:scope.imageSession?{count:scope.imageSession.total,index:scope.imageSession.index,videoId:scope.imageSession.current.videoId}:null};
}
test('ordinary video click never starts a cold screenshot request, while a cached return position is retained',async()=>{
  const cold=await port(false);assert.deepEqual(cold.metadata,[],'Opening a video must not start a new all-library screenshot fetch');assert.equal(cold.parent,null);assert.equal(cold.calls.at(-1).args.id,'one');assert.equal(cold.calls[0].options.origin,undefined);
  const warm=await port(true);assert.deepEqual(warm.metadata,['query']);assert.deepEqual(warm.parent,{count:1,index:0,videoId:'one'});assert.equal(warm.calls[0].options.origin,'frame');assert.equal(warm.calls[0].options.parentTotal,1);assert.equal(warm.calls.at(-1).args.id,'one');
});
test('differential: original playVideoLocal only reuses the existing gridMedia snapshot',{skip:!fs.existsSync(reference)},async()=>{
  const html=fs.readFileSync(reference,'utf8');let original;
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'&&node.id.name==='playVideoLocal')original=match[1].slice(node.start,node.end);
  assert(original,'The reference behavior must not silently disappear');
  for(const cached of [false,true]){
    let opened,reads=0;const scope=vm.createContext({allVideos:[{...video,original_filename:video.title}],gridMedia:cached?[frame]:[],mediaStack:[],API_BASE:'/api/v1',
      openMediaViewer:(items,index)=>{opened={items,index};},pushMediaViewer:()=>assert.fail('No prior parent stack in this scenario'),saveMediaState(){},fetch:()=>{reads++;throw Error('Unexpected media preparation request');}});
    vm.runInContext(original,scope);assert.equal(scope.playVideoLocal('one'),undefined,'The original click does not await a metadata request');assert.equal(reads,0);assert.equal(opened.items[0].videoId,'one');
    const expected=scope.mediaStack.length?{count:scope.mediaStack[0].items.length,index:scope.mediaStack[0].index,videoId:scope.mediaStack[0].items[0].videoId}:null;
    assert.deepEqual((await port(cached)).parent,expected);
  }
});
