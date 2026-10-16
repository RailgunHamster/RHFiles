const{test}=require('node:test'),assert=require('node:assert/strict'),data=require('../js/settings-data.js');
const memory=initial=>{const values=new Map(Object.entries(initial||{}));return{getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
test('all configurable web keys round-trip; unrelated data and pending tasks are not exported',()=>{
 const store=memory({'rhfiles.theme':'dark','rhfiles.view':'grid','rhfiles.sort':'size','rhfiles.hidden':'1','rhfiles.panes':'rows','rhfiles.nearby.alias':'手机','rhfiles.favorites':'[{"name":"中文","path":"remote://server/a"}]','rhfiles.panes.clipboard':'pending','other-app-key':'secret'});
 const exported=data.snapshot(store);assert.equal(Object.keys(exported).length,7);data.apply(store,exported);assert.equal(store.getItem('other-app-key'),'secret');assert.equal(store.getItem('rhfiles.panes.clipboard'),null);assert.deepEqual(data.snapshot(store),exported);
});
test('invalid/unknown fields are rejected before any existing setting is changed',()=>{
 const store=memory({'rhfiles.theme':'light'});for(const invalid of [null,[],{'other':'value'},{'rhfiles.theme':'bad'},{'rhfiles.favorites':'null'},{'rhfiles.nearby.alias':'x'.repeat(81)}]){assert.throws(()=>data.apply(store,invalid));assert.equal(store.getItem('rhfiles.theme'),'light');}
});
test('missing fields reset to app defaults and session paths are not replayed',()=>{
 const store=memory({'rhfiles.theme':'dark','rhfiles.navigation':'old','rhfiles.navigation.second':'old','rhfiles.panes.active':'1'});data.apply(store,{});for(const key of ['rhfiles.theme','rhfiles.navigation','rhfiles.navigation.second','rhfiles.panes.active'])assert.equal(store.getItem(key),null);
});
test('storage failure restores the previous preferences',()=>{
 const store=memory({'rhfiles.theme':'light','rhfiles.view':'list'}),set=store.setItem;let once=true;store.setItem=(key,value)=>{if(key==='rhfiles.view'&&once){once=false;throw Error('quota')}set(key,value)};
 assert.throws(()=>data.apply(store,{'rhfiles.theme':'dark','rhfiles.view':'grid'}));assert.deepEqual(data.snapshot(store),{'rhfiles.theme':'light','rhfiles.view':'list'});
});
