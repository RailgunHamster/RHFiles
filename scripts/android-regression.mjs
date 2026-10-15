// Real Android/WebView regression. Deliberately refuses all physical-device serials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {androidSession, until, pause} from './testing/android-session.mjs';

const baseline=process.argv.includes('--baseline');
const app=await androidSession();
const results=[];
const record=(label,ok,details)=>{
  results.push({label,pass:Boolean(ok),details});
  console.log((ok?'PASS':baseline?'BASELINE BUG':'FAIL')+' — '+label+(details?' — '+JSON.stringify(details):''));
};
const visible=id=>app.evaluate(`!document.getElementById(${JSON.stringify(id)}).hidden`);
try {
  console.log('Emulator only: '+app.serial+'; evidence: '+app.artifactDir);
  if(!await visible('home')){await app.click('#btn-menu');await app.click('#nav-home');}
  await until(()=>app.evaluate("!!document.querySelector('[data-tile=storage-0]')"),'Home storage tile');
  await app.screenshot('home-before');
  const dimensions=await app.evaluate('({width:innerWidth,height:innerHeight})');
  await app.swipe(45,250,Math.min(280,dimensions.width-20),250);
  const drawerOpened=await visible('drawer');record('Home right swipe opens drawer',drawerOpened);
  if(drawerOpened) {
    await app.screenshot('drawer-open');
    const drawerWidth=await app.evaluate("document.getElementById('drawer').getBoundingClientRect().width");
    await app.swipe(drawerWidth-25,270,25,270);record('Drawer left swipe closes drawer',!await visible('drawer'));
    if(await visible('drawer'))await app.click('#drawer-close');
  }
  await app.click('[data-tile="storage-0"]');
  await until(()=>visible('filelist'),'internal storage listing');
  await app.evaluate(`(()=>{
    window.__qa={hides:0,renders:0};
    new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'&&r.oldValue===null)window.__qa.hides++;if(r.type==='childList')window.__qa.renders++;}}).observe(document.getElementById('filelist'),{attributes:true,attributeFilter:['hidden'],attributeOldValue:true,childList:true});
  })()`);
  await pause(2500);
  record('Idle directory remains visible',await app.evaluate('__qa.hides===0'),await app.evaluate('({...__qa})'));
  await app.evaluate('window.__qa.hides=0;window.__qa.renders=0;true');
  for(let i=0;i<8;i++){await app.evaluate("window.dispatchEvent(new Event('rhfiles-storage-changed'));true");await pause(180);}
  await pause(1500);
  const refresh=await app.evaluate('({...__qa})');
  record('Repeated storage notifications do not clear/rebuild an unchanged listing',refresh.hides===0&&refresh.renders===0,refresh);
  await app.screenshot('directory-after-notifications');
  const root=await app.evaluate("api.storageRoots().then(roots=>roots.find(r=>!r.removable).path)");
  const folder=root+'/RHFiles-QA-'+Date.now(),nested=folder+'/child';
  if(!baseline){
    app.adb('shell','mkdir','-p',nested);
    // Real UI navigation, so directory history and the native Back dispatcher participate.
    await app.click('#btn-refresh');await until(()=>visible('filelist'),'refreshed root');
    const index=await app.evaluate(`api.listDir({path:${JSON.stringify(root)}}).then(listing=>fmt.shapeEntries(listing.entries,{sort:localStorage.getItem('rhfiles.sort')||'name',showHidden:localStorage.getItem('rhfiles.hidden')==='1'}).findIndex(entry=>entry.path===${JSON.stringify(folder)}))`);
    assert.ok(index>=0,'Real backend must enumerate the new fixture');
    await app.evaluate(`(()=>{const list=document.getElementById('filelist'),grid=list.classList.contains('grid'),columns=grid?Math.max(2,Math.floor(list.clientWidth/112)):1;list.scrollTop=Math.floor(${index}/columns)*(grid?136:64);list.dispatchEvent(new Event('scroll'));})()`);
    await until(()=>app.evaluate(`!!document.querySelector('[data-path="${folder}"]')`),'QA fixture visible');
    await app.click(`[data-path="${folder}"]`);await until(()=>app.evaluate(`!!document.querySelector('[data-path="${nested}"]')`),'QA folder');
    await app.click(`[data-path="${nested}"]`);await until(()=>app.evaluate("document.getElementById('title').textContent==='child'"),'nested folder');
  }
  const size=app.adb('shell','wm','size').match(/(\d+)x(\d+)/);assert.ok(size);
  const width=Number(size[1]),height=Number(size[2]);
  // Exercise the system edge recognizer, not a synthetic DOM keydown.
  app.adb('shell','cmd','overlay','enable','--user','0','com.android.internal.systemui.navbar.gestural');
  await pause(500);
  app.adb('shell','input','swipe',String(width-1),String(Math.floor(height*.55)),String(width-280),String(Math.floor(height*.55)),'350');
  await pause(1000);
  const resumed=app.adb('shell','dumpsys','activity','activities').split('\n').find(line=>line.includes('topResumedActivity')) || '';
  const title=resumed.includes('com.railgunhamster.rhfiles') ? await app.evaluate("document.getElementById('title').textContent") : '(app left foreground)';
  record('System edge Back returns to the parent without leaving the app',resumed.includes('com.railgunhamster.rhfiles')&&title===(baseline?'RHFiles':path.posix.basename(folder)),{title,resumed:resumed.trim()});
  if(!baseline) {
    app.adb('shell','input','keyevent','4');await pause(500);
    record('Next Back reaches storage root',await app.evaluate("document.getElementById('title').textContent==='内部存储'"));
    app.adb('shell','input','keyevent','4');await pause(500);
    record('Storage root Back reaches Home',await visible('home'));
    await app.click('[data-tile="settings"]');await until(()=>visible('tool-settings'),'Settings');
    app.adb('shell','input','keyevent','4');await pause(500);record('Settings Back reaches Home',await visible('home'));
    await app.click('#btn-menu');app.adb('shell','input','keyevent','4');await pause(300);
    record('Back closes drawer before leaving Home',!await visible('drawer')&&await visible('home'));
    await app.screenshot('home-after-back');
    app.adb('shell','input','swipe','1',String(Math.floor(height*.55)),'280',String(Math.floor(height*.55)),'350');
    await pause(700);
    const top=app.adb('shell','dumpsys','activity','activities').split('\n').find(line=>line.includes('topResumedActivity')) || '';
    record('Only Back from Home leaves the app',!top.includes('com.railgunhamster.rhfiles'),top.trim());
  }
} finally {
  await app.screenshot('final-state').catch(()=>{});
  fs.writeFileSync(path.join(app.artifactDir,'regression.json'),JSON.stringify({baseline,results},null,2));
  app.close();
}
if(!baseline)assert.equal(results.filter(r=>!r.pass).length,0,'Android device regression failures');
