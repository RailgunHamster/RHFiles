import test from 'node:test';
import assert from 'node:assert/strict';
import {taskFixture} from '../testing/rhvideo-task-fixture.mjs';
const call=(fixture,path)=>fixture({req:{url:path},path:path.split('?')[0],send:(status,value)=>({status,value})});
test('owned recovery fixture fails exactly the observed reads until a manual detail read, not a forged UI state',async()=>{
  const fixture=taskFixture();assert.equal((await call(fixture,'/api/v1/processing-tasks?view=running')).status,200);fixture.armFailures();
  for(let n=0;n<3;n++)assert.equal((await call(fixture,'/api/v1/processing-tasks?view=running')).status,503);
  assert.deepEqual(fixture.recoveryState(),{armed:true,failureCount:3,manualRecovered:false,recoveryLists:0});
  const detail=await call(fixture,'/api/v1/processing-tasks/default/video:metrics');assert.equal(detail.status,200);assert.equal(detail.value.progress.percent,40);
  await call(fixture,'/api/v1/processing-tasks?view=running');assert.deepEqual(fixture.recoveryState(),{armed:false,failureCount:3,manualRecovered:true,recoveryLists:1});
});
test('a premature detail read cannot silently repair the controlled three-failure scenario',async()=>{
  const fixture=taskFixture();fixture.armFailures();await call(fixture,'/api/v1/processing-tasks?view=running');await call(fixture,'/api/v1/processing-tasks/default/video:metrics');assert(fixture.recoveryState().armed);assert.equal((await call(fixture,'/api/v1/processing-tasks?view=running')).status,503);
});
