// Explicit ordinary-package acceptance. Never launches or updates an installed
// user instance: app-session creates private Windows profile/environment roots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,sleep} from './app-session.mjs';

const phase=process.argv[2],version=process.argv[3],feedFile=process.argv[4];
if(!['new','previous'].includes(phase)||!/^\d+\.\d+\.\d+$/.test(version)||!process.env.RHFILES_TEST_EXECUTABLE)throw Error('Select new/previous, expected version and an explicit extracted ordinary portable executable');
const app=await launchApp({desktopId:'windows-update-release-'+phase,emulateFocus:true});
try{
  const source=phase==='new'?'https://cnb.cool/railgunhamster/RHFiles':'https://github.com/RailgunHamster/RHFiles';
  const status=await app.evaluate(`call('check_updates',{source:${JSON.stringify(source)},proxy:null})`);
  assert.equal(status.managed,true,'Must test the real Velopack portable, not an unmanaged executable');
  assert.equal(status.isPortable,true);assert.equal(status.currentVersion,version);
  if(phase==='new'){
    assert.equal(await app.evaluate('getUpdateSource()'),'https://cnb.cool/railgunhamster/RHFiles');
    await app.evaluate("RHFilesAPI.invoke('settings.open',{section:'updates'})");
    assert.deepEqual(await app.evaluate("[...document.querySelectorAll('#settings-update-source option')].map(o=>o.value)"),['cnb','github']);
    assert.equal(await app.evaluate("document.querySelector('#settings-update-server,#settings-update-gitee')"),null);
    await app.screenshot('new-portable-cnb-settings');
    console.log('PASS: ordinary '+version+' portable is managed, defaults to CNB, and no longer exposes retired update options; artifacts: '+app.artifactDir);
  } else {
    if(!feedFile)throw Error('Previous-version acceptance requires the new package feed');
    const feed=JSON.parse(fs.readFileSync(feedFile,'utf8'));
    const latest=feed.Assets.filter(a=>a.Type==='Full').sort((a,b)=>b.Version.localeCompare(a.Version,undefined,{numeric:true}))[0];
    assert(latest&&latest.Version!==version);assert.equal(status.availableVersion,latest.Version);
    assert.equal(status.pendingRestart,false,'Start with a fresh old portable, not a previous successful download');
    console.log('PASS: original '+version+' updater discovers GitHub '+latest.Version);
    // Native download can exceed CDP's single-evaluation timeout. Observe its
    // result without replaying the request or performing an automatic apply.
    await app.evaluate(`(()=>{window.__releaseDownload={state:'running'};call('download_update',{source:${JSON.stringify(source)},proxy:null}).then(value=>window.__releaseDownload={state:'done',value}).catch(error=>window.__releaseDownload={state:'failed',error:String(error)});return true})()`);
    const deadline=Date.now()+30*60*1000;let result;
    while(Date.now()<deadline){result=await app.evaluate('window.__releaseDownload');if(result.state!=='running')break;await sleep(500);}
    assert.equal(result?.state,'done',result?.error||'Native download did not finish');assert.equal(result.value,latest.Version);
    const refreshed=await app.evaluate(`call('check_updates',{source:${JSON.stringify(source)},proxy:null})`);
    assert.equal(refreshed.availableVersion,latest.Version);assert.equal(refreshed.pendingRestart,true);
    const packageRoot=path.resolve(path.dirname(process.env.RHFILES_TEST_EXECUTABLE),'..','packages');
    const packageFile=path.join(packageRoot,latest.FileName);
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of fs.createReadStream(packageFile)){hash.update(chunk);bytes+=chunk.length;}
    assert.equal(bytes,latest.Size);assert.equal(hash.digest('hex'),latest.SHA256.toLowerCase());
    await app.screenshot('previous-portable-update-ready');
    console.log('PASS: original updater downloaded and verified '+latest.Version+' with pendingRestart=true; no apply/restart performed; artifacts: '+app.artifactDir);
  }
}finally{await app.close();}
