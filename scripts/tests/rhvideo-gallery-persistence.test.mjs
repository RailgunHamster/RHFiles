import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),tags=require('../../src/js/rhvideo-tags.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),functions=new Map(),actions=new Map();
const wanted=new Set(['galleryOrderScope','validGallerySeed','galleryOrders','restoreGalleryPreferences','rememberGalleryBrowser','resumeGallery','save']);
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&wanted.has(n.id?.name))functions.set(n.id.name,source.slice(n.start,n.end));if(n.type==='CallExpression'&&n.callee.name==='action'&&n.arguments[0]?.value?.startsWith('gallery.'))actions.set(n.arguments[0].value,source.slice(n.arguments[2].start,n.arguments[2].end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest'}));
const plain=v=>JSON.parse(JSON.stringify(v));
async function ready(check){for(let i=0;i<50;i++){if(check())return;await new Promise(setImmediate);}throw Error('Expected owned operation did not start');}
function fixture(preferences={}){
  const c=new I.Catalog({tags}),opened=[],writes=[],loads=[];
  c.setGallery([{video_id:'z',filename:'Z',screenshots:[{url:'/old.webp',time_seconds:1},{url:'/stable.webp',time_seconds:9}]},{video_id:'a',filename:'A',screenshots:[{url:'/a.webp',time_seconds:3}]}]);
  const scope=vm.createContext({prefs:preferences,preferences:{rule:{},mixPictures:false,perVideo:8},gallery:{seed:0,offset:0,limit:36,load:0,revision:0,items:[]},epoch:1,singlePlayIntent:0,imageSession:null,saveTimer:0,saveChain:Promise.resolve(),state:{connected:true,search:'',view:'gallery'},I,RHTagFilter:tags,crypto:{randomUUID:()=> 'preview'},structuredClone,setTimeout,clearTimeout,
    config:()=>scope.preferences,ensure:async()=>scope.epoch,$:()=>null,ctx:{openDialog:name=>opened.push(name)},notice:()=>{},send:async(action,args)=>{assert.equal(action,'query');assert.notEqual(args.allKeys,true);return c.query(args);},
    loadGallery:async(refresh,display)=>{loads.push({refresh,display});if(display===false)return {loaded:true};scope.gallery.load++;const page=await c.query({kind:'gallery',sort:'source',seed:scope.gallery.seed,search:scope.state.search,rule:scope.preferences.rule,offset:scope.gallery.offset,limit:scope.gallery.limit});scope.gallery.items=page.items;return {total:page.total,offset:scope.gallery.offset};},stepImage:async()=>{const v=await c.query({...scope.imageSession.args,offset:scope.imageSession.index,limit:1});scope.imageSession.current=v.items[0];return {index:scope.imageSession.index};},
    native:async(name,args)=>{assert.equal(name,'preferences');writes.push(args.value);return {saved:true};}});
  vm.runInContext([...functions.values()].join('\n'),scope);const handlers={};for(const [name,handler]of actions)if(['gallery.save','gallery.resume','gallery.deleteOrder'].includes(name))handlers[name]=vm.runInContext('('+handler+')',scope);
  return {scope,c,opened,writes,loads,run:(name,args={})=>handlers[name](args)};
}
test('saved gallery order scopes use tags/mixed pictures, not the number of shots per video',async()=>{
  const h=fixture();await h.run('gallery.save',{name:'  我的顺序  '});assert.deepEqual(Object.keys(h.scope.galleryOrders()),['我的顺序']);
  h.scope.preferences.perVideo=30;assert.deepEqual(Object.keys(h.scope.galleryOrders()),['我的顺序']);
  h.scope.preferences.mixPictures=true;assert.deepEqual(Object.keys(h.scope.galleryOrders()),[]);h.scope.gallery.seed='deadbeef';await h.run('gallery.save',{name:'我的顺序'});
  h.scope.preferences.mixPictures=false;assert.equal(h.scope.galleryOrders()['我的顺序'].seed,0);h.scope.preferences.rule={include:['其他']};assert.deepEqual(Object.keys(h.scope.galleryOrders()),[]);assert.equal(h.writes.length,2);
});
test('named order restoration resets the page, while browser progress remains independently remembered',async()=>{
  const h=fixture();h.scope.gallery.seed='01234567';h.scope.gallery.offset=72;await h.run('gallery.save',{name:'seed'});h.scope.gallery.seed=0;h.scope.gallery.offset=36;
  await h.run('gallery.resume',{name:'seed'});assert.equal(h.scope.gallery.seed,'01234567');assert.equal(h.scope.gallery.offset,0);assert.equal(h.opened.length,0);
  h.scope.rememberGalleryBrowser();h.scope.gallery.seed=0;h.scope.gallery.offset=108;h.scope.restoreGalleryPreferences();assert.equal(h.scope.gallery.seed,'01234567');assert.equal(h.scope.gallery.offset,0);
});
test('old numeric seeds and named orders migrate without being deleted or assigned over live request state',()=>{
  const h=fixture({galleryOrders:{old:{seed:12,offset:72,pending:'unsafe'}},galleryResume:{seed:12,offset:74,mediaKey:'frame:z-frame1'}});h.scope.restoreGalleryPreferences();
  assert.equal(h.scope.gallery.seed,12);assert.equal(h.scope.gallery.offset,72);assert.equal(h.scope.galleryOrders().old.seed,12);assert.equal(h.scope.prefs.galleryOrders,undefined);assert.equal(h.scope.gallery.pending,undefined);
});
test('resume browsing opens the exact stable URL after screenshot insertion, with video/index fallbacks',async()=>{
  for(const [position,expected]of [[{orderKey:'video:z|url:/stable.webp',videoId:'z',index:1},2],[{orderKey:'video:z|url:/gone.webp',videoId:'z',index:1},0],[{index:3},3],[{index:99},0]]){
    const h=fixture({galleryResume:position});h.c.setGallery([{video_id:'z',screenshots:[{url:'/inserted.webp',time_seconds:0},{url:'/old.webp',time_seconds:1},{url:'/stable.webp',time_seconds:9}]},{video_id:'a',screenshots:[{url:'/a.webp',time_seconds:3}]}]);
    const result=await h.run('gallery.resume');assert.equal(result.index,expected);assert.equal(h.scope.imageSession.index,expected);assert.equal(h.scope.imageSession.pendingTarget.id,h.scope.imageSession.current.id,'The initial target must come from the actual located catalog page');assert.deepEqual(h.opened,['image-dialog']);
  }
});
test('closing/changing account during a resume lookup cannot reopen a stale picture',async()=>{
  for(const invalidate of [h=>h.scope.epoch++,h=>h.scope.gallery.load++,h=>h.scope.gallery.revision++,h=>h.scope.gallery.seed='11223344',h=>h.scope.state.view='catalog']){
    const h=fixture({galleryResume:{orderKey:'video:z|url:/stable.webp'}});let release;h.scope.send=()=>new Promise(resolve=>release=resolve);const pending=h.run('gallery.resume');void pending.catch(()=>{});await ready(()=>release);invalidate(h);release({located:{index:1},total:3});assert.equal((await pending).stale,true);assert.equal(h.opened.length,0);
  }
});
test('named save waits for actual native persistence and propagates a write failure without retrying',async()=>{
  const h=fixture();let release,settled=false,count=0;h.scope.native=()=>{count++;return new Promise(resolve=>release=resolve);};const saving=h.run('gallery.save',{name:'durable'}).then(()=>settled=true);void saving.catch(()=>{});await ready(()=>release);assert.equal(settled,false);release({saved:true});await saving;assert.equal(settled,true);assert.equal(count,1);
  h.scope.native=async()=>{count++;throw Error('disk full');};await assert.rejects(h.run('gallery.save',{name:'failed'}),/disk full/);assert.equal(count,2);
  assert.equal(Object.hasOwn(h.scope.galleryOrders(),'failed'),false,'a failed save must not leave an apparently saved row in memory');
});
test('inherited/prototype names never resolve as saved records',async()=>{
  const h=fixture();await assert.rejects(h.run('gallery.resume',{name:'constructor'}),/没有保存/);await assert.rejects(h.run('gallery.save',{name:'   '}),/名称/);await h.run('gallery.save',{name:'__proto__'});assert.equal(h.scope.galleryOrders()['__proto__'].version,2);assert.equal(Object.getPrototypeOf(plain(h.scope.galleryOrders())),Object.prototype);
});
