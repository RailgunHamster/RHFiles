const test=require('node:test'),assert=require('node:assert/strict'),media=require('../js/media-model.js'),list=require('../js/list-model.js');
const video=i=>({path:'/storage/'+i+'.mp4',name:i+'.mp4',kind:'video'});
test('playback follows visible order, includes the chosen file and excludes directories/other media',()=>{const selected=video(2),result=media.playback(selected,[video(3),{...video(1),isDir:true},{...video(4),kind:'audio'},selected,video(3)]);assert.deepEqual(result.queue.map(e=>e.name),['3.mp4','2.mp4']);assert.equal(result.path,selected.path);assert.equal(result.queueTruncated,false);assert.equal(media.playback(selected,[]).queue[0].path,selected.path)});
test('remote, local and SAF media use the same queue without passwords or copying',()=>{const item={path:'remote://opaque/Share/movie.mp4',name:'movie.mp4',kind:'video',password:'not-forwarded'};const result=media.playback(item,[item,video(1)]);assert.equal(result.queue[0].path,item.path);assert.ok(!JSON.stringify(result).includes('not-forwarded'));assert.equal(media.playback({...item,path:'content://provider/video'},[]).queue[0].path,'content://provider/video')});
test('a selected device file keeps its revision in the video intent without forwarding credentials',()=>{const item={path:'remote://qa/Files/a.mp4',name:'a.mp4',kind:'video',revision:'selected-original',password:'private-password',token:'private-token'};const result=media.playback(item,[item]);assert.equal(result.queue[0].revision,'selected-original');assert.ok(!JSON.stringify(result).includes('private-'));});
test('large playlists stay bounded and always keep the selection near either end',()=>{const all=Array.from({length:10000},(_,i)=>video(i));for(const i of [0,1,499,5000,9998,9999]){const result=media.playback(all[i],all);assert.ok(result.queue.length<=1000);assert.ok(result.queue.some(e=>e.path===all[i].path));assert.equal(result.queueTruncated,true)}});
test('long names/paths cannot exceed the intent budget or evict the selected entry',()=>{const all=Array.from({length:1000},(_,i)=>({...video(i),path:'/storage/'+('目录'.repeat(200))+i+'.mp4',name:'名字'.repeat(100)+i}));for(const i of [0,500,999]){const result=media.playback(all[i],all);assert.ok(Buffer.byteLength(JSON.stringify(result.queue))<=240*1024);assert.ok(result.queue.some(e=>e.path===all[i].path))}});
test('short deliberate drags turn pages on phones and wide tablets without crossing one fifth of the display',()=>{
  for(const width of [320,400,800,1280,2560]){
    assert.equal(media.swipe(-48,3,width,0),1);assert.equal(media.swipe(48,3,width,0),-1);
  }
  assert.equal(media.swipe(-32,2,400,0),1);assert.equal(media.swipe(-24,1,275,0),1);
});
test('gallery flicks follow their direction and tiny movement or vertical scrolling never changes pages',()=>{
  assert.equal(media.swipe(-18,2,1280,-.6),1);assert.equal(media.swipe(18,2,1280,.6),-1);
  assert.equal(media.swipe(-18,2,1280,.6),0);assert.equal(media.swipe(18,2,1280,-.6),0);
  assert.equal(media.swipe(-10,0,400,-2),0);assert.equal(media.swipe(-100,150,400,-2),0);
  assert.equal(media.swipe(-18,0,400,0),0);assert.equal(media.swipe(-40,0,1280,0),0);
});
test('a brief stationary event before release does not erase a real flick, while a held finger is no longer flicking',()=>{
  const samples=[[200,0],[176,30],[176,45]];
  assert.equal(media.swipe(-24,0,1280,media.swipeVelocity(samples,176,50)),1);
  assert.equal(media.swipe(-24,0,1280,media.swipeVelocity(samples,176,200)),0);
  assert.equal(media.swipe(-24,0,1280,media.swipeVelocity([[200,50]],176,50)),0);
});
test('clearing thumbnail credentials invalidates in-flight results, without deleting a newer request',async()=>{const resolve=[],applied=[],loader=list.thumbnailLoader(()=>new Promise(r=>resolve.push(r)),{limit:1});const entry={path:'remote://id/Share/a.jpg',size:1};loader.request(entry,v=>applied.push('old:'+v),()=>true);await new Promise(r=>setImmediate(r));loader.clear();loader.request(entry,v=>applied.push('new:'+v),()=>true);resolve[0]('old');await new Promise(r=>setImmediate(r));resolve[1]('new');await new Promise(r=>setImmediate(r));assert.deepEqual(applied,['new:new']);});
