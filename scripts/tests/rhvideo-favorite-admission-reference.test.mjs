import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';

const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const functions=new Map();
if(fs.existsSync(reference))for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration')functions.set(node.id.name,script[1].slice(node.start,node.end));
test('reference favorite admission captures the media ID; later viewer navigation cannot revoke that accepted write',{skip:!functions.has('toggleFavorite')},async()=>{
  let complete;const response=new Promise(resolve=>complete=resolve),requests=[],favorites=new Set();
  const context=vm.createContext({favPending:new Map(),favSetFor:()=>favorites,setFavoriteButtons(){},notify(){},requestFavoritesRefresh(){},
    API_BASE:'/api/v1',token:'fixture-only',currentVideo:'one',fetch:(url,options)=>{requests.push({url,method:options.method});return response;},
  });
  vm.runInContext(functions.get('toggleFavorite'),context);
  const action=context.toggleFavorite('video','one');context.currentVideo='two';
  complete({ok:true});await action;
  assert.deepEqual(requests,[{url:'/api/v1/favorites/video/one',method:'PUT'}]);assert(favorites.has('one'));assert(!favorites.has('two'));
});

test('reference ordinary favorite browsing keeps pictures and videos together in the filtered queue',{skip:!functions.has('openFavBrowse')},()=>{
  const media=[{pictureId:'picture-first',url:'/first.webp'},{type:'video',videoId:'video-middle',url:'/video.mp4'},{pictureId:'picture-last',url:'/last.webp'}],opened=[];
  const context=vm.createContext({favMedia:media,openMediaViewer:(items,index)=>opened.push({items,index}),notify(){throw Error('The mixed queue is not empty');}});
  vm.runInContext(functions.get('openFavBrowse'),context);context.openFavBrowse(1);
  assert.equal(opened.length,1);assert.equal(opened[0].index,1);assert.equal(opened[0].items.length,3);assert.equal(opened[0].items[1].videoId,'video-middle');assert.equal(opened[0].items[0].pictureId,'picture-first');
});
test('reference favorite picture and video cards both open the mixed queue, while novels keep their reader flow',{skip:!functions.has('renderFavorites')},async()=>{
 const nodes=new Map(),items=[{id:'video-first',type:'video',mediaType:'video',title:'Video',url:'/video.mp4'},{id:'book',type:'novel',mediaType:'novel',title:'Book'},{id:'picture-last',type:'picture',mediaType:'picture',title:'Picture',url:'/picture.webp'}];
 const context=vm.createContext({favItems:items,favFilter:'all',favPage:1,favRenderFilter:'',mediaTagFilter:{},nextSearchRender:()=>1,searchRenderTickets:new Map([['favorites',1]]),normalizeFavItem:value=>value,RHTagFilter:{compile:()=>()=>true,key:()=>'',active:()=>false},favEsc:value=>String(value),starBtnHtml:()=>'',novelCoverHue:()=>100,document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',classList:{toggle(){}}});return nodes.get(id);}}});
 vm.runInContext(functions.get('renderFavorites'),context);await context.renderFavorites();const html=nodes.get('fav-grid').innerHTML;assert.match(html,/onclick="openFavBrowse\(0\)"/);assert.match(html,/onclick="openFavBrowse\(1\)"/);assert.match(html,/openNovelReaderById\('book'\)/);assert.deepEqual(Array.from(context.favMedia,row=>row.videoId||row.pictureId),['video-first','picture-last']);
});
