import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../testing/rhvideo-compare.mjs',import.meta.url),'utf8'),node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='verifyComparisonWorkload');assert(node);
const verify=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{assert});
const reports=()=>['RHVideo','RHFiles'].map(client=>({client,count:50000,counts:[12500,4167],rendered:{width:1280,height:800,visible:'visible',decodedImages:28}}));
test('comparison permits the same real viewport/search workload with decoded covers',()=>{assert.doesNotThrow(()=>verify(reports()));});
for(const client of [0,1])test('comparison rejects missing/failed covers in '+['reference','native client'][client],()=>{const rows=reports();rows[client].rendered.decodedImages=0;assert.throws(()=>verify(rows),/actual authenticated covers/);});
test('comparison rejects hidden, mismatched viewport/catalog/search or reversed clients',()=>{
  for(const patch of [{width:640},{height:700},{visible:'hidden'},{decodedImages:NaN}]){const rows=reports();Object.assign(rows[0].rendered,patch);assert.throws(()=>verify(rows));}
  for(const patch of [{count:49999},{counts:[12500,4000]},{client:'RHFiles'}]){const rows=reports();Object.assign(rows[0],patch);assert.throws(()=>verify(rows));}
});
test('real fixture authorization precedes reference navigation and results never overwrite another run',()=>{
  assert(source.indexOf("Network.setExtraHTTPHeaders")<source.indexOf('Page.navigate'));
  assert.match(source,/fixture-bearer-do-not-persist/);assert.match(source,/authenticated cover actually decoded/);assert.match(source,/fs\.mkdtempSync\(path\.resolve\('test-artifacts\/rhvideo-reference-comparison-'/);
  assert.doesNotMatch(source,/writeFileSync\(\s*["']test-artifacts\/rhvideo-reference-comparison\.json/);
});

test('comparison validates the packaged search index and matching engine, not only the UI that calls them',()=>{
  for(const file of ['rhvideo-index.js','rhvideo-search.js','rhvideo-tags.js'])assert(source.includes('"'+file+'"'),'Reject stale packaged '+file+' before timing');
  assert(source.indexOf('benchmark must use the current')<source.indexOf('const before = Date.now()'));
});
