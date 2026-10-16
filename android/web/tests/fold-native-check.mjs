// Real native display geometry + Android emulator fold/unfold, never a phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {androidSession,until,pause} from '../../../scripts/testing/android-session.mjs';
const device=await androidSession();let checks=0;
// Some generic API 36 images report CLOSED without configuring a cover display.
// Explicit opt-in tests real Android configuration/metrics via wm size instead;
// it is NOT counted as automatic hardware cover-screen switching.
const geometry=process.env.RHFILES_TEST_FOLD_GEOMETRY?.split(',');
if(geometry&&!(geometry.length===2&&geometry.every(size=>/^[1-9][0-9]{1,4}x[1-9][0-9]{1,4}$/.test(size)))){device.close();throw Error('Expected outer,inner geometry, e.g. 884x2208,1768x2208');}
const resize=closed=>{if(geometry)device.adb('shell','wm','size',geometry[closed?0:1]);};
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);};
const layout=()=>device.evaluate("api.native('window.layout')");
const mode=()=>device.evaluate("document.getElementById('workbench')?.dataset.mode");
async function tapPane(selector,label){
 const point=await device.evaluate(`(()=>{const frame=[...document.querySelectorAll('.file-pane')].find(f=>!f.hidden),doc=frame?.contentDocument;const node=${label?`[...doc.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(label)})`:`doc?.querySelector(${JSON.stringify(selector)})`};if(!node)throw Error('Missing pane control');const a=frame.getBoundingClientRect(),r=node.getBoundingClientRect();return {x:a.x+r.x+r.width/2,y:a.y+r.y+r.height/2};})()`);
 await device.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await device.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(200);
}
async function choose(value){
 await tapPane('#btn-overflow');await tapPane('#sheet .sheet-item','分屏布局');
 await until(()=>device.evaluate("!document.getElementById('sheet').hidden"),'native layout sheet');
 await device.click(`[data-layout=${value}]`);await until(async()=>(await mode())===value,'native selected layout '+value);
}
async function fold(closed,expectedKey,expectedMode){
 device.adb('emu',closed?'fold':'unfold');device.adb('shell','input','keyevent','KEYCODE_WAKEUP');
 resize(closed);
 await until(async()=>{const current=await layout();return current.screenKey===expectedKey;},'native '+(closed?'folded':'unfolded')+' display identity',60000);
 await until(async()=>(await mode())===expectedMode,'remembered '+expectedMode+' layout',60000);
}
try {
 device.adb('emu','unfold');device.adb('shell','input','keyevent','KEYCODE_WAKEUP');await pause(1000);
 resize(false);await pause(1000);
 const inner=(await layout()).screenKey;check(/^screen-/.test(inner),'native maximum-window screen identity is available');
 await choose('columns');await device.screenshot('inner-columns');
 // Both routes are changed via production UI controls, not test-only setters.
 await tapPane('[data-tile=downloads]');await until(()=>device.evaluate("[...document.querySelectorAll('.file-pane')].some(f=>f.contentWindow.rhfilesPane?.snapshot().route.boundaryLabel==='下载')"),'first pane Downloads');
 const routes=await device.evaluate("[...document.querySelectorAll('.file-pane')].map(f=>f.contentWindow.rhfilesPane.snapshot().route)");
 device.adb('emu','fold');device.adb('shell','input','keyevent','KEYCODE_WAKEUP');
 resize(true);
 const outer=await until(async()=>{const value=(await layout()).screenKey;return value&&value!==inner&&value;},'distinct native outer display identity',60000);
 check(outer!==inner,geometry?'Android system geometry override changes the native profile (explicit emulator workaround)':'physical fold changes the native display profile without a synthetic JS event');
 await choose('single');await device.screenshot('outer-single');
 for(let i=0;i<2;i++){
  await fold(false,inner,'columns');await fold(true,outer,'single');
 }
 await fold(false,inner,'columns');
 const restored=await device.evaluate("[...document.querySelectorAll('.file-pane')].map(f=>f.contentWindow.rhfilesPane.snapshot().route)");
 check(restored.length===2&&restored.every((route,i)=>route.screen===routes[i].screen&&route.path===routes[i].path&&route.boundary===routes[i].boundary),'repeated native display changes preserve both pane routes');
 await choose('rows');await fold(true,outer,'single');await fold(false,inner,'rows');
 check(await mode()==='rows','changing the inner direction does not overwrite outer single-pane');
 const saved=await device.evaluate("JSON.parse(localStorage.getItem('rhfiles.panes.screens'))");
 check(saved.screens[inner]==='rows'&&saved.screens[outer]==='single','both preferences are durably stored');
 fs.writeFileSync(path.join(device.artifactDir,'fold-result.json'),JSON.stringify({inner,outer,saved,checks,geometryOverride:geometry||null},null,2));
 console.log('PASS '+checks+' native fold checks. Evidence: '+device.artifactDir);
} catch(error){await device.screenshot('fold-failure').catch(()=>{});throw error;}finally{try{if(geometry)device.adb('shell','wm','size','reset');}finally{device.close();}}
