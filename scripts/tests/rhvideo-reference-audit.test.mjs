import test from 'node:test';import assert from 'node:assert/strict';
import {mapping,registrations,referenceControls} from '../testing/rhvideo-reference-audit.mjs';
test('every mapped RHVideo control points to implemented enumerable APIs, not documentation-only names',()=>{
  const apis=registrations(),seen=new Set();
  for(const group of mapping.groups){assert(group.api.length);assert(group.reference.length);for(const name of group.reference){assert(!seen.has(name),'Duplicate reference control '+name);seen.add(name);}for(const name of group.api)assert(apis.has(name),group.feature+': missing rhvideo.'+name);}
  assert.equal(seen.size,181);assert.equal(mapping.modules.length,8);
});
test('reference inventory includes template-generated controls and keyboard handlers, without treating event propagation as a business API',()=>{
  assert.deepEqual(referenceControls('<button onclick="openThing(\'${id}\');event.stopPropagation()"></button><input onkeydown="if(event.key===\'Enter\')jumpPage()">'),['if','jumpPage','openThing']);
});
