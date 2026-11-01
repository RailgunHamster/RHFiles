import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';

test('native Windows update settings offer CNB/GitHub only and persist source choices without enabling automatic checks',async()=>{
  const app=await launchApp({desktopId:'cnb-update-settings',emulateFocus:true});
  try{
    await app.evaluate("RHFilesAPI.invoke('settings.open',{section:'updates'})");
    const snapshot=await app.evaluate(`(()=>({
      modes:[...document.querySelectorAll('#settings-update-source option')].map(o=>o.value),
      selected:document.getElementById('settings-update-source').value,
      cnb:document.getElementById('settings-update-cnb').value,
      retired:!!document.querySelector('#settings-update-server,#settings-update-gitee'),
      automatic:document.getElementById('settings-auto-update').checked
    }))()`);
    assert.deepEqual(snapshot,{modes:['cnb','github'],selected:'cnb',cnb:'https://cnb.cool/railgunhamster/RHFiles',retired:false,automatic:false});
    for(const mode of ['github','cnb']){
      await app.evaluate(`(()=>{const el=document.getElementById('settings-update-source');el.value=${JSON.stringify(mode)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
      const persisted=await app.evaluate("JSON.parse(localStorage.getItem('rhfiles-settings'))");
      assert.equal(persisted.updateSourceMode,mode);assert.equal(persisted.autoUpdateEnabled,false);assert.equal(persisted.updateSourceChoiceVersion,2);
      assert(!('serverUpdateSource' in persisted));assert(!('giteeUpdateSource' in persisted));
    }
    await until(()=>app.evaluate("document.getElementById('settings-check-update')?.disabled===false"),'manual check remains enabled');
    if(process.env.RHFILES_CNB_LIVE==='1'){
      // Explicit local release acceptance, not a mandatory network dependency
      // of the deterministic CI suite. Exercise the actual native HTTP stack.
      const history=await app.evaluate("call('get_release_history',{source:getUpdateSource(),proxy:null,allowRemote:true})");
      assert.equal(history.source,'remote',history.warning||'Native client did not read CNB');assert.equal(history.warning,null);
      assert(history.releases.some(r=>r.version==='0.1.91'));
      console.log('PASS: actual native anonymous CNB release-history request');
    }
    await app.screenshot('cnb-update-settings');
  } finally {await app.close();}
});
