import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

test('Video replay remains controllable and only the configured default survives a restart',{timeout:110000},async t=>{
  let app=await launchApp();
  let page;
  t.after(async()=>{page?.close();await app.close();});
  const directory=path.join(app.directory,'clips');
  fs.mkdirSync(directory);
  const files=['a.mp4','b.mkv'].map(name=>path.join(directory,name));
  const ffmpeg=process.env.FFMPEG||path.resolve('src-tauri/thirdparty/ffmpeg.exe');
  for(const file of files){
    const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=240x136:rate=15',
      '-f','lavfi','-i','sine=frequency=450:sample_rate=44100','-af','volume=0.01','-t','4',
      '-c:v','mpeg4','-c:a','aac',file],{encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(result.status,0,result.stderr);
  }
  const main=(name,args={})=>app.evaluate(`RHFilesAPI.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`);
  const viewerTarget=async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json())
    .find(row=>new URL(row.url).pathname==='/file-viewer.html');
  const invoke=(name,args={})=>page.evaluate(`RHFilesAPI.invoke(${JSON.stringify('media.viewer.'+name)},${JSON.stringify(args)})`);
  const waitState=(predicate,label)=>until(async()=>{const state=await invoke('state');return predicate(state)&&state;},label,20000);
  const playing=(file,oldInput)=>waitState(s=>s.path===file&&s.video?.state===3&&s.video.renderedFrames>3&&s.video.inputId!==oldInput,'the selected video plays real frames');
  async function open(file){
    await main('navigation.open',{path:directory});
    await main('media.viewer.open',{path:file});
    const target=await until(viewerTarget,'video viewer page');
    page=await cdpSession(target,15000);
    return playing(file);
  }
  const space=async(repeat=false)=>{
    const key={key:' ',code:'Space',windowsVirtualKeyCode:32};
    await page.send('Input.dispatchKeyEvent',{...key,type:'keyDown'});
    if(repeat)await page.send('Input.dispatchKeyEvent',{...key,type:'keyDown',autoRepeat:true});
    await page.send('Input.dispatchKeyEvent',{...key,type:'keyUp'});
  };
  assert.equal((await main('media.preferences.get')).videoDefaultVolume,100);
  await app.evaluate(`(()=>{
    openSettings();
    switchSettingsSection('preview');
    const setting=document.getElementById('settings-videoDefaultVolume');
    setting.value='42';
    setting.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await until(async()=>(await main('media.preferences.get')).videoDefaultVolume===42,'the default volume setting is saved');
  assert.equal(await app.evaluate("JSON.parse(localStorage.getItem('rhfiles-settings')).videoDefaultVolume"),42);
  await app.evaluate('closeSettings()');
  let current=await open(files[0]);
  assert.equal(current.video.volume,42);
  await page.evaluate(`(()=>{
    const volume=document.getElementById('volume');
    volume.value='37';
    volume.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await waitState(s=>s.video?.volume===37,'decoder receives slider input before release');
  const ended=()=>waitState(s=>s.video?.state===6,'libVLC reaches the end of the clip');
  current=await ended();
  await page.evaluate("document.getElementById('volume').focus()");
  await space(true);
  let replayed=await playing(files[0],current.video.inputId);
  assert.notEqual(replayed.selection,current.selection,'replay owns a new selection');
  assert.equal(replayed.video.volume,37);
  await space();
  await waitState(s=>s.video?.state===4,'Space pauses after replay even with the volume slider focused');
  await space();
  await waitState(s=>s.video?.state===3,'another Space resumes the replay');
  current=await ended();
  await page.evaluate("document.getElementById('toggle').click()");
  replayed=await playing(files[0],current.video.inputId);
  assert.equal(replayed.video.volume,37);
  assert.doesNotMatch(await page.evaluate("document.getElementById('video-startup-status').textContent"),/尚未就绪|not ready/i);
  assert.equal((await main('media.preferences.get')).videoDefaultVolume,42,'changing player volume leaves the configured default intact');
  await invoke('next');
  assert.equal((await playing(files[1],replayed.video.inputId)).video.volume,37);
  await invoke('video.control',{command:'volume',value:0});
  const muted=await waitState(s=>s.video?.volume===0,'the session remembers zero volume');
  await app.evaluate(`call('file_viewer_request',{action:'close',args:${JSON.stringify({generation:muted.generation,selection:muted.selection})}})`);
  page.close();page=null;
  await until(async()=>!(await viewerTarget()),'viewer has closed');
  assert.equal((await open(files[1])).video.volume,0,'a reopened viewer uses the session volume');
  const profileDirectory=app.profileRoot,webviewDirectory=app.profile.webviewDirectory;
  page.close();page=null;
  await app.close();
  app=await launchApp({profileDirectory});
  assert.equal(app.profile.webviewDirectory,webviewDirectory);
  assert.equal((await main('media.preferences.get')).videoDefaultVolume,42);
  assert.equal((await open(files[1])).video.volume,42,'a new RHFiles process starts with the saved default volume');
});
