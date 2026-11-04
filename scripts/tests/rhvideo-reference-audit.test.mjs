import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {verify as verifySharedFrontend} from '../rhvideo-frontend.mjs';
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

test('separate task-controller registrations are audited for both mutation and readback',()=>{
  const actual=registrations();for(const id of ['server.state','task.priorityState','task.prioritize','remote.tasks.prioritize','task.select','task.centerState','task.refreshSelection','task.detailState','task.batchesVisibility'])assert(actual.has(id),id);
});

const reference=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
test('reference source hashes ignore Windows checkout line endings, not source edits',()=>{
 assert.equal(sourceHash(Buffer.from('const value = "中文";\r\nnext();\r\n')),sourceHash(Buffer.from('const value = "中文";\nnext();\n')));assert.notEqual(sourceHash('next();\n'),sourceHash('changed();\n'));assert.equal(mapping.sourceHash,'sha256-utf8-lf');
});
test('the canonical shared frontend replaces a separately pinned and manually mapped private UI inventory',()=>{
 const manifest=verifySharedFrontend();assert(Object.keys(manifest.files).length>=30);
 for(const module of ['static/app.js','static/platform.js','static/host-media.js','static/bindings.js'])assert(manifest.files[module],module);
 assert.equal(manifest.hostProtocol,1);assert.equal(manifest.format,'rhvideo-frontend');
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
