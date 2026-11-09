import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain,deferred} from '../testing/source.mjs';

function fixture({automatic=true,enabled=true,platform='Win32',confirm=false,download,readiness,apply}={}){
  const calls=[],prompts=[],progress=[],tasks=new Map(),memory=new Map(),timers=new Map(),readinessCalls=[];let sequence=0,deferrals=0;
  const status={managed:true,currentVersion:'0.1.109',availableVersion:'0.1.110',pendingRestart:false};
  const c=context({navigator:{platform},G:{settings:{autoUpdateEnabled:enabled,autoInstallUpdates:automatic}},_operationTasks:tasks,
    setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},document:{getElementById:()=>null},
    refreshLastUpdateFailure:async()=>{},updateSettingsStatusText:()=>{},showNotice:()=>{},t:key=>key,
    updateDownloadProgress:value=>progress.push(value),updateTransitionAppearance:()=>({theme:'light'}),saveTabState:()=>{},
    getUpdateSource:()=>c.G.settings.source||'https://cnb.cool/railgunhamster/RHFiles',getUpdateProxy:()=>null,
    showConfirmDialog:async value=>{prompts.push(value);return confirm;},
    call:async(command,args)=>{
      if(command==='get_update_readiness'){readinessCalls.push(args);return readiness?await readiness(args):{ready:true};}
      if(command==='defer_update'){deferrals++;return;}
      calls.push([command,plain(args)]);
      if(command==='check_updates')return {...status};
      if(command==='download_update'){if(download)await download();status.pendingRestart=true;return status.availableVersion;}
      if(command==='apply_update'){if(apply)await apply();return;}
      throw Error(command);
    },
  });
  load(c,'main.js',['isAutomaticUpdateCheckEnabled','isAutomaticUpdateInstallEnabled','hasRunningFileTasks','canCheckForUpdates','resumeAutomaticUpdate','clearAutomaticUpdateDefer','updateReadiness','deferAutomaticUpdate','checkForUpdates','refreshUpdateSettingsStatus']);
  return {c,calls,prompts,progress,tasks,status,memory,timers,readinessCalls,get deferrals(){return deferrals;}};
}

test('Windows opt-in automatically downloads, preserves state and applies the exact offered version',async()=>{
  const f=fixture();f.memory.set('rhfiles-update-notified','0.1.110');
  await f.c.checkForUpdates(false);
  assert.deepEqual(f.calls.map(([name])=>name),['check_updates','download_update','apply_update']);
  assert.equal(f.prompts.length,0);
  assert(f.calls.slice(1).every(([,args])=>args.targetVersion==='0.1.110'));
});

test('disabled opt-in and manual checks retain the update confirmation',async()=>{
  for(const options of [{automatic:false},{automatic:true}]){
    const f=fixture(options);await f.c.checkForUpdates(options.automatic);
    assert.equal(f.prompts.length,1);assert.deepEqual(f.calls.map(([name])=>name),['check_updates']);
  }
});

test('disabling automatic checks prevents automatic installation even when the preference was imported',async()=>{
  const f=fixture({enabled:false});await f.c.checkForUpdates(false);assert.equal(f.calls.length,0);
  await f.c.checkForUpdates(true);assert.equal(f.prompts.length,1);assert.equal(f.calls.length,1);
});

test('automatic installation is Windows-only',async()=>{
  const f=fixture({platform:'Linux x86_64'});await f.c.checkForUpdates(false);
  assert.equal(f.prompts.length,1);assert(!f.calls.some(([name])=>name==='download_update'));
});

async function drained(f){
  for(let turn=0;turn<30;turn++){await new Promise(setImmediate);if(!f.c.G._updateCheckRunning)return;}
  assert.fail('Automatic update did not settle');
}

test('busy files defer automatic update once and resume after the last task finishes',async()=>{
  const f=fixture();f.tasks.set('copy',{status:'running'});
  await f.c.checkForUpdates(false);assert.equal(f.c.G._automaticUpdatePending,true);assert.equal(f.calls.length,1);
  f.c.resumeAutomaticUpdate();assert.equal(f.calls.length,1);
  f.tasks.get('copy').status='complete';f.c.resumeAutomaticUpdate();await drained(f);
  assert.deepEqual(f.calls.map(([name])=>name),['check_updates','download_update','apply_update']);
  f.c.resumeAutomaticUpdate();assert.equal(f.calls.length,3);assert.equal(f.timers.size,0);
});

test('a task started during download defers restart and reuses the verified downloaded package',async()=>{
  const gate=deferred(),f=fixture({download:()=>gate.promise});
  const checking=f.c.checkForUpdates(false);await new Promise(setImmediate);
  f.tasks.set('move',{status:'running'});gate.resolve();await checking;
  assert(!f.calls.some(([name])=>name==='apply_update'));assert.equal(f.c.G._automaticUpdatePending,true);
  f.tasks.get('move').status='failed';f.c.resumeAutomaticUpdate();await drained(f);
  assert.equal(f.calls.filter(([name])=>name==='download_update').length,1);
  assert.equal(f.calls.filter(([name])=>name==='apply_update').length,1);
});

for(const change of ['autoUpdateEnabled','autoInstallUpdates','source'])test(`changing ${change} while downloading prevents an automatic restart`,async()=>{
  const gate=deferred(),f=fixture({download:()=>gate.promise});
  const checking=f.c.checkForUpdates(false);await new Promise(setImmediate);
  f.c.G.settings[change]=change==='source'?'https://github.com/example/other':false;
  gate.resolve();await checking;
  assert(!f.calls.some(([name])=>name==='apply_update'));assert.equal(f.c.G._automaticUpdatePending,false);
});

test('download failure stays visible and never creates an automatic retry loop',async()=>{
  const f=fixture({download:async()=>{throw Error('checksum failure');}});
  await f.c.checkForUpdates(false);f.c.resumeAutomaticUpdate();
  assert.deepEqual(f.calls.map(([name])=>name),['check_updates','download_update']);
  assert.equal(f.progress.at(-1).phase,'failed');assert.match(f.progress.at(-1).message,/checksum/);
});

test('opening settings reuses its check result when the automatic option is enabled',async()=>{
  const f=fixture();await f.c.refreshUpdateSettingsStatus();
  assert.deepEqual(f.calls.map(([name])=>name),['check_updates','download_update','apply_update']);
});

test('server transfers and chunk gaps defer one exact update without polling the update server',async()=>{
  let busy=true;const f=fixture({readiness:()=>({ready:!busy,reasons:['server_requests'],retryAfterMs:30000})});
  await f.c.checkForUpdates(false);assert.equal(f.calls.length,1);assert.equal(f.timers.size,1);
  for(let turn=0;turn<4;turn++){const timer=[...f.timers.values()][0];assert.equal(timer.delay,30000);await timer.fn();await drained(f);assert.equal(f.calls.length,1);assert.equal(f.timers.size,1);}
  busy=false;await f.c.resumeAutomaticUpdate();assert.deepEqual(f.calls.map(([name])=>name),['check_updates','download_update','apply_update']);assert.equal(f.timers.size,0);
});

test('server work starting during download retains the ready package and closes its helper until idle',async()=>{
  let busy=false;const f=fixture({readiness:()=>({ready:!busy,retryAfterMs:30000}),download:async()=>{busy=true;}});
  await f.c.checkForUpdates(false);assert(!f.calls.some(([name])=>name==='apply_update'));assert.equal(f.deferrals,1);assert.equal(f.c.G._updateProgress.phase,'ready');
  busy=false;await f.c.resumeAutomaticUpdate();assert.equal(f.calls.filter(([name])=>name==='download_update').length,1);assert.equal(f.calls.filter(([name])=>name==='check_updates').length,1);assert.equal(f.calls.at(-1)[0],'apply_update');
});

test('an apply-time admission race is waiting, not a failed update or an immediate retry loop',async()=>{
  let race=true;const f=fixture({apply:async()=>{if(race)throw Error('[update_deferred] a WebDAV request won admission');}});
  await f.c.checkForUpdates(false);assert.equal(f.c.G._automaticUpdatePending,true);assert.equal(f.timers.size,1);assert(!f.progress.some(p=>p.phase==='failed'));
  await new Promise(setImmediate);assert.equal(f.calls.filter(([name])=>name==='apply_update').length,1);
  race=false;await f.c.resumeAutomaticUpdate();assert.equal(f.calls.filter(([name])=>name==='download_update').length,1);assert.equal(f.calls.filter(([name])=>name==='apply_update').length,2);
});

test('unknown native activity fails closed and disabling auto-install clears all deferred work',async()=>{
  const f=fixture({readiness:async()=>{throw Error('activity unavailable');}});await f.c.checkForUpdates(false);
  assert.equal(f.calls.length,1);assert.equal(f.c.G._automaticUpdatePending,true);assert.equal([...f.timers.values()][0].delay,30000);
  f.c.G.settings.autoInstallUpdates=false;f.c.clearAutomaticUpdateDefer();assert.equal(f.timers.size,0);assert.equal(f.c.G._automaticUpdatePending,false);await f.c.resumeAutomaticUpdate();assert.equal(f.calls.length,1);
});

test('manual update cannot restart an actively transferring server and does not silently enable automatic retry',async()=>{
  const f=fixture({confirm:true,readiness:()=>({ready:false,retryAfterMs:5000})});await f.c.checkForUpdates(true);
  assert.deepEqual(f.calls.map(([name])=>name),['check_updates']);assert.equal(f.timers.size,0);assert(!f.c.G._automaticUpdatePending);
});
