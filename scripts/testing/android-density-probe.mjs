import {androidSession,until} from './android-session.mjs';
import assert from 'node:assert/strict';
const app=await androidSession();
const stats=()=>app.evaluate('({width:innerWidth,screen:screen.width,dpr:devicePixelRatio,scale:visualViewport.scale,meta:document.querySelector("meta[name=viewport]").content})');
try{
  await app.click('[data-tile="settings"]');await app.click('[data-settings-section="storage"]');
  console.log('before',await stats());app.adb('shell','wm','size','1280x900');app.adb('shell','wm','density','160');
  const after=await until(async()=>{const value=await stats();return value.dpr===1&&Math.abs(value.width-value.screen)<3&&value},'density-adjusted viewport');console.log('after',after);
  assert.ok(Math.abs(after.width-after.screen)<3,'WebView must not keep its old density-scaled CSS viewport');
  await until(()=>app.evaluate("document.getElementById('title').textContent==='设置'&&!document.querySelector('[data-settings-panel=storage]').hidden"),'restored Settings category',70000);
  console.log('PASS — Density change preserves current route/category');
  console.log('layout',await app.evaluate("(()=>{const b=document.querySelector('.topbar').getBoundingClientRect(),t=document.getElementById('title').getBoundingClientRect();return{bar:{width:b.width,height:b.height},title:{width:t.width,height:t.height},font:getComputedStyle(document.getElementById('title')).fontSize,scale:visualViewport.scale}})()"));
  await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await app.screenshot('density-native');console.log(app.artifactDir);
}finally{app.adb('shell','wm','size','reset');app.adb('shell','wm','density','reset');app.close();}
