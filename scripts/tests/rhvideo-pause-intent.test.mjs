import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
function controller(file){
  const source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8'),functions=[];
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&['paused','toggleCommand'].includes(n.id?.name))functions.push(source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
  walk(parse(source,{ecmaVersion:'latest'}));assert.equal(functions.length,2,'Exercise the shipped pause/toggle controller');const scope=vm.createContext({});vm.runInContext(functions.join('\n'),scope);return scope;
}
test('single-player toggle follows the accepted intent while decoder pause/resume is still pending',()=>{
  const c=controller('rhvideo-player.js');
  assert.equal(c.toggleCommand({state:3,pauseRequested:true}),'resume');
  assert.equal(c.toggleCommand({state:4,pauseRequested:false}),'pause');
  assert.equal(c.toggleCommand({state:6,pauseRequested:false}),'resume','a finished input is replayed');
  assert.equal(c.toggleCommand({state:4}),'resume');assert.equal(c.toggleCommand({state:3}),'pause');
});
test('group toggle does not confuse lagging paused state or a mixed group with accepted playing intent',()=>{
  const c=controller('rhvideo-grid.js');
  assert.equal(c.toggleCommand({cells:[{state:3,pauseRequested:true},{state:3,pauseRequested:false}]}),'resume');
  assert.equal(c.toggleCommand({cells:[{state:4,pauseRequested:false},{state:3,pauseRequested:false}]}),'pause');
  assert.equal(c.toggleCommand({cells:[{state:6,pauseRequested:false}]}),'resume');
  assert.equal(c.toggleCommand({cells:[{state:4}]}),'resume');assert.equal(c.toggleCommand({cells:[{state:3}]}),'pause');
});
