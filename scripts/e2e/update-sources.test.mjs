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

test('three-part proxy UI has real defaults, saves via the same automation interface and restores existing addresses',async()=>{
  const app=await launchApp({desktopId:'proxy-settings',emulateFocus:true});
  try {
    await app.evaluate("G.settings.proxyUrl='';G.settings.proxyEnabled=false;RHFilesAPI.invoke('settings.open',{section:'updates'})");
    const fields=()=>app.evaluate("['protocol','host','port'].map(field=>{const el=document.getElementById('settings-proxy-'+field);return {field,value:el.value,disabled:el.disabled}})");
    assert.deepEqual(await fields(),[{field:'protocol',value:'http',disabled:true},{field:'host',value:'127.0.0.1',disabled:true},{field:'port',value:'7890',disabled:true}]);
    const set=async(id,value)=>{
      const control=await app.evaluate("RHFilesAPI.invoke('ui.list',{includeHidden:true}).then(rows=>rows.find(row=>row.id==="+JSON.stringify(id)+"))");
      assert(control?.enabled,'registered control must be enabled: '+id);
      if(typeof value==='string')await app.evaluate("RHFilesAPI.invoke('ui.set',"+JSON.stringify({controlId:control.controlId,value,commit:false})+")");
      await app.evaluate("RHFilesAPI.invoke('ui.set',"+JSON.stringify({controlId:control.controlId,...(typeof value==='boolean'?{checked:value}:{value})})+")");
    };
    await set('settings-proxy-enabled',true);assert.equal(await app.evaluate('getUpdateProxy()'),'http://127.0.0.1:7890');assert((await fields()).every(field=>!field.disabled));
    if(process.env.RHFILES_PROXY_LIVE==='1'){
      // Explicit acceptance only: no Internet dependency in the deterministic CI suite.
      const status=await app.evaluate("call('check_updates',{source:'https://github.com/RailgunHamster/RHFiles',proxy:getUpdateProxy()})");
      assert.equal(status.managed,true);console.log('PASS: native GitHub update check uses the enabled default proxy without entering any address');
    }
    for(const [field,value]of [['protocol','https'],['host','proxy.example'],['port','8443']])await set('settings-proxy-'+field,value);
    assert.equal(await app.evaluate("JSON.parse(localStorage.getItem('rhfiles-settings')).proxyUrl"),'https://proxy.example:8443');
    await set('settings-proxy-port','65536');assert.equal(await app.evaluate("document.getElementById('settings-proxy-port').validity.valid"),false);
    assert.equal(await app.evaluate("JSON.parse(localStorage.getItem('rhfiles-settings')).proxyUrl"),'https://proxy.example:8443');
    await set('settings-proxy-port','');assert.equal(await app.evaluate("document.getElementById('settings-proxy-port').value"),'7890');
    await set('settings-proxy-port','8443');
    await set('settings-proxy-enabled',false);assert.equal(await app.evaluate('getUpdateProxy()'),null);
    await app.evaluate("RHFilesAPI.invoke('settings.close').then(()=>RHFilesAPI.invoke('settings.open',{section:'updates'}))");
    assert.deepEqual((await fields()).map(field=>field.value),['https','proxy.example','8443']);
    assert((await fields()).every(field=>field.disabled));
    await app.screenshot('proxy-three-part-settings');
    await app.send('Emulation.setDeviceMetricsOverride',{width:480,height:850,deviceScaleFactor:1,mobile:false});
    await app.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const bounds=await app.evaluate("['protocol','host','port'].map(field=>{const r=document.getElementById('settings-proxy-'+field).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top}})");
    assert(bounds.every(r=>r.left>=0&&r.right<=480),'three proxy fields fit within a narrow settings window');
    assert(Math.max(...bounds.map(r=>r.top))-Math.min(...bounds.map(r=>r.top))<2,'protocol, host and port stay in the same row');
    await app.screenshot('proxy-three-part-narrow');
    assert.equal(await app.evaluate("document.querySelector('#settings-proxy-url')"),null);
    const controls=await app.evaluate("RHFilesAPI.invoke('ui.list',{includeHidden:true}).then(rows=>rows.filter(row=>['settings-proxy-enabled','settings-proxy-protocol','settings-proxy-host','settings-proxy-port'].includes(row.id)))");
    assert.equal(controls.length,4);assert(controls.every(control=>control.events.includes('change')),'each proxy field has an enumerable callable change handler');
  } finally {await app.close();}
});
