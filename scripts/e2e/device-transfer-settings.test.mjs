import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');

test('download settings UI and scripts share validated persisted concurrency and bandwidth limits',async()=>{
  const app=await launchApp({desktopId:'transfer-settings-qa'});
  try{
    await api(app,'devices.downloadSettings',{parallelism:4,rateMiB:2.5});
    await app.evaluate('setLang("zh");openSettings();switchSettingsSection("lan",false);true');
    assert.deepEqual(await app.evaluate('[document.getElementById("settings-download-streams").value,document.getElementById("settings-download-rate").value]'),['4','2.5']);
    await app.evaluate('(()=>{const streams=document.getElementById("settings-download-streams"),rate=document.getElementById("settings-download-rate");streams.value="1";streams.dispatchEvent(new Event("change",{bubbles:true}));rate.value="5";rate.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
    await until(async()=>{const value=await api(app,'devices.downloadSettings.get');return value.parallelism===1&&value.rateMiB===5;},'visible settings are committed by semantic API');
    const stored=await app.evaluate('JSON.parse(localStorage.getItem("rhfiles-settings"))');
    assert.equal(stored.deviceDownloadParallelism,1);assert.equal(stored.deviceDownloadRateMiB,5);
    await api(app,'devices.downloadSettings',{parallelism:2,rateMiB:0});
    assert.deepEqual(await app.evaluate('[document.getElementById("settings-download-streams").value,document.getElementById("settings-download-rate").value]'),['2','0']);
    await app.screenshot('device-download-settings');
  }finally{await app.close();}
});
