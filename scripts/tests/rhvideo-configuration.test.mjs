import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),C=require('../../src/js/rhvideo-configuration.js'),I=require('../../src/js/rhvideo-index.js');
const config={volume:35,autoRotate:true,mixPictures:false,rule:{mode:'and',include:['中文'],exclude:[]},lanes:2,scrollSpeed:400,stay:7,min:1,max:2.5,ratio:.3,overlap:false,readerFont:19,readerLine:1.9,readerTheme:'sepia',favoriteStay:12,videoStay:45,favoriteFadeMs:1300};
test('configuration uses the actual reference string keys, without merging independent slideshow timing settings',()=>{
 const values=C.referencePreferences(config,{grid_tag_prefs:'{"recent":["音乐"]}',password:'never',token:'never'});
 assert.equal(values.page_volume,'0.35');assert.equal(values.strip_layout,'double');assert.equal(values.kenburns_duration,'7');assert.equal(values.favshow_image,'12');assert.equal(values.favshow_video,'45');assert.equal(values.favshow_fade,'1300');assert.equal(values.grid_tag_prefs,'{"recent":["音乐"]}');assert.equal(values.password,undefined);assert.equal(values.token,undefined);
 assert.equal(values.strip_speed,'2');assert.equal(values.kenburns_fade_ratio,'30');
 const restored=C.restoredPreferences(values);assert.deepEqual(restored.ignored,[]);assert.deepEqual(restored.patch,config);
});
test('malformed or unsafe preferences do not overwrite valid current controls',()=>{
 const {patch,ignored}=C.restoredPreferences({page_volume:'NaN',favshow_fade:'0.3',media_tag_filter:'{"__proto__":{"polluted":true}}',novel_settings:'{"fs":19,"lh":1.9,"theme":"oops"}',rotate:'false',favshow_image:'60'});
 assert.deepEqual(patch,{autoRotate:false,favoriteStay:60});assert.deepEqual(ignored.sort(),['page_volume','favshow_fade','media_tag_filter','novel_settings'].sort());assert.equal({}.polluted,undefined);
});
test('favorite slideshow retains independent image/video dwell and millisecond fade instead of Ken Burns settings',()=>{
 const c=I.slideshowSettings(config,'favorite');assert.equal(c.stay,12);assert.equal(c.videoStay,45);assert.equal(c.fade,1.3);assert.equal(c.kenBurns,false);assert.equal(c.overlap,true);
 const pictures=I.slideshowSettings(config,'picture');assert.equal(pictures.stay,7);assert.equal(pictures.fade,0);assert.equal(pictures.overlap,false);
 assert.equal(I.slideshowSettings({...config,favoriteStay:60},'favorite').stay,60,'Favorite dwell is not truncated to Ken Burns\' 30-second limit');
});
test('mixed slideshow progress seeks total dwell time, including boundaries, not equally-sized item indices',()=>{
 const plan=I.slideshowPlan([{kind:'picture'},{kind:'video'},{kind:'picture'}],config,'favorite');assert.deepEqual(plan.prefix,[0,12,57,69]);
 assert.deepEqual(I.slideshowTarget(plan,0),{index:0,elapsed:0});assert.deepEqual(I.slideshowTarget(plan,12/69),{index:1,elapsed:0});assert.deepEqual(I.slideshowTarget(plan,.5),{index:1,elapsed:22.5});assert.deepEqual(I.slideshowTarget(plan,1),{index:2,elapsed:0},'End starts the final item, not an immediate wrap');
});
test('a native Android file picker keeps the operation busy until its actual result and ignores old-account events',async()=>{
 const previous=globalThis.window,handlers=new Map(),commands=new Map(),state={generation:1};
 globalThis.window={RHVideoNative:{listen:async(name,callback)=>{handlers.set(name,callback);return()=>{};}}};
 try{
  const controller=C.install({mobile:true,state,action:(name,_schema,handler)=>commands.set(name,handler),object:()=>({}),config:()=>config,rawPreferences:()=>({}),native:async()=>({requested:true}),notice(){}});
  const snapshot=()=>commands.get('configuration.state')();await commands.get('configuration.export')({});assert.equal(snapshot().busy,true,'Requested does not mean the file has already been saved');
  await assert.rejects(()=>commands.get('configuration.preview')({}),/正在进行/);
  handlers.get('rhvideo-configuration-export')({payload:{generation:1,result:{saved:true}}});assert.equal(snapshot().busy,false);assert.match(snapshot().message,/已保存/);
  await commands.get('configuration.export')({});state.generation=2;controller.reset();handlers.get('rhvideo-configuration-export')({payload:{generation:1,result:{error:'old-account-error'}}});assert.equal(snapshot().busy,false);assert.equal(snapshot().message,'');
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('a confirmed merge with failed refresh remains an applied result, never a replayable failed write',async()=>{
 const commands=new Map();let writes=0;const preview={applied:false,favorites:{add:1}},state={generation:1};
 C.install({mobile:false,state,action:(name,_schema,handler)=>commands.set(name,handler),object:()=>({}),config:()=>config,rawPreferences:()=>({}),notice(){},applyPreferences:async()=>{},refresh:async()=>{throw Error('owned-refresh-failure');},native:async name=>{if(name==='configuration.preview')return {ticket:'confirmed-once',preview};assert.equal(name,'configuration.restore');writes++;return {applied:true,ui_preferences:{},clientWarning:'native-refresh-warning'};}});
 await commands.get('configuration.preview')({path:'owned-fixture.json'});const result=await commands.get('configuration.restore')({ticket:'confirmed-once'});assert.equal(result.applied,true);assert.match(result.clientWarning,/native-refresh-warning/);assert.match(result.clientWarning,/记录已合并，但列表刷新失败/);assert.equal(writes,1);await assert.rejects(()=>commands.get('configuration.restore')({ticket:'confirmed-once'}),/预览已改变/);assert.equal(writes,1);
});
