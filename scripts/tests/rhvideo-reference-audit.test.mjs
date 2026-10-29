import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {mapping,registrations,referenceControls,audit,sourceHash,referenceScriptModules,unmappedReferenceModules} from '../testing/rhvideo-reference-audit.mjs';
test('every mapped RHVideo control points to implemented enumerable APIs, not documentation-only names',()=>{
  const apis=registrations(),seen=new Set();
  for(const group of mapping.groups){assert(group.api.length);assert(group.reference.length);for(const name of group.reference){assert(!seen.has(name),'Duplicate reference control '+name);seen.add(name);}for(const name of group.api)assert(apis.has(name),group.feature+': missing rhvideo.'+name);}
  assert.equal(seen.size,182);assert.equal(new Set(mapping.modules.map(module=>module.file)).size,mapping.modules.length);
  for(const module of mapping.modules)for(const name of module.api||[])assert(apis.has(name),module.file+': missing rhvideo.'+name);
});

test('external duplicate controls are audited even though their entry reuses switchTab',()=>{
  const module=mapping.modules.find(module=>module.file==='static/duplicates.js');assert(module?.api?.length>=15);
  for(const operation of ['scan','cancelScan','confirm','more','preview','play','review'])assert(module.api.includes('duplicates.'+operation));
  assert(registrations().has('duplicates.confirm'),'Inspect the real standalone controller registrations');
});

const reference=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
test('reference source hashes ignore Windows checkout line endings, not source edits',()=>{
 assert.equal(sourceHash(Buffer.from('const value = "中文";\r\nnext();\r\n')),sourceHash(Buffer.from('const value = "中文";\nnext();\n')));assert.notEqual(sourceHash('next();\n'),sourceHash('changed();\n'));assert.equal(mapping.sourceHash,'sha256-utf8-lf');
});
test('the current source inventory matches the pinned actual reference rather than passing against an outdated control list',{skip:!fs.existsSync(path.join(reference,'static/index.html'))},()=>{
 const result=audit(reference);assert.equal(result.actualCommit,result.referenceCommit,'Re-audit changed reference sources before accepting an old inventory');assert.equal(result.referenceControls,185);assert.deepEqual(result.missingControls,[]);assert.deepEqual(result.staleMappings,[]);assert.deepEqual(result.missingAPIs,[]);assert.deepEqual(result.unmappedModules,[],'Every external module must have an explicit inventory, not only inline index.html controls');assert.deepEqual(result.modules.filter(m=>!m.matched),[],'A module edit must not silently reuse an old source inventory');
});
test('reference inventory includes template-generated controls and keyboard handlers, without treating event propagation as a business API',()=>{
  assert.deepEqual(referenceControls('<button onclick="openThing(\'${id}\');event.stopPropagation()"></button><input onkeydown="if(event.key===\'Enter\')jumpPage()">'),['if','jumpPage','openThing']);
});
test('a new external feature is reported even when its inline handler is the existing switchTab',()=>{
  const html=`<button onclick="switchTab('duplicates')">Duplicates</button><script src='/static/duplicates.js?v=1'></script>`;
  assert.deepEqual(referenceControls(html),['switchTab']);
  assert.deepEqual(referenceScriptModules(html),['static/duplicates.js']);
  assert.deepEqual(unmappedReferenceModules(html,{sources:{'static/index.html':'hash'},script_order:[]},[{file:'static/index.html'}]),['static/duplicates.js']);
});
test('contract sources and script order independently detect unlisted modules and deduplicate known modules',()=>{
  const contract={sources:{'static/a.js':'hash','static/worker.js':'hash'},script_order:['static/a.js','static/new.js']};
  assert.deepEqual(unmappedReferenceModules('<script src="/static/new.js?x"></script>',contract,[{file:'static/a.js'}]),['static/new.js','static/worker.js']);
  assert.deepEqual(referenceScriptModules('<SCRIPT SRC="/static/a.js?v=2"></SCRIPT><script src="https://external.invalid/static/b.js"></script><script>const x="src=example"</script>'),['static/a.js']);
});
