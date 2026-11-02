import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),paths=require('../../src/js/device-paths.js'),group='a'.repeat(64),peer='b'.repeat(64);
test('device tab/favorite paths are address-independent and round-trip percent, Unicode and case',()=>{
  const uri=paths.make(group,peer,'/Files/中文 % #/A.txt');assert.equal(paths.parse(uri).path,'/Files/中文 % #/A.txt');
  assert.equal(paths.parse(uri).uri,uri);assert.equal(paths.parent(uri),paths.make(group,peer,'/Files/中文 % #'));
  assert.equal(paths.join(paths.parent(uri),'a.txt'),paths.make(group,peer,'/Files/中文 % #/a.txt'));
  assert.notEqual(paths.join(paths.parent(uri),'a.txt'),uri,'Remote case-sensitive names cannot collapse into Windows path keys');
  const root=paths.make(group,peer);assert.equal(paths.parent(root),root);assert(!uri.includes('192.168'));assert(!uri.includes('password'));
});
test('malformed device paths cannot normalize traversal, become URLs, or enter Windows shell APIs',()=>{
  for(const tail of ['/../secret','/%2e%2e/secret','/Files/a%2fb','/Files/a%5cb','//Files','/Files/CON.txt','/Files/file.','/Files/a?token=x','/Files/a#x','/Files/a%00','/Files/.rhfiles-service-key'])assert.throws(()=>paths.parse(paths.prefix+group+'/'+peer+tail),tail);
  for(const uri of ['rhfiles-device://user:password@'+group+'/'+peer,'rhfiles-device://'+group+':123/'+peer,'rhfiles-device://192.168.0.1/'+peer,'rhfiles-device://'+group+'/'+peer+'/Files/%'])assert.throws(()=>paths.parse(uri),uri);
  assert(paths.is('rhfiles-device:broken'),'Malformed scheme must still be intercepted, never treated as a local path');
});

const devices=[{group,groupName:'RH',peer,name:'WINSERVER'}];
test('short addresses resolve names locally to identity paths, preserving share/file case',()=>{
  for(const value of ['rh://winserver/Files/中文/a.txt','RH://WINSERVER\\Files\\中文\\a.txt']){
    assert.equal(paths.resolveAddress(value,devices).path,paths.make(group,peer,'/Files/中文/a.txt'));
  }
  assert.equal(paths.resolveAddress('rh://RH@winserver',devices).path,paths.make(group,peer));
  assert.equal(paths.addressFor(paths.make(group,peer,'/Files/中文 % #/A.txt'),devices),'rh://WINSERVER/Files/中文 %25 %23/A.txt');
  const alias=paths.address('电脑 @ A/外屏','/Files/100% #.txt','组@X');
  const known=[{...devices[0],name:'电脑 @ A/外屏',groupName:'组@X'}];
  assert.equal(paths.resolveAddress(alias,known).path,paths.make(group,peer,'/Files/100% #.txt'));
  assert.equal(paths.resolveAddress('rh://e\u0301', [{...devices[0],name:'É'}]).peer,peer);
});
test('short addresses reject unknown/ambiguous names; group-qualified addresses never guess',()=>{
  const another={group:'c'.repeat(64),groupName:'Other',peer:'d'.repeat(64),name:'winserver'},known=[...devices,another];
  assert.throws(()=>paths.resolveAddress('rh://WINSERVER/Files',known),e=>e.code==='ambiguous_device'&&e.candidates.length===2);
  assert.throws(()=>paths.resolveAddress('rh://not-joined',known),e=>e.code==='device_not_found');
  assert.throws(()=>paths.resolveAddress('rh://wrong@WINSERVER',known),e=>e.code==='device_not_found');
  assert.equal(paths.resolveAddress('rh://Other@WINSERVER/Files',known).peer,another.peer);
  assert.equal(paths.addressFor(paths.make(group,peer),known),'rh://RH@WINSERVER/');
  assert.equal(paths.addressFor(paths.make(group,peer),[...devices,{...another,groupName:'RH'}]),paths.make(group,peer));
  assert.equal(paths.addressFor(paths.make(group,peer),[]),paths.make(group,peer),'Removed devices have no usable name alias');
});
test('bad short addresses never normalize dot segments, accept query credentials, or fall back to SMB',()=>{
  for(const input of ['rh:/host','rh://','rh://@host','rh://one@two@host','rh://host:39128/?password=x','rh://host/Files/../secret','rh://host/Files/%2e%2e/secret','rh://host//Files','rh://host/Files/%2fsecret','rh://host/Files/%5csecret','rh://host/Files/%00','rh://host/Files/CON','rh://host/Files/file.','rh://host/Files/file#fragment','rh://host/Files/%','rh://%00/Files']){
    assert(paths.isAddress(input));assert.throws(()=>paths.resolveAddress(input,devices),/invalid_device_address/,input);
  }
  assert(!paths.isAddress('\\\\WINSERVER\\Files'));assert(!paths.isAddress('file:///C:/Files'));
});

test('strict copy formatting never exposes internal IDs when the alias is missing or ambiguous',()=>{
  const path=paths.make(group,peer,'/Files/中文 % #.txt');
  assert.equal(paths.addressFor(path,devices,{strict:true}),'rh://WINSERVER/Files/中文 %25 %23.txt');
  assert.throws(()=>paths.addressFor(path,[],{strict:true}),{code:'device_not_found'});
  const other={group:'c'.repeat(64),groupName:'Other',peer:'d'.repeat(64),name:'winserver'};
  assert.equal(paths.addressFor(path,[...devices,other],{strict:true}),'rh://RH@WINSERVER/Files/中文 %25 %23.txt');
  assert.throws(()=>paths.addressFor(path,[...devices,{...other,groupName:'rh'}],{strict:true}),{code:'ambiguous_device'});
  assert.equal(paths.addressFor(path,[]),path,'Explicit/internal callers retain the stable identity without guessing');
});
