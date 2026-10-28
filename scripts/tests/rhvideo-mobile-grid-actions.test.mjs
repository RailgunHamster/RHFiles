import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
function registrations(mobile){
  const start=source.indexOf('action("grid.state"'),end=source.indexOf('action("player.close"',start);
  assert(start>=0&&end>start,'Execute the actual shipped grid registration block');
  const actions=new Map(),calls=[];
  vm.runInNewContext(source.slice(start,end),{
    ctx:{mobile},object:(properties={},required=[])=>({type:'object',properties,required}),
    action:(name,params,run,effect)=>actions.set(name,{params,run,effect}),
    native:(name,args)=>{calls.push({name,args});return {accepted:true};},
  });
  return {actions,calls};
}
test('native mobile grid exposes the same favorite/preview-mark operations as desktop',async()=>{
  for(const mobile of [true,false]){
    const {actions,calls}=registrations(mobile);
    for(const name of ['favorite','mark']){
      const action=actions.get('grid.'+name);assert(action,'Missing '+(mobile?'mobile ':'desktop ')+'grid.'+name);
      assert.equal(action.effect,'write');
      const args={target:2,inputTarget:2,expectedInput:42,expectedLease:'current-grid'};
      await action.run(args);assert.equal(calls.at(-1).name,'grid.'+name);assert.equal(calls.at(-1).args,args);
      for(const field of ['target','inputTarget','expectedInput',...(mobile?['expectedLease','expectedOffset','expectedInputs']:[])])assert(Object.hasOwn(action.params.properties,field),'Public input guard '+field);
    }
  }
});
