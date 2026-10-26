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
