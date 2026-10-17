const {test}=require('node:test');const assert=require('node:assert/strict');const {resolve,screenMemory,validateScreens}=require('../js/pane-model.js');
test('ordinary phone stays single; landscape phone too short stays single',()=>{assert.equal(resolve(412,892).mode,'single');assert.equal(resolve(892,412).mode,'single');});
test('portrait tablet stacks, landscape tablet uses columns',()=>{assert.equal(resolve(720,1100).mode,'rows');assert.equal(resolve(1280,800).mode,'columns');});
test('both manual directions are offered on every phone regardless of dimensions',()=>{for(const [width,height]of [[320,640],[412,892],[892,412],[1280,1000],[200,300]]){assert.deepEqual(resolve(width,height).options,{rows:true,columns:true});assert.equal(resolve(width,height,'rows').mode,'rows');assert.equal(resolve(width,height,'columns').mode,'columns');}});
test('manual selection survives resizing; only Auto uses geometry',()=>{assert.equal(resolve(1280,1000,'single').mode,'single');assert.equal(resolve(720,1100,'columns').mode,'columns');assert.equal(resolve(412,892,'columns').mode,'columns');assert.equal(resolve(892,412,'rows').mode,'rows');assert.equal(resolve(720,1100,'unknown').mode,'rows');});

test('legacy layout migrates to the first screen only; a new screen starts at Auto',()=>{
 const memory=screenMemory(null,'columns');assert.equal(memory.select('screen-1840x2208'),'columns');
 assert.equal(memory.select('screen-1080x2092'),'auto');assert.equal(memory.select('screen-1840x2208'),'columns');
 memory.set('screen-1080x2092','single');assert.equal(memory.select('screen-1080x2092'),'single');assert.equal(memory.select('screen-1840x2208'),'columns');
});
test('each screen remembers every mode across folding, restart and the last legacy choice',()=>{
 for(const outer of ['single','auto','rows','columns'])for(const inner of ['single','auto','rows','columns']){
  const memory=screenMemory(null);memory.select('screen-1080x2092');memory.set('screen-1080x2092',outer);memory.set('screen-1840x2208',inner);
  for(let i=0;i<10;i++){assert.equal(memory.select('screen-1080x2092'),outer);assert.equal(memory.select('screen-1840x2208'),inner);}
  const restarted=screenMemory(memory.serialize(),'rows');assert.equal(restarted.select('screen-1080x2092'),outer);assert.equal(restarted.select('screen-1840x2208'),inner);
 }
});
test('corrupt local screen memory recovers without using prototype keys; imports reject it',()=>{
 for(const invalid of [null,[],{version:3,screens:{}},{version:1,screens:[]},{version:1,screens:{'screen-1080x2092':'bad'}},{version:1,screens:JSON.parse('{"__proto__":"rows"}')},{version:1,screens:{},extra:1}]){
  assert.throws(()=>validateScreens(invalid));const memory=screenMemory(JSON.stringify(invalid),'single');assert.equal(memory.select('screen-1080x2092'),'single');assert.equal(memory.select('screen-1840x2208'),'auto');
 }
});
test('all four screen/orientation contexts independently retain every layout across restart',()=>{
 const contexts=[['screen-1080x2092','portrait'],['screen-1080x2092','landscape'],['screen-1840x2208','portrait'],['screen-1840x2208','landscape']],modes=['auto','single','columns','rows'];
 for(let bits=0;bits<256;bits++){
  const memory=screenMemory(null),expected=contexts.map((_,i)=>modes[(bits>>(i*2))&3]);
  contexts.forEach(([key,direction],i)=>memory.set(key,expected[i],direction));
  for(const store of [memory,screenMemory(memory.serialize(),'single')])for(let repeat=0;repeat<3;repeat++)contexts.forEach(([key,direction],i)=>assert.equal(store.select(key,direction),expected[i]));
 }
});
test('v1 screen choices initialize both orientations, then only the changed orientation is written',()=>{
 const memory=screenMemory(JSON.stringify({version:1,screens:{'screen-1080x2092':'single','screen-1840x2208':'rows'}}),'columns');
 assert.equal(memory.select('screen-1080x2092','landscape'),'single');assert.equal(memory.select('screen-1840x2208','portrait'),'rows');
 memory.set('screen-1080x2092','columns','landscape');memory.set('screen-1840x2208','single','portrait');
 const restored=screenMemory(memory.serialize());assert.equal(JSON.parse(restored.serialize()).version,2);
 assert.equal(restored.select('screen-1080x2092','portrait'),'single');assert.equal(restored.select('screen-1080x2092','landscape'),'columns');
 assert.equal(restored.select('screen-1840x2208','portrait'),'single');assert.equal(restored.select('screen-1840x2208','landscape'),'rows');
});
test('new orientation defaults to Auto; malformed nested profiles fail strict validation',()=>{
 const memory=screenMemory(null);memory.set('screen-1840x2208','rows','portrait');assert.equal(memory.select('screen-1840x2208','landscape'),'auto');
 for(const profile of [null,[],{},'rows',{portrait:'bad'},{portrait:'single',rotation:'rows'},JSON.parse('{"__proto__":"rows"}'),{portrait:false},{portrait:'rows',landscape:'single',extra:'auto'}])assert.throws(()=>validateScreens({version:2,screens:{'screen-1840x2208':profile}}));
 assert.throws(()=>memory.set('screen-1840x2208','rows','wrong'));assert.equal(memory.select('screen-1840x2208','portrait'),'rows');
});
test('screen memory bounds retained displays without evicting the newly selected screen',()=>{
 const memory=screenMemory(null);for(let i=10;i<50;i++)memory.set(`screen-${i}x100`,'rows');
 const value=validateScreens(JSON.parse(memory.serialize()));assert.equal(Object.keys(value.screens).length,32);assert.equal(memory.select('screen-49x100'),'rows');
});
