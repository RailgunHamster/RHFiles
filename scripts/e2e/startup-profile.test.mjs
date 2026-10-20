import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp} from '../testing/app-session.mjs';

test('missing Windows desktop identity still starts an isolated usable instance with Gitee updates',{timeout:90000},async()=>{
  const app=await launchApp({desktopId:'unavailable',emulateFocus:true});
  try{
    assert.equal(app.profile.desktopIdentified,false);
    assert.match(app.profile.desktopId,/^unidentified-session-/);
    assert.equal(app.profile.legacy,false);
    assert.equal(fs.existsSync(path.join(app.directory,'profile','legacy-desktop.txt')),false,'Fallback must never claim the legacy profile');
    const directory=path.join(app.directory,'files');fs.mkdirSync(directory);
    assert.equal(await app.evaluate(`navigateTo(${JSON.stringify(directory)})`),true);
    assert.equal(await app.evaluate('G.startupReady'),true);
    assert.equal(await app.evaluate('getTab().entries.length'),0);
    assert.equal(await app.evaluate('G.settings.updateSourceMode'),'gitee');
    assert.equal(await app.evaluate('getUpdateSource()'),'https://gitee.com/railgunhamster/RHFiles');
    await app.evaluate("openSettings();switchSettingsSection('updates');true");
    assert.equal(await app.evaluate("document.getElementById('settings-update-source').value"),'gitee');
    assert.equal(await app.evaluate("document.getElementById('settings-update-gitee').value"),'https://gitee.com/railgunhamster/RHFiles');
    await app.evaluate("setUpdateSourceMode('github');true");
    assert.equal(await app.evaluate('getUpdateSource()'),'https://github.com/RailgunHamster/RHFiles');
    await app.evaluate("setUpdateSourceMode('gitee');true");
    await app.screenshot('gitee-settings-fallback-startup');
    assert.ok(await app.evaluate("document.getElementById('settings-instance-profile').textContent.includes('unidentified-session-')"));
  }finally{app.close();}
});
