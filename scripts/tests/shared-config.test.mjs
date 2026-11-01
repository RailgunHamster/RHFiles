import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fc from 'fast-check';
const require=createRequire(import.meta.url),model=require('../../src/js/shared-config.js');
const id='11111111-1111-4111-8111-111111111111',profile={id,config:{type:'smb',name:'Test only',host:'sync.invalid',share:'Public',username:'test'}};
const doc=(names=[],label)=>({schemaVersion:1,profiles:[profile],favorites:names.map(name=>({name,path:`remote://${id}/${name}`,isDir:true,...(label?{label}: {})}))});
test('RHVideo address and username merge together, upgrade only when present and require conflict choices',()=>{
  const old=model.empty(),one={...model.empty(),schemaVersion:2,rhvideo:{server:'https://one.invalid/',username:'one'}},two={...model.empty(),schemaVersion:2,rhvideo:{server:'https://two.invalid/',username:'two'}};
  assert.deepEqual(model.merge(old,old,one).document,one);assert.deepEqual(model.merge(old,one,old).document,one);
  const conflict=model.merge(old,one,two);assert.equal(conflict.conflicts[0].kind,'rhvideo');assert.deepEqual(model.merge(old,one,two,'remote').document,two);
  assert.deepEqual(model.merge(one,old,one).document,old);assert.deepEqual(model.merge(one,one,two).document,two);
  const favorite=doc(['A']);assert.equal(model.merge(old,favorite,one).document.favorites.length,1);assert.deepEqual(model.merge(old,favorite,one).document.rhvideo,one.rhvideo);
});
test('Android-compatible ordering preserves a one-sided reorder and labels',()=>{
  const base=doc(['Z','A','M']),local=doc(['M','Z','A']),remote=doc(['Z','A','M']);remote.favorites[1].label='中文别名';
  const result=model.merge(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.document.favorites.map(f=>f.name),['M','Z','A']);assert.equal(result.document.favorites[2].label,'中文别名');
});
test('conflicting edits and incompatible order cycles require an explicit choice',()=>{
  const base=doc(['A','B','C']),local=doc(['B','A','C'],'Local'),remote=doc(['A','C','B'],'Remote');
  const result=model.merge(base,local,remote);assert(result.conflicts.some(c=>c.kind==='favorites'));assert(result.conflicts.some(c=>c.kind==='favoriteOrder'));
  assert.deepEqual(model.merge(base,local,remote,'remote').document.favorites,remote.favorites);
});
test('deletion versus modification never silently resurrects a removed server',()=>{
  const base=doc(['A']),local=model.empty(),remote=doc(['A'],'remote edit');const result=model.merge(base,local,remote);
  assert(result.conflicts.length);assert.equal(result.document.profiles.length,0);assert.equal(result.document.favorites.length,0);
  assert.equal(model.merge(base,local,remote,'remote').document.profiles.length,1);
});
test('old independently paired RHFiles profiles are stripped, never revived through WebDAV',()=>{
  const input=doc(['A']);input.profiles[0]={id,config:{type:'rhfiles',name:'retired'}};assert.deepEqual(model.withoutRhFiles(input),model.empty());
});
test('canonical comparisons ignore object field order but retain array order',()=>{
  assert(model.same({b:2,a:{z:1,x:null}},{a:{x:null,z:1},b:2}));assert(!model.same([1,2],[2,1]));assert(model.same(undefined,null));
});
test('unchanged remote accepts any local order without sorting by filename',()=>{
  fc.assert(fc.property(fc.uniqueArray(fc.integer({min:0,max:99}),{maxLength:35}),names=>{const original=names.map(String),base=doc(original),local=doc([...original].reverse());const result=model.merge(base,local,base);assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.document,local);}),{numRuns:100});
});
test('independent insertions converge with no dropped or duplicated favorites',()=>{
  const base=doc(['A']),local=doc(['A','L']),remote=doc(['A','R']);const a=model.merge(base,local,remote),b=model.merge(base,remote,local);
  assert.deepEqual(a.conflicts,[]);assert(model.same(a.document,b.document));assert.deepEqual(a.document.favorites.map(f=>f.name),['A','L','R']);
});
