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
