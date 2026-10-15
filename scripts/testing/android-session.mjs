// Android device integration tests are emulator-only: never select a user's phone.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {root} from './source.mjs';

export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(check,label,timeout=20000){
  const end=Date.now()+timeout;let last;
  while(Date.now()<end){try{const result=await check();if(result)return result;}catch(error){last=error;}await pause(100);}
  throw Error(`Timed out: ${label}${last?' — '+last.message:''}`);
}
export async function androidSession(serial=process.env.RHFILES_TEST_EMULATOR || 'emulator-5582') {
  if(!/^emulator-\d+$/.test(serial))throw Error('Android test harness accepts only an explicit emulator serial, never a phone.');
  const sdk=process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  if(!sdk)throw Error('ANDROID_SDK_ROOT / ANDROID_HOME is required.');
  const executable=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
  const adb=(...args)=>{
    const result=spawnSync(executable,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000});
    if(result.error || result.status!==0)throw Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };
  if(adb('shell','getprop','ro.kernel.qemu')!=='1')throw Error('Refusing to mutate a non-emulator device.');
  const packageId='com.railgunhamster.rhfiles';
  // A standard Android Activity can have multiple live WebViews. Starting a
  // second MainActivity then connecting to the old background CDP page gives
  // false gesture failures. Restart only this emulator's app, preserving data.
  adb('shell','am','force-stop',packageId);
  adb('shell','am','start','-W','-n',packageId+'/.MainActivity');
  if(adb('shell','dumpsys','window').includes('Application Not Responding'))throw Error('The emulator has an Android ANR dialog; recover the emulator before UI assertions.');
  const pid=await until(()=>adb('shell','pidof',packageId),'app process');
  const port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  let socket;
  const pending=new Map(),events=[];let requestId=0;
  const artifactDir=fs.mkdtempSync(path.join(root,'test-artifacts','android-'));
  const close=()=>{
    socket?.close();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Android session closed'));}pending.clear();
    adb('forward','--remove','tcp:'+port);
    fs.writeFileSync(path.join(artifactDir,'events.json'),JSON.stringify(events,null,2));
  };
  try {
    const target=await until(async()=>{
      const targets=await (await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(1500)})).json();
      return targets.find(t=>t.type==='page' && /^https?:\/\/tauri\.localhost\//.test(t.url));
    },'debug WebView (install a debug APK)');
    socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open');
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(message.method)events.push(message);
      const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);
      message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++requestId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
      const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    await send('Runtime.enable');
    await until(()=>evaluate('typeof api!=="undefined" && typeof ui!=="undefined" && document.readyState==="complete"'),'frontend ready');
    // DOMContentLoaded precedes the async native capabilities/storage bootstrap.
    // Testing before handlers exist produces false gesture/feature failures.
    await until(()=>evaluate('typeof window.rhfilesHandleBack==="function" && ["home","filelist","tool-page"].some(id=>!document.getElementById(id).hidden)'),'native bridge and initial navigation ready',70000);
    const click=async selector=>{
      const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden element');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await pause(150);
    };
    const swipe=async(x1,y1,x2,y2)=>{
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});
      for(let i=1;i<=10;i++){
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/10,y:y1+(y2-y1)*i/10}]});await pause(20);
      }
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await pause(200);
    };
    const screenshot=async name=>{
      const data=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifactDir,name+'.png'),Buffer.from(data.data,'base64'));
    };
    return {adb,evaluate,send,click,swipe,screenshot,events,artifactDir,serial,close};
  }catch(error){close();throw error;}
}
