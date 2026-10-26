import test from 'node:test';
import assert from 'node:assert/strict';
import {isAppTargetURL} from '../rhfiles-api.mjs';
const library='https://appassets.androidplatform.net/rhvideo/rhvideo.html';
test('Android CLI recognizes only the packaged RHVideo library in its own process',()=>{
  assert.equal(isAppTargetURL(library,{android:'emulator-5584'}),true);
  for(const url of [library+'?url=elsewhere',library+'#other',library.replace('https:','http:'),library.replace('appassets.','evil.appassets.'),library.replace('/rhvideo/rhvideo.html','/other.html'),library.replace('https://','https://user:password@'),'not a URL'])assert.equal(isAppTargetURL(url,{android:'emulator-5584'}),false,url);
  assert.equal(isAppTargetURL(library),false);
  assert.equal(isAppTargetURL(library,{android:'emulator-5584',scope:'reader'}),false);
});
test('existing desktop and ebook CLI scopes are unchanged',()=>{
  assert.equal(isAppTargetURL('http://tauri.localhost/rhvideo.html'),true);
  assert.equal(isAppTargetURL('http://localhost/index.html'),true);
  assert.equal(isAppTargetURL('https://ebook.rhfiles.local/book',{scope:'reader'}),true);
  assert.equal(isAppTargetURL('http://tauri.localhost/index.html',{scope:'reader'}),false);
});
