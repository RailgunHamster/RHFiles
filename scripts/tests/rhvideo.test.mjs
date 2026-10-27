import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const model=require('../../src/js/rhvideo-model.js');
test('RHVideo clock handles unknown, negative and hour-long media',()=>{
  assert.equal(model.clock(null),'0:00');assert.equal(model.clock(-1),'0:00');assert.equal(model.clock(65.7),'1:05');assert.equal(model.clock(3661),'1:01:01');
});
test('catalog paging never steps beyond the last page',()=>{
  assert.deepEqual(model.page(72,36,36),{number:2,pages:2,previous:true,next:false});
  assert.deepEqual(model.page(0,0,36),{number:1,pages:1,previous:false,next:false});
  for(const input of [[-1,0,36],[10,-1,36],[10,0,0],[10,0,73],[10.5,0,36]])assert.throws(()=>model.page(...input));
});
test('favorites retain media type even when two types share an ID',()=>{
  const set=model.favoriteSet({video_ids:['same'],picture_ids:['same'],novel_ids:['book']});
  assert.deepEqual([...set],['video:same','picture:same','novel:book']);assert.equal(model.itemKey({kind:'picture',id:'same'}),'picture:same');
});
test('image queue is isolated from videos and wraps like RHVideo navMedia',()=>{
  const items=[{id:'v',kind:'video',cover:'v'},{id:'a',kind:'picture',cover:'a'},{id:'b',kind:'picture',cover:'b'},{id:'c',kind:'picture',cover:null}];
  assert.equal(model.imageIndex(items,'a',-1).index,1);assert.equal(model.imageIndex(items,'b',1).index,0);
  assert.equal(model.imageIndex(items,'a',1).images.length,2);assert.throws(()=>model.imageIndex(items,'v'));assert.throws(()=>model.imageIndex(items,'c'));
});
test('unexpected catalog formats are not rendered as successful empty folders',()=>{
  for(const value of [null,{},[],{items:[],total:-1},{items:[{kind:'script',id:'a',title:'x'}],total:1},{items:[{kind:'video',id:1,title:'x'}],total:1}])assert.throws(()=>model.validateCatalog(value));
  assert.equal(model.validateCatalog({items:[],total:0}).total,0);
});
test('packaged client has no iframe, HTML video, remote page or browser credential store',()=>{
  const html=fs.readFileSync(new URL('../../src/rhvideo.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
  const player=fs.readFileSync(new URL('../../src/rhvideo-player.html',import.meta.url),'utf8');
  assert.doesNotMatch(html+player,/<(?:iframe|video)\b/i);
  assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage|fetch|eval)\s*(?:\.|\()/);
  assert.match(js,/rhvideo_request/);assert.match(html,/form-action 'none'/);
  assert.match(player,/media-src 'none'/);
});
test('library omits promotional copy and mobile playback stays native',()=>{
  const html=fs.readFileSync(new URL('../../src/rhvideo.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
  assert.doesNotMatch(html+js,/内容在服务器|体验在这里|让每一段内容|慢慢浏览，留住/);
  assert.match(js,/platform:mobile\?'android'/);
  assert.match(js,/action\('back'/);
  const activity=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoActivity.kt',import.meta.url),'utf8');
  assert.match(activity,/PlaybackActivity::class/);assert.match(activity,/main&&source===web/);
  assert.doesNotMatch(activity,/addJavascriptInterface|loadUrl\(.*server|allowFileAccess=true/);
  const main=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/MainActivity.kt',import.meta.url),'utf8');
  assert.match(main,/val uiCommands=setOf\([^\n]+"rhvideo.open"/);
  const create=main.slice(main.indexOf('override fun onCreate('),main.indexOf('override fun onDestroy('));
  assert(create.indexOf('WebView(applicationContext).destroy()')>=0&&create.indexOf('WebView(applicationContext).destroy()')<create.indexOf('super.onCreate('));
});
