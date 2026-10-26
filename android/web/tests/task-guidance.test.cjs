const {test}=require('node:test'),assert=require('node:assert/strict'),guidance=require('../js/task-guidance.js');
test('successful and active jobs do not receive failure advice',()=>{
 for(const state of ['completed','running','queued','paused','scanning'])assert.equal(guidance.forTask({state,message:'old HTTP 403'}),null);
});
test('permission, authorization, capacity, network and range failures have distinct advice',()=>{
 for(const [message,code] of [['RHFiles：HTTP 403 · 本机未向设备组授予此权限','permission'],['HTTP 401','authorization'],['ENOSPC: No space left on device','space'],['请求超时','connection'],['RHFiles：HTTP 416 · 请求失败','range']]){
  const job={state:'failed',failures:[{path:'/ignored',message}]},before=JSON.stringify(job),result=guidance.forTask(job);
  assert.equal(result.code,code);assert.ok(result.steps.length);assert.equal(JSON.stringify(job),before);
 }
 assert.equal(guidance.forTask({state:'failed',message:'file 403.mp4 failed'}).code,'unknown');
});
test('interruption does not promise a write was rolled back, and advice is serializable and side-effect free',()=>{
 const result=guidance.forTask({state:'interrupted',op:'move'});assert.equal(result.code,'interrupted');assert.match(result.steps.join(''),/先检查来源及目标/);
 assert.match(JSON.stringify(guidance.forTask({state:'failed',message:'timeout',op:'move'})),/不会自动重放/);
 assert.equal(guidance.forTask({state:'canceled'}).code,'canceled');
});
