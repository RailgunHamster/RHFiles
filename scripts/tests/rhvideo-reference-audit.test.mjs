import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {mapping,registrations,referenceControls,audit,sourceHash} from '../testing/rhvideo-reference-audit.mjs';
test('every mapped RHVideo control points to implemented enumerable APIs, not documentation-only names',()=>{
  const apis=registrations(),seen=new Set();
  for(const group of mapping.groups){assert(group.api.length);assert(group.reference.length);for(const name of group.reference){assert(!seen.has(name),'Duplicate reference control '+name);seen.add(name);}for(const name of group.api)assert(apis.has(name),group.feature+': missing rhvideo.'+name);}
  assert.equal(seen.size,182);assert.equal(mapping.modules.length,9);
});

const reference=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
test('reference source hashes ignore Windows checkout line endings, not source edits',()=>{
 assert.equal(sourceHash(Buffer.from('const value = "中文";\r\nnext();\r\n')),sourceHash(Buffer.from('const value = "中文";\nnext();\n')));assert.notEqual(sourceHash('next();\n'),sourceHash('changed();\n'));assert.equal(mapping.sourceHash,'sha256-utf8-lf');
});
test('the current source inventory matches the pinned actual reference rather than passing against an outdated control list',{skip:!fs.existsSync(path.join(reference,'static/index.html'))},()=>{
 const result=audit(reference);assert.equal(result.actualCommit,result.referenceCommit,'Re-audit changed reference sources before accepting an old inventory');assert.equal(result.referenceControls,185);assert.deepEqual(result.missingControls,[]);assert.deepEqual(result.staleMappings,[]);assert.deepEqual(result.missingAPIs,[]);assert.deepEqual(result.modules.filter(m=>!m.matched),[],'A module edit must not silently reuse an old source inventory');
});
test('reference inventory includes template-generated controls and keyboard handlers, without treating event propagation as a business API',()=>{
  assert.deepEqual(referenceControls('<button onclick="openThing(\'${id}\');event.stopPropagation()"></button><input onkeydown="if(event.key===\'Enter\')jumpPage()">'),['if','jumpPage','openThing']);
});
