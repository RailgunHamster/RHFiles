const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const batch = vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/batch-rename.js'),'utf8') +
  '\nmobileBatchRename', {fmt:require('../js/format.js')});
function entry(dir,name,extra={}) { return {path:dir+'/'+name,name,parentPath:dir,...extra}; }
const list=[entry('/a','IMG.1.jpg'),entry('/a','img.2.jpg'),entry('/a','img-folder',{isDir:true}),entry('/a','already'),entry('/b','IMG.1.jpg',{revision:'v1'})];
const plan=batch.selection([list[0].path,list[1].path,list[2].path,list[4].path],list);
test('batch rename previews every selected file or directory and preserves paths and revisions',()=>{
  const plain=plan({find:'.',replace:'_'});
  assert.equal(plain.rows.length,4);assert.equal(plain.changes.length,3);
  assert.equal(plain.changes[0].name,'IMG_1_jpg');
  const regex=plan({find:'^img[.-](.*)',replace:'相册-$1',regex:true});
  assert.equal(regex.error,'');assert.equal(regex.changes.length,4);
  assert.deepEqual(Array.from(regex.changes,c=>c.name),['相册-1.jpg','相册-2.jpg','相册-folder','相册-1.jpg']);
  assert.equal(regex.changes[3].revision,'v1');
  assert.equal(plan({find:'img',replace:'x',caseSensitive:true}).changes.length,2);
});
test('invalid rules, duplicate and occupied targets are blocked before submission',()=>{
  for(const rules of [{find:'(',regex:true,replace:''},{find:'.*',regex:true,replace:''},{find:'IMG',replace:'../'},
    {find:'^.+$',regex:true,replace:'one'},{find:'^IMG.*$',regex:true,replace:'already'}]) assert.ok(plan(rules).error);
  assert.equal(plan({find:'absent',replace:'x'}).changes.length,0);
  assert.throws(()=>batch.selection(['missing'],list));assert.throws(()=>batch.selection([list[0].path,list[0].path],list));
});
