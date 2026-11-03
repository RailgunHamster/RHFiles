import test from 'node:test';import assert from 'node:assert/strict';
import {isLoadedMainTarget} from '../testing/app-startup-target.mjs';
test('a WebView target advertising the final URL without the shipped document title is not application startup',()=>{
 for(const title of ['', 'about:blank','localhost','RHVideo'])assert.equal(isLoadedMainTarget({type:'page',title,url:'http://tauri.localhost/'}),false);
});
test('only the loaded owned main document is admitted, not external or sibling pages',()=>{
 for(const url of ['http://tauri.localhost/','https://tauri.localhost/index.html','tauri://localhost/index.html'])assert.equal(isLoadedMainTarget({type:'page',title:'RHFiles',url}),true);
 for(const url of ['about:blank','http://external.invalid/','http://tauri.localhost/rhvideo.html','http://user:pass@localhost/'])assert.equal(isLoadedMainTarget({type:'page',title:'RHFiles',url}),false);
 assert.equal(isLoadedMainTarget({type:'worker',title:'RHFiles',url:'http://tauri.localhost/'}),false);
 assert.equal(isLoadedMainTarget({type:'page',title:'RHFiles',url:'not a URL'}),false);
});
