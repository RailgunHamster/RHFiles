const {test}=require('node:test');const assert=require('node:assert/strict');const {resolve}=require('../js/pane-model.js');
test('ordinary phone stays single; landscape phone too short stays single',()=>{assert.equal(resolve(412,892).mode,'single');assert.equal(resolve(892,412).mode,'single');});
test('portrait tablet stacks, landscape tablet uses columns',()=>{assert.equal(resolve(720,1100).mode,'rows');assert.equal(resolve(1280,800).mode,'columns');});
test('both directions offered only with enough room',()=>{assert.deepEqual(resolve(1280,1000).options,{rows:true,columns:true});assert.equal(resolve(1280,1000,'rows').mode,'rows');assert.equal(resolve(1280,1000,'columns').mode,'columns');});
test('manual single remains single; invalid direction falls back without losing preference',()=>{assert.equal(resolve(1280,1000,'single').mode,'single');assert.equal(resolve(720,1100,'columns').mode,'rows');assert.equal(resolve(1280,1000,'columns').mode,'columns');});
