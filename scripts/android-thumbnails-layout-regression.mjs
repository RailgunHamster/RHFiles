// Real Android thumbnail codecs + touch/resize. Emulator only; no phone selected.
// Seed /sdcard/Download/rhfiles-sample.png and sample-h264-aac.mp4 first.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {androidSession,until,pause} from './testing/android-session.mjs';
const app=await androidSession(),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS — '+name)};
const native=(command,args={})=>app.evaluate(`api.native(${JSON.stringify(command)},${JSON.stringify(args)})`);
const folder='/storage/emulated/0/Pictures/RHFiles-Album-QA';
try{
  await app.swipe(30,270,100,270);await pause(230);check('One-fifth opening drag snaps the drawer open',await app.evaluate("!document.getElementById('drawer').hidden"));
  await app.swipe(240,270,170,270);await pause(230);check('One-fifth closing drag snaps the drawer closed',await app.evaluate("document.getElementById('drawer').hidden"));
  const downloadChild='/storage/emulated/0/Download/RHFiles-Navigation-QA';app.adb('shell','mkdir','-p',downloadChild);
  await app.click('[data-tile="downloads"]');await until(()=>app.evaluate("document.getElementById('title').textContent==='下载'&&!document.getElementById('filelist').hidden"),'Downloads shortcut');
  await app.click(`[data-path="${downloadChild}"]`);await until(()=>app.evaluate("document.getElementById('title').textContent==='RHFiles-Navigation-QA'"),'Downloads child');
  await app.evaluate('rhfilesHandleBack()');await until(()=>app.evaluate("document.getElementById('title').textContent==='下载'"),'Downloads parent');
  await app.evaluate('rhfilesHandleBack()');await until(()=>app.evaluate("!document.getElementById('home').hidden"),'Downloads to Home');check('Downloads children return through shortcut root directly to Home',true);
  await app.click('[data-tile="storage-0"]');await until(()=>app.evaluate("!!document.querySelector('[data-path=\"/storage/emulated/0/Download\"]')"),'storage Download');await app.click('[data-path="/storage/emulated/0/Download"]');
  await until(()=>app.evaluate("document.getElementById('title').textContent==='Download'"),'physical Download');await app.evaluate('rhfilesHandleBack()');await until(()=>app.evaluate("document.getElementById('title').textContent==='内部存储'"),'physical storage parent');check('Physical Download keeps internal storage as its parent',true);
  await app.evaluate('rhfilesHandleBack()');await until(()=>app.evaluate("!document.getElementById('home').hidden"),'storage to Home');
  check('Home icon tiles have a solid outline',await app.evaluate("(()=>{const s=getComputedStyle(document.querySelector('.tile-icon'));return parseFloat(s.borderTopWidth)>0&&s.borderTopStyle==='solid'})()"));await app.screenshot('home-outlines');
  app.adb('shell','mkdir','-p',folder);
  for(const name of ['older.png','latest.png'])app.adb('shell','cp','/sdcard/Download/rhfiles-sample.png',folder+'/'+name);
  app.adb('shell','touch','-t','202501010900.00',folder+'/older.png');app.adb('shell','touch','-t','202610160900.00',folder+'/latest.png');
  app.adb('shell',`for i in $(seq 1 60); do cp /sdcard/Download/rhfiles-sample.png ${folder}/image-$i.png; done`);
  for(const name of ['older.png','latest.png'])app.adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+folder+'/'+name);
  const image=await native('media.thumbnail',{path:folder+'/latest.png',maxEdge:160});check('Native image thumbnail is a bounded JPEG',image.dataUrl.startsWith('data:image/jpeg;base64,')&&image.width<=160&&image.height<=160);
  const video=await native('media.thumbnail',{path:'/storage/emulated/0/Download/sample-h264-aac.mp4',maxEdge:160});check('Real H.264 video produces a bounded frame thumbnail',video.dataUrl.startsWith('data:image/jpeg;base64,')&&video.width>0&&video.height>0&&video.width<=160&&video.height<=160);
  const videoFolder='/storage/emulated/0/Movies/RHFiles-Video-Album-QA';app.adb('shell','mkdir','-p',videoFolder);
  for(const name of ['older.mp4','latest.mp4'])app.adb('shell','cp','/sdcard/Download/sample-h264-aac.mp4',videoFolder+'/'+name);
  app.adb('shell','touch','-t','202501010900.00',videoFolder+'/older.mp4');app.adb('shell','touch','-t','202610160900.00',videoFolder+'/latest.mp4');
  for(const name of ['older.mp4','latest.mp4'])app.adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+videoFolder+'/'+name);
  const videoAlbum=await until(async()=>{const page=await native('media.library',{category:'video',albums:true});return page.entries.find(e=>e.path===videoFolder&&e.cover.path===videoFolder+'/latest.mp4')},'new video MediaStore scan');check('Video album cover is the newest video in that folder',true);
  const album=await until(async()=>{const page=await native('media.library',{category:'image',albums:true});return page.entries.find(e=>e.path===folder&&e.cover.path===folder+'/latest.png')},'new image MediaStore scan');check('Native category groups by actual folder with newest cover',album.libraryAlbum);
  const latest=await native('media.thumbnail',{path:album.cover.path,maxEdge:160});check('Album cover decodes the newest image',latest.dataUrl===image.dataUrl);fs.writeFileSync(path.join(app.artifactDir,'video-cover.jpg'),Buffer.from(video.dataUrl.split(',')[1],'base64'));
  await app.click('[data-tile="image"]');await until(()=>app.evaluate(`!!document.querySelector('[data-path="${folder}"] .thumb img')`),'album cover');await app.screenshot('image-albums');await app.click(`[data-path="${folder}"]`);
  await until(()=>app.evaluate("document.getElementById('title').textContent.includes('RHFiles-Album-QA')"),'filtered album');
  // Category includes only indexed images; use the actual folder for the 60-file scroll fixture.
  await app.evaluate('rhfilesHandleBack()');await pause(200);await app.evaluate('rhfilesHandleBack()');await pause(200);await app.click('[data-tile="storage-0"]');
  // Reach the real directory through its category menu, without a test-only route API.
  await app.evaluate('rhfilesHandleBack()');await pause(200);await app.click('[data-tile="image"]');await until(()=>app.evaluate(`!!document.querySelector('[data-path="${folder}"]')`),'album tile');
  await app.click(`[data-path="${folder}"] .entry-more`);await app.click('#sheet-panel .sheet-item:nth-of-type(2)');
  await until(()=>app.evaluate("document.getElementById('list-status').textContent.includes('62')"),'full folder');
  await until(()=>app.evaluate("document.querySelectorAll('#filelist .thumb img').length>=6"),'visible image thumbnails');
  await app.evaluate("window.__keptImage=[...document.querySelectorAll('#filelist .thumb img')].find(i=>i.complete);window.__keptRow=__keptImage.closest('[data-path]');document.getElementById('filelist').scrollTop+=3");await pause(150);
  check('Scrolling preserves row and decoded image identity',await app.evaluate('__keptRow.isConnected&&__keptImage?.isConnected&&__keptImage.complete'));
  const r=await app.evaluate("(()=>{const r=document.getElementById('filelist').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height*.7}})()");
  await app.evaluate("window.__gestureTrace=[];for(const type of ['pointerdown','pointermove','pointercancel','touchmove','contextmenu','scroll'])document.getElementById('filelist').addEventListener(type,e=>__gestureTrace.push({type,t:performance.now(),y:e.clientY??e.touches?.[0]?.clientY}),{passive:true})");
  // Queue the initial movement with touch-down: a slow CDP round trip must not
  // accidentally turn the intended scroll into a genuine 500 ms long press.
  await Promise.all([app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r]}),app.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.y-24}]})]);
  for(let i=3;i<=8;i++){await app.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.y-i*12}]});await pause(30);}
  check('Thumbnails remain visible while the finger is still dragging',await app.evaluate("document.querySelectorAll('#filelist .thumb img').length>=6&&!document.getElementById('filelist').hidden"));await app.screenshot('thumbnails-mid-drag');await app.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const noSelection=await app.evaluate("document.getElementById('selection-bar').hidden");if(!noSelection)console.error(await app.evaluate('__gestureTrace'));check('Thumbnail scrolling never starts multi-selection',noSelection);
  for(let i=0;i<5&&!await app.evaluate("!document.getElementById('home').hidden");i++){await app.evaluate('rhfilesHandleBack()');await pause(180)}
  await app.click('[data-tile="settings"]');await app.click('[data-settings-section="storage"]');check('Settings are separated into real categories',await app.evaluate("!document.querySelector('[data-settings-panel=storage]').hidden&&document.querySelector('[data-settings-panel=display]').hidden"));
  app.adb('shell','wm','size','1280x900');app.adb('shell','wm','density','160');try{await until(()=>app.evaluate("document.body.classList.contains('wide-layout')"),'tablet layout');}catch(error){console.error(await app.evaluate('({width:innerWidth,height:innerHeight,screen:screen.width,dpr:devicePixelRatio,wide:document.body.className})'));throw error;}
  await until(()=>app.evaluate("document.getElementById('title').textContent==='设置'&&!document.querySelector('[data-settings-panel=storage]').hidden"),'restored Settings category',70000);
  check('Android window resize preserves current settings category',true);await app.screenshot('tablet-settings');
  await app.evaluate("window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:{hinge:{separating:true,orientation:'vertical',bounds:{left:.48,right:.52,top:0,bottom:1}}}}))");
  check('Fold geometry keeps content clear of the hinge',await app.evaluate("document.getElementById('app').getBoundingClientRect().left>=innerWidth*.52"));await app.screenshot('fold-settings');
  await app.evaluate("window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:{}}))");
  console.log(JSON.stringify({pass:true,checks:checks.length,artifacts:app.artifactDir}));
}finally{app.adb('shell','wm','size','reset');app.adb('shell','wm','density','reset');app.close();}
