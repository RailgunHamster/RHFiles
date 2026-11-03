import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {context,load,plain,root} from '../testing/source.mjs';
test('external update transition uses the resolved custom theme and current locale',()=>{
  const colors={'--bg':'rgb(1, 2, 3)','--bg-card':'rgb(20, 30, 40)','--text':'rgb(230, 240, 250)','--accent':'rgba(255, 128, 16, 1)','--border':'rgba(1, 2, 3, 0.2)'};
  const c=context({G:{theme:'user:custom',themeBase:'dark'},_lang:'zh-CN',
    document:{documentElement:{},body:{appendChild(){}},createElement:()=>({style:{},remove(){}})},
    getComputedStyle:node=>node.style?{color:node.style.color}:{getPropertyValue:name=>colors[name]}});
  load(c,'theme.js',['updateTransitionAppearance']);
  assert.deepEqual(plain(c.updateTransitionAppearance()),{theme:'dark',language:'zh-CN',bg:'#010203',card:'#141e28',text:'#e6f0fa',accent:'#ff8010',border:''});
  c.G.theme='forest';assert.equal(c.updateTransitionAppearance().theme,'forest');
});
test('installer is silent only when the external window is confirmed ready and failure still aborts update admission',()=>{
  const source=fs.readFileSync(path.join(root,'src-tauri/src/updates.rs'),'utf8');
  assert.match(source,/transition\.is_some\(\), true/);assert.match(source,/cancel\.abort_update\(\)/);
  assert(source.indexOf('transition.handoff()')>source.indexOf('cancel.abort_update()'));
  const rust=fs.readFileSync(path.join(root,'src-tauri/src/update_splash.rs'),'utf8');
  assert.match(rust,/include_bytes!.*OUT_DIR/);assert.match(rust,/create_new\(true\)/);assert.match(rust,/ready\.is_file/);
  assert.doesNotMatch(rust,/csc\.exe|\.status\(\)/);
});
test('download state appears inside settings instead of becoming a hidden file-operation task',()=>{
  const status={textContent:'',title:''},button={disabled:false},errors=[];
  const c=context({G:{settings:{autoUpdateEnabled:false}},document:{getElementById:id=>id==='settings-update-status'?status:id==='settings-check-update'?button:null},
    normalizedUpdateFailure:v=>v,renderUpdateFailure:v=>errors.push(v),fmtSize:n=>String(n),t:(key,args)=>key+' '+JSON.stringify(args||{})});
  load(c,'main.js',['updateSettingsStatusText','updateDownloadProgress','refreshUpdateSettingsStatus']);
  c.updateDownloadProgress({phase:'downloading',version:'0.1.100',percentage:43,downloadedBytes:43,totalBytes:100,speed:20});
  assert.match(status.textContent,/statusDownloading.*43/);assert.match(status.textContent,/0.1.100/);
  c.updateDownloadProgress({phase:'verifying',version:'0.1.100'});assert.match(status.textContent,/verifying/);
  c.updateDownloadProgress({phase:'ready',version:'0.1.100'});assert.equal(c.G._updateStatus.pendingRestart,true);assert.match(status.textContent,/statusReady/);
  c.updateDownloadProgress({phase:'failed',message:'checksum mismatch'});assert.equal(c.G._updateTransientFailure,'checksum mismatch');
  const source=fs.readFileSync(path.join(root,'src/js/main.js'),'utf8');
  const flow=source.slice(source.indexOf('async function checkForUpdates('));
  assert(!flow.includes('showProgress('));assert(!flow.includes('failOperationTask('));
});
test('reopening settings during a download retains progress even when automatic checks are disabled',async()=>{
  const c=context({G:{_updateProgress:{phase:'downloading'}},document:{getElementById:()=>({disabled:false})},updateSettingsStatusText:()=>{},refreshLastUpdateFailure:()=>{throw Error('Do not replace live progress with a check');}});
  load(c,'main.js',['refreshUpdateSettingsStatus']);await c.refreshUpdateSettingsStatus();
});
