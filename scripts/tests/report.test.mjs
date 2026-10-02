import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReport} from '../testing/report.mjs';
const report=()=>({total:1,passed:1,failed:0,results:[{name:'actual check',status:'PASS'}]});
test('only a complete internally consistent report passes',()=>assert.equal(validateReport(report()).PASS,1));
for(const [name,change] of [
  ['partial',r=>r.partial=true],['error',r=>r.error='timeout'],['empty',r=>r.results=[]],
  ['fabricated pass count',r=>r.passed=999],['fabricated total',r=>r.total=2],
  ['unknown status',r=>r.results[0].status='ok'],['hidden failure',r=>r.results[0].status='FAIL'],
  ['duplicate test',r=>r.results.push({...r.results[0]})],['missing name',r=>delete r.results[0].name],
]) test('report rejects '+name,()=>{const r=report();change(r);assert.throws(()=>validateReport(r));});
test('skips are explicit and never counted as passes',()=>{
  const r={total:1,passed:0,failed:0,skipped:1,results:[{name:'RDP environment',status:'SKIP'}]};
  assert.throws(()=>validateReport(r));assert.equal(validateReport(r,{allowSkipped:true}).SKIP,1);
});
