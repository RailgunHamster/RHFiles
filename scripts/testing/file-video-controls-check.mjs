import path from 'node:path';import assert from 'node:assert/strict';import {browserFixture} from '../../android/web/tests/browser-fixture.mjs';
const fixture=await browserFixture(path.resolve('src')),context=await fixture.browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{
 const s=window.qa={generation:1,selection:1,index:0,kind:'video',mode:'paged',entries:[{path:'D:\\a.mp4',name:'a.mp4'},{path:'D:\\b.mp4',name:'b.mp4'}],fullscreen:false,calls:[],events:{},volumeWait:[],blockVolume:false,seekWait:[],blockSeek:false};
 s.video={opened:true,inputId:1,volume:50,state:3,positionMs:20000,durationMs:120000,renderedFrames:10,rate:1};localStorage.setItem('rhfiles-settings',JSON.stringify({videoSeekSeconds:5}));
 window.__TAURI__={core:{convertFileSrc:path=>path,invoke:async(command,{action,args={}}={})=>{
  if(command!=='file_viewer_request')return {};
  s.calls.push({action,args});
  const snapshot=()=>JSON.parse(JSON.stringify(s.video));
  const session=()=>({generation:s.generation,selection:s.selection,index:s.index,kind:s.kind,mode:s.mode,entries:s.entries});
  if(action==='state')return session();
  if(action==='window.state')return {maximized:true,fullscreen:s.fullscreen};
  if(action==='video.open'||action==='video.state')return snapshot();
  if(action==='video.bounds'){s.bounds=args;return {updated:true,visible:s.video.renderedFrames>0};}
  if(action==='video.control'){
   if(args.expectedInput!==s.video.inputId)throw Error('Stale input');
   if(args.command==='volume'){
    if(s.blockVolume)await new Promise(resolve=>s.volumeWait.push(resolve));
    if(args.expectedInput!==s.video.inputId)throw Error('Stale input');
    s.video.volume=args.value;
   }
   if(args.command==='seek'){
    if(s.blockSeek)await new Promise(resolve=>s.seekWait.push(resolve));
    if(args.expectedInput!==s.video.inputId)throw Error('Stale input');
    s.video.positionMs=args.value;
   }
   if(args.command==='pause')s.video.state=4;
   if(args.command==='resume')s.video.state=3;
   if(args.command==='rate')s.video.rate=args.value;
   return snapshot();
  }
  if(action==='select'){s.index=args.index;s.selection++;s.video.inputId++;return session();}
  if(action==='close')return {closed:true};
  throw Error('Unexpected '+action);
 }},window:{getCurrentWindow:()=>({isFullscreen:async()=>s.fullscreen,setFullscreen:async value=>s.fullscreen=value})},event:{listen:async(name,fn)=>s.events[name]=fn}};
});
const call=(name,args={})=>page.evaluate(({name,args})=>RHFilesAPI.invoke('media.viewer.'+name,args),{name,args});let checks=0;const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);};
try{
 await page.goto(fixture.url+'/file-viewer.html');await page.waitForFunction(()=>RHFilesAPI.snapshot().state.application?.ready&&qa.bounds);
 const viewport=page.locator('#viewport');await viewport.dispatchEvent('wheel',{deltaY:-100});await page.waitForFunction(()=>qa.video.volume===55);check((await call('state')).index===0,'wheel raises volume without changing file');await viewport.dispatchEvent('wheel',{deltaY:100});await page.waitForFunction(()=>qa.video.volume===50);check(await page.locator('#video-volume-value').textContent()==='50%','wheel lowers volume and shows percentage');
 await page.locator('#volume').evaluate(n=>{n.value='37';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>qa.video.volume===37);check(true,'input changes native volume before pointer release/change');
 await page.evaluate(()=>{qa.blockVolume=true;const n=document.getElementById('volume');for(let i=40;i<=60;i++){n.value=String(i);n.dispatchEvent(new Event('input',{bubbles:true}));}});await page.waitForFunction(()=>qa.volumeWait.length===1);let before=await page.evaluate(()=>qa.calls.filter(c=>c.action==='video.control'&&c.args.command==='volume').length);await page.evaluate(()=>{qa.blockVolume=false;qa.volumeWait.shift()();});await page.waitForFunction(()=>qa.video.volume===60);const after=await page.evaluate(()=>qa.calls.filter(c=>c.action==='video.control'&&c.args.command==='volume').length);check(after-before<=1,'rapid slider events coalesce to the latest volume without flooding IPC');check((await call('state')).video.volume===60,'latest volume remains authoritative');
 await viewport.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>qa.video.positionMs===25000);await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>qa.video.positionMs===20000);check((await call('state')).index===0,'arrow keys seek five seconds instead of switching videos');
 const rate=page.locator('#rate');
 await page.keyboard.press('Shift+Equal');await page.waitForFunction(()=>qa.video.rate===1.25);
 check(await rate.inputValue()==='1.25','main keyboard + increases playback speed and updates the selector');
 await page.keyboard.press('NumpadAdd');await page.keyboard.press('Equal');await page.waitForFunction(()=>qa.video.rate===2);
 const rateChanges=()=>page.evaluate(()=>qa.calls.filter(c=>c.action==='video.control'&&c.args.command==='rate').map(c=>c.args.value));
 assert.deepEqual(await rateChanges(),[1.25,1.5,2]);
 await page.keyboard.press('NumpadAdd');
 await rate.focus();await page.keyboard.press('NumpadSubtract');await page.keyboard.press('Minus');await page.waitForFunction(()=>qa.video.rate===1.25);
 check(JSON.stringify(await rateChanges())==='[1.25,1.5,2,1.5,1.25]','main keyboard and keypad step down from the focused selector and clamp at the upper preset');
 await call('video.control',{command:'rate',value:0.6});check(await rate.inputValue()==='0.6','the selector displays an API-set speed between presets');
 await page.keyboard.press('Minus');await page.waitForFunction(()=>qa.video.rate===0.5);
 await page.keyboard.press('NumpadSubtract');await page.keyboard.press('Equal');await page.waitForFunction(()=>qa.video.rate===0.75);
 check(JSON.stringify((await rateChanges()).slice(-3))==='[0.6,0.5,0.75]','the lower preset clamps and stepping resumes in the opposite direction');
 await viewport.focus();
 await page.evaluate(()=>localStorage.setItem('rhfiles-settings',JSON.stringify({videoSeekSeconds:12})));await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>qa.video.positionMs===32000);check((await call('state')).videoSeekSeconds===12,'seek interval follows configuration');await call('video.skip',{seconds:-600});check((await call('state')).video.positionMs===0,'seeking clamps at start');await call('video.skip',{seconds:600});check((await call('state')).video.positionMs===120000,'seeking clamps at end');
 const slider=page.locator('#seek'),box=await slider.boundingBox(),y=box.y+box.height/2;
 const moveSeek=(ratio,steps=1)=>page.mouse.move(box.x+box.width*ratio,y,{steps});
 const seekCalls=()=>page.evaluate(()=>qa.calls.filter(c=>c.args.command==='seek').map(c=>c.args));
 await page.waitForFunction(()=>document.getElementById('seek').value==='1000');
 await moveSeek(.25);await page.mouse.down();
 await page.waitForFunction(()=>qa.video.positionMs>24000&&qa.video.positionMs<36000);
 await moveSeek(.65,8);
 await page.waitForFunction(()=>qa.video.positionMs>72000&&qa.video.positionMs<84000);
 check(true,'trusted pointer input jumps twice while the button remains held');
 await page.evaluate(()=>qa.blockSeek=true);
 await moveSeek(.55);
 await page.waitForFunction(()=>qa.seekWait.length===1);
 const sent=(await seekCalls()).length;
 await moveSeek(.35,15);await moveSeek(.85,15);
 assert.equal((await seekCalls()).length,sent,'the decoder receives at most one in-flight scrub request');
 const finalPosition=Math.round(Number(await slider.inputValue())*120);
 await page.mouse.up();
 await page.evaluate(()=>{qa.blockSeek=false;qa.seekWait.shift()();});
 await page.waitForFunction(target=>qa.video.positionMs===target,finalPosition);
 await page.waitForFunction(target=>document.getElementById('position').textContent===
  Math.floor(target/60000)+':'+String(Math.floor(target/1000)%60).padStart(2,'0'),finalPosition);
 assert.deepEqual((await seekCalls()).slice(sent).map(c=>c.value),[finalPosition]);
 check(true,'release keeps the final target without replaying intermediate seeks or issuing a duplicate');
 await slider.press('Home');await page.waitForFunction(()=>qa.video.positionMs===0);
 check(true,'the focused progress control still seeks with the keyboard');
 await page.locator('#volume').focus();await page.keyboard.press('f');await page.waitForFunction(()=>qa.fullscreen&&document.body.classList.contains('video-fullscreen'));check(await viewport.evaluate(n=>n.getBoundingClientRect().width===innerWidth&&n.getBoundingClientRect().height===innerHeight),'F enters a full video viewport even after editing volume');await page.mouse.move(500,400);await page.waitForFunction(()=>qa.bounds.clipTop>0&&qa.bounds.clipBottom>0);check(true,'visible controls get native surface cutouts without resizing video');await page.waitForFunction(()=>!document.body.classList.contains('video-controls-visible'),{},{timeout:5000});await page.waitForFunction(()=>qa.bounds.clipTop===0&&qa.bounds.clipBottom===0);check(true,'controls hide and video uses the entire native surface');await page.keyboard.press('F');await page.waitForFunction(()=>!qa.fullscreen);check(!await page.locator('body').evaluate(n=>n.classList.contains('video-fullscreen')),'uppercase F exits fullscreen');await page.keyboard.press('f');await page.keyboard.press('Escape');await page.waitForFunction(()=>!qa.fullscreen);check(!await page.evaluate(()=>qa.calls.some(c=>c.action==='close')),'Escape leaves fullscreen without closing the viewer');
 check(errors.length===0,'no uncaught errors: '+errors.join('; '));console.log('PASS '+checks+' file-video control checks');
}finally{await fixture.close();}
