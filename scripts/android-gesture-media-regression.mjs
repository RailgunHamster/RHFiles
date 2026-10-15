// Real emulator-only touch, virtualization and native player regression.
// Prepare /sdcard/RHFiles-Scroll-QA (2,000 files) and an H.264/AAC fixture
// /sdcard/Download/sample-h264-aac.mp4 before running. Never selects a phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {androidSession,until,pause} from './testing/android-session.mjs';
const app=await androidSession();const results=[];
const check=(label,details)=>{assert.ok(details,label);results.push(label);console.log('PASS — '+label);};
const back=async()=>{app.adb('shell','input','keyevent','4');await pause(350);};
const visible=id=>app.evaluate(`!document.getElementById(${JSON.stringify(id)}).hidden`);
async function nativeScreenshot(name){app.adb('shell','screencap','-p','/sdcard/rhfiles-native.png');app.adb('pull','/sdcard/rhfiles-native.png',path.join(app.artifactDir,name+'.png'));}
function resumed(activity){return app.adb('shell','dumpsys','activity','activities').split('\n').some(l=>l.includes('topResumedActivity')&&l.includes(activity));}
try{
  console.log('Evidence: '+app.artifactDir);
  // Only this dedicated emulator: dismiss Android's one-time fullscreen lesson,
  // which otherwise intercepts Back instead of reaching the tested Activity.
  app.adb('shell','settings','put','secure','immersive_mode_confirmations','confirmed');
  if(!await visible('home')){await app.click('#btn-menu');await app.click('#nav-home');await pause(250);}
  // Assert a partial drag BEFORE release, not merely the final open state.
  await app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:30,y:245}]});
  for(let i=1;i<=5;i++){await app.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:30+20*i,y:245}]});await pause(30);}
  const partial=await app.evaluate(`(()=>{const d=document.getElementById('drawer'),r=d.getBoundingClientRect();return {hidden:d.hidden,x:r.x,width:r.width,opacity:Number(getComputedStyle(document.getElementById('scrim')).opacity)};})()`);
  console.log('Mid-drag geometry: '+JSON.stringify(partial));
  check('Drawer follows the finger before touchend',!partial.hidden && partial.x< -10 && partial.x> -partial.width+20 && partial.opacity>0 && partial.opacity<1);
  await app.screenshot('drawer-mid-drag');
  await app.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await pause(250);
  check('Cancelled opening gesture returns to Home',!await visible('drawer'));
  await app.click('[data-tile="storage-0"]');await until(()=>visible('filelist'),'storage root');
  const root=await app.evaluate('api.storageRoots().then(r=>r.find(x=>!x.removable).path)'),folder=root+'/RHFiles-Scroll-QA';
  const index=await app.evaluate(`api.listDir({path:${JSON.stringify(root)}}).then(l=>fmt.shapeEntries(l.entries,{sort:localStorage.getItem('rhfiles.sort')||'name',showHidden:localStorage.getItem('rhfiles.hidden')==='1'}).findIndex(e=>e.path===${JSON.stringify(folder)}))`);
  check('Real large-directory fixture exists',index>=0);
  await app.evaluate(`(()=>{const l=document.getElementById('filelist'),grid=l.classList.contains('grid'),c=grid?Math.max(2,Math.floor(l.clientWidth/112)):1;l.scrollTop=Math.floor(${index}/c)*(grid?136:64);l.dispatchEvent(new Event('scroll'));})()`);
  await until(()=>app.evaluate(`!!document.querySelector('[data-path="${folder}"]')`),'large fixture row');await app.click(`[data-path="${folder}"]`);
  await until(()=>app.evaluate("document.getElementById('list-status').textContent.includes('2000')"),'2,000 files');
  const stats=()=>app.evaluate(`(()=>{const l=document.getElementById('filelist');return {top:l.scrollTop,max:l.scrollHeight-l.clientHeight,rows:l.querySelectorAll('[data-path]').length,select:!document.getElementById('selection-bar').hidden};})()`);
  const rect=await app.evaluate("(()=>{const r=document.getElementById('filelist').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height*.8,280)};})()");
  await app.swipe(rect.x,rect.y,rect.x,rect.y-130);await pause(1300);const down=await stats();
  check('Short downward scroll does not run to bottom',down.top>0 && down.top<down.max*.2);
  check('Scrolling does not activate multi-selection',!down.select);
  check('Only the visible window is rendered',down.rows<50);
  await pause(700);const settled=await stats();check('Scroll remains stable after release',Math.abs(settled.top-down.top)<4);
  await app.evaluate("(()=>{const l=document.getElementById('filelist');l.scrollTop=32000;l.dispatchEvent(new Event('scroll'));})()");await pause(250);
  await app.swipe(rect.x,rect.y-130,rect.x,rect.y);await pause(1300);const up=await stats();
  check('Short upward scroll does not run to top',up.top>25000 && up.top<32000 && !up.select);
  await app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x,y:rect.y-50}]});
  await app.evaluate("(()=>{const l=document.getElementById('filelist');l.scrollTop+=2000;l.dispatchEvent(new Event('scroll'));})()");await pause(650);
  await app.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  check('Recycled long-press timer cannot select a detached row',!(await stats()).select);await app.screenshot('large-list');
  await back();
  const downloads=root+'/Download';
  const downloadIndex=await app.evaluate(`api.listDir({path:${JSON.stringify(root)}}).then(l=>fmt.shapeEntries(l.entries,{sort:'name',showHidden:false}).findIndex(e=>e.path===${JSON.stringify(downloads)}))`);
  await app.evaluate(`(()=>{const l=document.getElementById('filelist');l.scrollTop=${downloadIndex}*64;l.dispatchEvent(new Event('scroll'));})()`);await pause(250);
  await app.click(`[data-path="${downloads}"]`);await until(()=>app.evaluate("!!document.querySelector('[data-path$=\"sample-h264-aac.mp4\"]')"),'video fixture');
  app.adb('logcat','-c');await app.click('[data-path$="sample-h264-aac.mp4"]');
  await until(()=>app.adb('shell','dumpsys','activity','activities').split('\n').some(l=>l.includes('topResumedActivity')&&l.includes('PlaybackActivity')),'native player');
  await until(()=>app.adb('logcat','-d','-s','RHFilesPlayback:D','*:S').includes('First video frame rendered'),'decoded first video frame',30000);
  check('H.264/AAC MP4 is decoded by the native player',true);await nativeScreenshot('native-video');
  await back();await until(()=>resumed('MainActivity'),'return from native player',30000);check('One Back exits the native player',true);await until(()=>app.evaluate("!!document.querySelector('[data-path$=\"rhfiles-sample.png\"]')"),'image fixture');
  await app.click('[data-path$="rhfiles-sample.png"]');await until(()=>app.evaluate("document.querySelector('.image-viewer .full-media')?.naturalWidth>0"),'image pixels');
  check('Image viewer displays the actual image and icon controls',await app.evaluate("document.querySelectorAll('.image-viewer .media-icon-btn svg').length===8"));
  check('All six photo controls fit one row on a narrow phone',await app.evaluate("(()=>{const r=[...document.querySelectorAll('.viewer-toolbar .media-icon-btn')].map(e=>e.getBoundingClientRect());return r.length===6 && r.every(e=>Math.abs(e.y-r[0].y)<2 && e.right<=innerWidth && e.left>=0);})()"));
  await app.screenshot('image-viewer');await back();
  app.adb('shell','touch','/sdcard/Download/rhfiles-invalid.mp4');
  await app.evaluate(`api.native('media.play',{path:${JSON.stringify(downloads+'/rhfiles-invalid.mp4')},name:'rhfiles-invalid.mp4',kind:'video'})`);
  await until(()=>app.adb('logcat','-d','-s','RHFilesPlayback:D','*:S').includes('ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED'),'invalid container error',30000);
  app.adb('shell','uiautomator','dump','/sdcard/rhfiles-player.xml');const xml=app.adb('shell','cat','/sdcard/rhfiles-player.xml');
  check('Playback failure offers retry and an external player',xml.includes('用其他播放器打开') && xml.includes('重试'));
  await nativeScreenshot('video-error');await back();
  await app.click('#btn-menu');await app.click('#nav-home');await pause(250);
  await app.evaluate("document.getElementById('home').scrollTop=document.getElementById('home').scrollHeight");await app.screenshot('home-index-card');
  console.log('PASS: '+results.length+' real emulator assertions.');
}finally{fs.writeFileSync(path.join(app.artifactDir,'gesture-media.json'),JSON.stringify(results,null,2));app.close();}
