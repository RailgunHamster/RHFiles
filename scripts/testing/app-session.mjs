// Real debug RHFiles + WebView2, with an isolated profile and a private CDP port.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {root} from './source.mjs';

export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(check,label,timeout=15000) {
  const end=Date.now()+timeout;let last;
  while(Date.now()<end){try{const value=await check();if(value)return value;}catch(e){last=e;}await sleep(100);}
  throw Error(`Timed out: ${label}${last?' — '+last.message:''}`);
}
export async function launchApp() {
  if(process.platform!=='win32')throw Error('Real RHFiles E2E requires Windows and WebView2');
  const executable=path.join(root,'target/debug/rhfiles.exe');
  if(!fs.existsSync(executable))throw Error('Build first: cargo build -p rhfiles-tauri --locked');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-e2e-'));
  const profileRoot=path.join(directory,'profile');
  const artifactDir=path.join(root,'test-artifacts',path.basename(directory));fs.mkdirSync(artifactDir,{recursive:true});
  const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const child=spawn(executable,[],{cwd:directory,windowsHide:true,env:{...process.env,
    RHFILES_TEST_PROFILE_ROOT:profileRoot,RHFILES_TEST_DESKTOP_ID:'e2e-isolated',RHFILES_CDP_PORT:String(port),RHFILES_AUTORUN_TESTS:'0'}});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  let spawnError;child.on('error',e=>spawnError=e);
  let socket;let next=0;const pending=new Map(),events=[];
  const close=()=>{
    socket?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Session closed'));}pending.clear();
    // Only the PID this fixture spawned and its private WebView children.
    if(child.pid && child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    fs.writeFileSync(path.join(artifactDir,'app.log'),output);
    fs.writeFileSync(path.join(artifactDir,'page-events.json'),JSON.stringify(events,null,2));
  };
  try {
    const target=await until(async()=>{
      if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('Test app exited before startup');
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)});
      return (await response.json()).find(t=>t.type==='page' && /\/(index\.html)?$/.test(new URL(t.url).pathname));
    },'isolated app startup',30000);
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await Promise.race([once(socket,'open'),sleep(5000).then(()=>{throw Error('CDP connection timeout');})]);
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(message.method)events.push(message);
      const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);
      if(message.error)p.reject(Error(JSON.stringify(message.error)));else p.resolve(message.result);
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},30000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
      const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
      return response.result?.value;
    };
    await send('Runtime.enable');
    await until(()=>evaluate('typeof getTab === "function" && typeof call === "function" && typeof G !== "undefined" && G.startupReady===true'),'frontend ready',30000);
    const profile=await evaluate("call('get_instance_profile')");
    // Abort before any test mutations if a release binary ignored test isolation.
    for(const directory of [profile.dataDirectory,profile.webviewDirectory]){
      const relative=path.relative(profileRoot,directory||'');
      if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Unsafe profile: '+JSON.stringify(profile));
    }
    await evaluate('G.settings.autoUpdateEnabled=false;G.settings.adaptiveLayout=false;G.settings.previewEnabled=false;true');
    const screenshot=async name=>{
      const result=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(artifactDir,name+'.png'),Buffer.from(result.data,'base64'));
    };
    const point=selector=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Element missing');const r=el.getBoundingClientRect();if(!r.width||!r.height)throw Error('Element hidden');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const click=async selector=>{
      const p=await point(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
    };
    const drag=async(source,target,drop)=>{
      const from=await point(source),to=await point(target);events.length=0;
      await send('Input.setInterceptDrags',{enabled:true});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',...from});
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
      try {
        for(let i=1;i<=12 && !events.some(e=>e.method==='Input.dragIntercepted');i++){
          await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12,button:'left',buttons:1});await sleep(40);
        }
        const intercepted=await until(()=>events.find(e=>e.method==='Input.dragIntercepted'),'real drag start',3000);
        const data=intercepted.params.data;
        await send('Input.dispatchDragEvent',{type:'dragEnter',...to,data});
        // Hover exceeds the product's 480 ms tab-switch delay; keep drag alive.
        for(let i=0;i<8;i++){await send('Input.dispatchDragEvent',{type:'dragOver',...to,data});await sleep(100);}
        const end=await point(drop);await send('Input.dispatchDragEvent',{type:'dragOver',...end,data});
        await send('Input.dispatchDragEvent',{type:'drop',...end,data});
      } finally {
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',clickCount:1});
        await send('Input.setInterceptDrags',{enabled:false});
      }
    };
    return {directory,artifactDir,profile,close,evaluate,send,events,screenshot,click,drag};
  } catch(e){close();throw e;}
}
