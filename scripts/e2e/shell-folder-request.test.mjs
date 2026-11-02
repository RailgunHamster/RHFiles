import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {launchApp,until} from '../testing/app-session.mjs';
import {root} from '../testing/source.mjs';
test('shell launches route to the existing desktop profile as new/reused tabs, without enabling integration or changing user associations',async()=>{
  const app=await launchApp({emulateFocus:true});
  try{
    const first=path.join(app.directory,'first folder'),second=path.join(app.directory,'second 中文');fs.mkdirSync(first);fs.mkdirSync(second);
    await app.evaluate(`RHFilesAPI.invoke('navigation.open',{path:${JSON.stringify(first)}})`);
    const before=await app.evaluate('RHFilesAPI.invoke("shell.defaults.state")');assert.equal(before.folders,false);assert.equal(before.winE,false);
    const launch=async folder=>{const child=spawn(path.join(root,'target/debug/rhfiles.exe'),['--shell-open',folder+'\\.'],{cwd:app.directory,windowsHide:true,env:{...process.env,RHFILES_TEST_PROFILE_ROOT:app.profileRoot,RHFILES_TEST_DESKTOP_ID:'e2e-isolated'}});await once(child,'exit');await until(()=>app.evaluate(`getTab().path===${JSON.stringify(folder)}`),'shell folder request');};
    await launch(second);let tabs=await app.evaluate('RHFilesAPI.invoke("tabs.list")');assert(tabs.left.some(t=>t.path===first));assert.equal(tabs.left.filter(t=>t.path===second).length,1);
    await launch(first);tabs=await app.evaluate('RHFilesAPI.invoke("tabs.list")');assert.equal(tabs.left.filter(t=>t.path===first).length,1);
    await app.evaluate('RHFilesAPI.invoke("settings.open",{section:"integration"})');await until(()=>app.evaluate('!!document.getElementById("shell-default-folders")'),'independent integration controls');await app.screenshot('shell-integration-settings');
    assert.deepEqual(await app.evaluate('RHFilesAPI.invoke("shell.defaults.state")'),before);
  }finally{await app.close();}
});
