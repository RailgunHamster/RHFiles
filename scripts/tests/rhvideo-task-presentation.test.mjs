import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../../src/js/rhvideo-task-presentation.js');
const task=(extra={})=>({id:'video:owned',filename:'测试.mp4',kind:'initial',status:'processing',steps:[{key:'probe',label:'读取视频信息',status:'done',elapsed_seconds:0,metrics:[{label:'时长',value:60,format:'duration'}]},{key:'compress',label:'普通压缩',status:'running',metrics:[]}],...extra});

for(const [format,value,expected]of [['bytes',0,'0 B'],['bytes',1536,'1.5 KiB'],['bytes',1024**3,'1 GiB'],['bitrate',128000,'128 kbps'],['bitrate',2000000,'2 Mbps'],['duration',0,'0 秒'],['duration',3661,'1 小时 1 分 1 秒'],['percent',0,'0%'],['fps',24,'24 fps'],['speed',1.25,'1.25×'],['frames',0,'0 帧'],['count',0,'0 个']])test('real task metric format '+format+' '+value,()=>assert.equal(P.metric({label:'参数',value,format}).value,expected));
test('zero and false metrics remain present, invalid and nested values do not become NaN or object text',()=>{
  assert.deepEqual(P.metrics([{label:'零',value:0},{label:'布尔',value:false},{label:'空',value:''},{value:NaN},{value:Infinity},{value:{}},{value:[]},{value:'bad',format:'bytes'},{value:null},{value:undefined}]),[{label:'零',value:'0'},{label:'布尔',value:'否'}]);
  assert.equal(P.metrics(Array.from({length:100},(_,n)=>({value:n}))).length,24);
});
test('unknown live progress is indeterminate rather than a fabricated zero percent',()=>{
  const value=P.model(task({progress:null}),'default').progress;assert(value.visible&&value.active);assert.equal(value.percent,null);assert.equal(value.percentLabel,'—');assert.equal(value.heartbeat,'等待进度数据');
  for(const percent of [null,undefined,NaN,Infinity,-1,101,'20'])assert.equal(P.progress(task({progress:{percent}})).percent,null);
  assert.equal(P.progress(task({progress:{percent:0}})).percent,0);
});
test('healthy progress provides all live units, active step and a genuine ETA including zero',()=>{
  const value=P.model(task({progress:{stage:'compress',percent:40,processed_seconds:20,duration_seconds:50,output_bytes:1536,frame:0,fps:24,speed:2,encoder:'libx264',eta_seconds:0,stage_elapsed_seconds:0,process_running:true,heartbeat_age_seconds:0,unchanged_seconds:0}}),'default').progress;
  assert.equal(value.phase,'普通压缩');assert.equal(value.percentLabel,'40.0%');assert.equal(value.stage,'compress');assert.equal(value.elapsed,0);assert.equal(value.live.length,6);assert(value.live.some(m=>m.value==='0 帧'));assert(value.summary.some(m=>m.label==='预计剩余'&&m.value==='0 秒'));assert.equal(value.state,'active');
});
for(const patch of [{stalled:true},{process_running:true,unchanged_seconds:30},{process_running:true,heartbeat_age_seconds:5}])test('stalled/offline progress cannot keep presenting a fresh ETA: '+JSON.stringify(patch),()=>{
  const value=P.progress(task({progress:{percent:50,speed:1,eta_seconds:20,...patch}}));assert(!value.summary.some(m=>m.label==='预计剩余'));assert(value.summary.some(m=>m.label==='上次速度'));assert(['stalled','offline'].includes(value.state));
});
test('a connection error marks the last data offline, keeps its percent, and hides its stale ETA',()=>{
  const value=P.progress(task({progress:{percent:42,eta_seconds:30,speed:1}}),{error:'HTTP 503'});assert.equal(value.percent,42);assert.equal(value.state,'offline');assert.match(value.heartbeat,/HTTP 503/);assert(!value.summary.some(m=>m.label==='预计剩余'));
});
test('step times, planned parameters, zero outputs, messages and both terminal reasons stay readable',()=>{
  const value=P.model(task({status:'pending',steps_provisional:true,live:true,steps:[{key:'a',label:'校验',status:'done',elapsed_seconds:0,metrics:[{label:'大小',value:0,format:'bytes'}]},{key:'b',status:'failed',message:'磁盘已满',started_at:'2020-01-01T00:00:00Z',finished_at:'2020-01-01T00:00:02Z'}]}),'default');
  assert.match(value.note,/计划参数/);assert.equal(value.steps[0].elapsed,'耗时 0 秒');assert.equal(value.steps[0].metrics[0].value,'0 B');assert.equal(value.steps[1].statusLabel,'失败');assert.equal(value.steps[1].message,'磁盘已满');assert.equal(value.steps[1].elapsed,'耗时 2 秒');
  assert.match(P.model(task({legacy:true,steps:[]}),'default').note,/历史摘要/);assert.match(P.model(task({details_archived:true,steps:[]}),'default').note,/90 天/);
});
test('replacement savings and rebuilding semantics survive presentation rather than exposing a raw JSON table',()=>{
  const value=P.model(task({status:'succeeded',before_size:2048,after_size:1024,steps:[]}), 'replacement');assert.equal(value.kind,'原片替换');assert.deepEqual(value.summary.map(m=>m.value),['2 KiB','1 KiB','1 KiB']);assert.match(value.replacementNote,/默认压缩队列/);assert.equal(value.progress.visible,false);
  assert.equal(P.model(task({kind:'rebuild'}),'default').kind,'原片替换后重建');
});
test('dates and missing fields are explicit, and file or metric text remains literal data',()=>{
  assert.equal(P.date('invalid'),'—');assert.equal(P.date(null),'—');assert.match(P.date('2020-01-02T00:00:00Z'),/2020/);
  const value=P.model(task({filename:'<img src=x onerror=alert(1)>',steps:[{key:'x',label:'<script>',status:'warning',metrics:[{label:'<tag>',value:'<svg onload=boom>'}]}]}),'default');assert.equal(value.filename,'<img src=x onerror=alert(1)>');assert.equal(value.steps[0].metrics[0].value,'<svg onload=boom>');assert.deepEqual(JSON.parse(JSON.stringify(value)),value);
  assert.throws(()=>P.model(task({steps:'bad'}),'default'),/格式无效/);assert.throws(()=>P.model(task({steps:[null]}),'default'),/格式无效/);
});
