#!/usr/bin/env node
// Local command-line JSON-RPC client. Requires Node 22+, no npm packages.
// CDP/ADB debugging is an explicit, powerful local opt-in, never a LAN service.
import {randomUUID,randomInt} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';

export class ClientError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
function trace(stage,details={}){if(process.env.RHFILES_CLI_TRACE==='1')process.stderr.write(JSON.stringify({rhfilesClientTrace:stage,atMs:Math.round(performance.now()),...details})+'\n');}
export function parseArguments(argv){
  const options={pane:'active',port:9222,timeout:30000},position=[];
  const valueOptions=new Set(['port','endpoint','target','window','pane','android','adb','scope','key','timeout','launch']);
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];if(arg==='--wait'){options.wait=true;continue;}if(arg==='--help'||arg==='-h'){options.help=true;continue;}
    if(arg.startsWith('--')){const name=arg.slice(2);if(!valueOptions.has(name))throw new ClientError('INVALID_ARGUMENT','Unknown option: '+arg);if(i+1>=argv.length||argv[i+1].startsWith('--'))throw new ClientError('INVALID_ARGUMENT','Missing value for '+arg);options[name]=argv[++i];}
    else position.push(arg);
  }
  for(const name of ['port','timeout']){options[name]=Number(options[name]);if(!Number.isSafeInteger(options[name])||options[name]<1||options[name]>(name==='port'?65535:300000))throw new ClientError('INVALID_ARGUMENT','Invalid '+name);}
  if(!['active','host','left','right','first','second'].includes(options.pane))throw new ClientError('INVALID_ARGUMENT','Unknown pane');
  if(options.scope&&!['main','reader'].includes(options.scope))throw new ClientError('INVALID_ARGUMENT','Use main or reader scope');
  if(options.android&&options.launch)throw new ClientError('INVALID_ARGUMENT','--launch is desktop-only; this client never installs or starts a phone app');
  return {options,position};
}
export function endpointUrl(value){
  let url;try{url=new URL(value);}catch{throw new ClientError('INVALID_ENDPOINT','Expected a loopback HTTP endpoint');}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new ClientError('INVALID_ENDPOINT','Only an unauthenticated loopback HTTP base URL is permitted');
  return url.origin;
}
export function requestFor(position,key=randomUUID()){
  const [command='help',...args]=position,id=randomUUID(),request={jsonrpc:'2.0',id};
  const parse=value=>{try{return JSON.parse(value??'{}');}catch{throw new ClientError('INVALID_ARGUMENT','Arguments must be valid JSON');}};
  if(command==='list'){if(args.length)throw new ClientError('INVALID_ARGUMENT','list takes no arguments');return {...request,method:'actions.list',params:{}};}
  if(command==='state'&&!args.length)return {...request,method:'state.get',params:{}};
  if(command==='info'&&!args.length)return {...request,method:'api.describe',params:{}};
  if(command==='describe'&&args.length===1)return {...request,method:'actions.describe',params:{action:args[0]}};
  if(command==='run'&&args.length>=1&&args.length<=2)return {...request,method:'actions.run',params:{action:args[0],args:parse(args[1]),key}};
  if(command==='status'&&args.length===1)return {...request,method:'runs.status',params:{runId:args[0]}};
  if(command==='lookup'&&args.length===1)return {...request,method:'runs.lookup',params:{key:args[0]}};
  if(command==='wait'&&args.length===1)return {...request,method:'runs.wait',params:{runId:args[0],timeoutMs:30000}};
  if(command==='ui'&&!args.length)return {...request,method:'actions.run',params:{action:'ui.list',args:{},key}};
  throw new ClientError('INVALID_ARGUMENT','Use info, list, describe ACTION, run ACTION [JSON], status RUN_ID, wait RUN_ID, state, ui or batch');
}
export function expressionFor(request,pane='active'){
  // User text is only a JSON string, never a JavaScript expression/function.
  return '(()=>{const api=globalThis.RHFilesAPI;if(!api)throw Error("RHFiles action API is not loaded");const target=api.forPane?api.forPane('+JSON.stringify(pane)+'):api;return target.rpc(JSON.parse('+JSON.stringify(JSON.stringify(request))+'));})()';
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function cdpSession(target,timeout){
  const url=new URL(target.webSocketDebuggerUrl);
  if(url.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw new ClientError('INVALID_ENDPOINT','Refusing a non-loopback WebSocket');
  const socket=new WebSocket(url);let next=0,closed=false;const pending=new Map();
  const rejectAll=()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(new ClientError('CONNECTION_LOST','Connection lost; a submitted action may still be running. Query its key/run; never blindly repeat it.'));}pending.clear();};
  socket.addEventListener('message',event=>{let value;try{value=JSON.parse(event.data);}catch{return;}const item=pending.get(value.id);if(!item)return;pending.delete(value.id);clearTimeout(item.timer);value.error?item.reject(new ClientError('CDP_ERROR',value.error.message)):item.resolve(value.result);});
  socket.addEventListener('close',()=>{closed=true;rejectAll();});socket.addEventListener('error',()=>rejectAll());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(new ClientError('CONNECTION_TIMEOUT','Local DevTools connection timed out'));},timeout);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new ClientError('CONNECTION_FAILED','Cannot connect to the local app target'));},{once:true});});
  const send=(method,params,requestTimeout=timeout)=>new Promise((resolve,reject)=>{if(closed)return reject(new ClientError('CONNECTION_LOST','Session is closed'));const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new ClientError('REQUEST_TIMEOUT','Request timed out; the action may still be running. Do not automatically repeat it.'));},requestTimeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  return {send,async evaluate(expression,requestTimeout){const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},requestTimeout);if(value.exceptionDetails)throw new ClientError('API_NOT_READY',value.exceptionDetails.exception?.description||value.exceptionDetails.exception?.value||value.exceptionDetails.text);return value.result?.value;},close(){socket.close();rejectAll();}};
}
export function isAppTargetURL(value,options={}){
  try{
    const u=new URL(value),scope=options.scope||'main';
    if(scope==='reader')return u.hostname==='ebook.rhfiles.local';
    if(['tauri.localhost','localhost'].includes(u.hostname))return true;
    return scope==='main'&&!!options.android&&u.origin==='https://appassets.androidplatform.net'&&u.pathname==='/rhvideo/rhvideo.html'&&!u.username&&!u.password&&!u.search&&!u.hash;
  }catch{return false;}
}
async function selectSession(endpoint,options){
  let targets;try{const response=await fetch(endpoint+'/json/list',{signal:AbortSignal.timeout(options.timeout)});if(!response.ok)throw Error('HTTP '+response.status);targets=await response.json();}catch{throw new ClientError('AUTOMATION_NOT_ENABLED','No local RHFiles automation target. Desktop: start RHFiles with RHFILES_CDP_PORT set. Android: enable ADB automation in Settings.');}
  const receiptTargets=targets.filter(t=>t.type==='page'&&isReceiptTargetURL(t.url));
  targets=targets.filter(t=>t.type==='page'&&isAppTargetURL(t.url,options)&&(!options.target||t.id===options.target));
  if(options.window){const found=[];for(const target of targets){const session=await cdpSession(target,options.timeout);try{const snapshot=await session.evaluate('globalThis.RHFilesAPI?.snapshot()');if(snapshot?.state?.application?.window===options.window)found.push(target);}finally{session.close();}}targets=found;}
  if(targets.length!==1)throw new ClientError('TARGET_REQUIRED',targets.length?'Multiple RHFiles windows: select --target or --window':'No matching RHFiles window is ready',targets.map(t=>({target:t.id,title:t.title,url:t.url})));
  const selected=targets[0],primary=await cdpSession(selected,options.timeout),survivors=receiptTargets.filter(t=>t.id!==selected.id).slice(0,8),receiptSessions=new Map();
  // A self-closing WebView can also delay NEW debugger handshakes. Opt-in wait
  // clients reserve bounded, read-only receipt transports before dispatch; they
  // never send an action to a survivor, and close every transport on exit.
  if(options.wait)await Promise.all(survivors.map(async target=>{try{receiptSessions.set(target.id,await cdpSession(target,Math.min(options.timeout,1000)));}catch{}}));
  return {...primary,receiptTargets:survivors,receiptSessions,close(){primary.close();for(const session of receiptSessions.values())session.close();receiptSessions.clear();}};
}
export function allocateAdbForward(run,remote,{randomPort=()=>20000+randomInt(30000)}={}){
  if(!/^(localabstract:webview_devtools_remote_\d+|tcp:[1-9]\d{0,4})$/.test(remote))throw new ClientError('ADB_FORWARD_FAILED','Invalid local debugging/fixture endpoint');
  for(let attempt=0;attempt<16;attempt++){
    const port=randomPort();if(!Number.isInteger(port)||port<20000||port>=50000)throw new ClientError('ADB_FORWARD_FAILED','Invalid local debugging port');
    try{run(['forward','--no-rebind','tcp:'+port,remote]);return String(port);}
    catch(error){if(!/cannot bind listener|address.*in use|already.*listener|10048/i.test(String(error)))throw error;}
  }
  throw new ClientError('ADB_FORWARD_FAILED','No free local debugging port in the bounded allocation budget');
}
async function connection(options){
  let endpoint=endpointUrl(options.endpoint||'http://127.0.0.1:'+options.port),cleanup=()=>{};
  if(options.android){
    const adb=options.adb||process.env.ADB||'adb',run=args=>execFileSync(adb,['-s',options.android,...args],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
    const processName='com.railgunhamster.rhfiles'+(options.scope==='reader'?':ebook':options.scope==='image'?':image':'');
    let pid;try{pid=run(['shell','pidof',processName]).split(/\s+/)[0];}catch{throw new ClientError('APP_NOT_RUNNING','The selected RHFiles process is not running; open it on the device first');}
    if(!/^\d+$/.test(pid))throw new ClientError('APP_NOT_RUNNING','No valid app process');
    const port=allocateAdbForward(run,'localabstract:webview_devtools_remote_'+pid);
    if(!/^\d+$/.test(port))throw new ClientError('ADB_FORWARD_FAILED','ADB did not allocate a port');
    endpoint='http://127.0.0.1:'+port;cleanup=()=>{try{run(['forward','--remove','tcp:'+port]);}catch{}};
  }
  if(options.launch){const child=spawn(options.launch,[],{windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,RHFILES_CDP_PORT:String(options.port),RHFILES_AUTORUN_TESTS:'0'}});let spawnError;child.on('error',e=>{spawnError=e;});child.unref();const end=Date.now()+options.timeout;while(Date.now()<end){if(spawnError)throw new ClientError('LAUNCH_FAILED',spawnError.message);try{const r=await fetch(endpoint+'/json/list',{signal:AbortSignal.timeout(700)});if(r.ok)break;}catch{}await sleep(150);}}
  try{const session=await selectSession(endpoint,options);return {...session,endpoint,close(){session.close();cleanup();}};}catch(error){cleanup();throw error;}
}
export function isReceiptTargetURL(value){
  try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&['tauri.localhost','localhost'].includes(u.hostname)&&!u.username&&!u.password&&!u.search&&!u.hash&&['/','/index.html','/rhvideo.html','/rhvideo-player.html','/rhvideo-grid.html'].includes(u.pathname);}catch{return false;}
}
// Read only: a disappearing target never authorizes resubmitting its action.
export async function recoverRun(endpoint,options,request,runId,deadline,{fetchTargets=async()=>{const timeout=AbortSignal.timeout(Math.max(1,deadline-Date.now()));const r=await fetch(endpoint+'/json/list',{signal:signal?AbortSignal.any([signal,timeout]):timeout});return r.ok?r.json():[];},openSession=cdpSession,knownTargets=[],signal}={}){
  if(request.method!=='actions.run'||!request.params?.key||Date.now()>=deadline||signal?.aborted)return null;
  const visited=new Set(),eligible=targets=>targets.filter(t=>t.type==='page'&&isReceiptTargetURL(t.url)&&!visited.has(t.id)).filter((t,i,all)=>all.findIndex(other=>other.id===t.id)===i).slice(0,8-visited.size);
  // The connection already enumerated these views. Read them first: destroying
  // a WebView can temporarily stall /json/list without destroying the other
  // views or the process-owned completion. Discover at most once if needed.
  let candidates=eligible(knownTargets),discovered=false;
  while(visited.size<8&&Date.now()<deadline&&!signal?.aborted){
    if(!candidates.length){
      if(discovered)break;discovered=true;
      let targets;try{targets=await fetchTargets();}catch(error){trace('recovery.discoveryFailed',{code:error?.code??error?.name??'READ_FAILED',remainingMs:Math.max(0,deadline-Date.now())});return null;}
      candidates=eligible(targets);trace('recovery.discovered',{targets:candidates.map(t=>t.id),remainingMs:Math.max(0,deadline-Date.now())});
      if(!candidates.length)break;
    }
    for(const [index,target]of candidates.entries()){
      if(Date.now()>=deadline||signal?.aborted)break;let borrowed,abort;
      visited.add(target.id);
      try{
        // Opening and the first read share this target's fair slice. A frozen
        // main view must not consume the entire deadline before a healthy library
        // view can supply the process-owned receipt. Still only one pass, <=8
        // targets, and no resubmission of the original operation.
        const slice=Math.max(1,Math.floor((deadline-Date.now())/(candidates.length-index))),probeDeadline=Math.min(deadline,Date.now()+slice);
        trace('recovery.target',{target:target.id,budgetMs:slice});
        borrowed=await openSession(target,slice);
        if(Date.now()>=probeDeadline||signal?.aborted)continue;
        abort=()=>borrowed.close();signal?.addEventListener('abort',abort,{once:true});
        const query={jsonrpc:'2.0',id:randomUUID(),method:runId?'runs.status':'runs.lookup',params:runId?{runId}:{key:request.params.key}};
        let reply=await borrowed.evaluate(expressionFor(query,'host'),Math.max(1,probeDeadline-Date.now())),receipt=reply?.result;
        trace('recovery.read',{target:target.id,state:receipt?.state??null,code:reply?.error?.data?.code??null,remainingMs:Math.max(0,deadline-Date.now())});
        if(reply?.error?.data?.code==='RESULT_EXPIRED')return {...reply,id:request.id};
        if(!receipt||receipt.action!==request.params.action||runId&&receipt.id!==runId)continue;
        if(options.wait&&receipt.state==='running'&&Date.now()<deadline){reply=await borrowed.evaluate(expressionFor({...query,method:'runs.wait',params:{runId:receipt.id,timeoutMs:Math.min(30000,Math.max(0,deadline-Date.now()-25))}},'host'),Math.max(1,deadline-Date.now()));receipt=reply?.result;trace('recovery.wait',{target:target.id,state:receipt?.state??null,code:reply?.error?.data?.code??null,remainingMs:Math.max(0,deadline-Date.now())});}
        if(reply?.error?.data?.code==='RESULT_EXPIRED')return {...reply,id:request.id};
        if(!receipt||typeof receipt.id!=='string'||!['running','succeeded','failed'].includes(receipt.state)||receipt.state==='succeeded'&&!Object.hasOwn(receipt,'result')||receipt.state==='failed'&&typeof receipt.error?.code!=='string'||receipt.action!==request.params.action||runId&&receipt.id!==runId)continue;
        return {jsonrpc:'2.0',id:request.id,result:receipt};
      }catch(error){trace('recovery.unavailable',{target:target.id,code:error?.code??'READ_FAILED',remainingMs:Math.max(0,deadline-Date.now())});}finally{if(abort)signal?.removeEventListener('abort',abort);borrowed?.close();}
    }
    candidates=[];
  }
  return null;
}
// Both branches only WAIT/READ an accepted run. A self-closing producer may
// stop answering without sending a disconnect event; don't spend the entire
// deadline on it before consulting the surviving process-owned receipt.
export async function waitWithReceipt(primaryWait,completionRead){
  const primary=Promise.resolve().then(primaryWait).then(value=>({value}),error=>({error}));
  const completion=Promise.resolve().then(completionRead).then(value=>value?{value}:null,()=>null);
  const result=await Promise.race([primary.then(async result=>result.error?(await completion)??result:result),completion.then(result=>result??primary)]);
  if(result.error)throw result.error;return result.value;
}
export async function main(argv=process.argv.slice(2),{write=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}){
  const {options,position}=parseArguments(argv),command=position[0];
  if(options.help||!command||command==='help'){write({apiVersion:'1.0',requires:'Node.js 22+',usage:'node scripts/rhfiles-api.mjs [--port 9222 | --android SERIAL] [--pane active|left|right|host] list|describe ACTION|run ACTION JSON|status RUN_ID|wait RUN_ID|state|ui|batch',examples:['run navigation.open {"path":"D:\\\\Data"}','run selection.set {"paths":["D:\\\\Data\\\\readme.md"]}','run command.file.delete {}','status RUN_ID'],safety:'Local opt-in only. --wait never cancels an operation. Destructive UI confirmation requires its current token. No arbitrary JS evaluation, auto-install, screen clicking, or automatic write retries.'});return;}
  const request=command==='batch'?null:requestFor(position,options.key);
  const session=await connection(options);
  const execute=async request=>{
    let value,runId,recoveryAttempted=false;const deadline=Date.now()+options.timeout,controller=new AbortController();
    const recover=()=>{recoveryAttempted=true;return recoverRun(session.endpoint,options,request,runId,deadline,{knownTargets:session.receiptTargets,signal:controller.signal,openSession:(target,timeout)=>{const cached=session.receiptSessions?.get(target.id);if(cached){session.receiptSessions.delete(target.id);trace('recovery.reuse',{target:target.id});return cached;}return cdpSession(target,timeout);}});};
    trace('request.send',{method:request.method,action:request.params?.action,timeoutMs:options.timeout});
    try{
      value=await session.evaluate(expressionFor(request,options.pane));runId=value?.result?.id;trace('request.reply',{state:value?.result?.state??null,remainingMs:Math.max(0,deadline-Date.now())});
      if(options.wait&&request.method==='actions.run'&&runId)value=await waitWithReceipt(()=>session.evaluate(expressionFor({jsonrpc:'2.0',id:request.id,method:'runs.wait',params:{runId,timeoutMs:Math.min(30000,Math.max(0,deadline-Date.now()))}},options.pane),Math.max(1,deadline-Date.now())),recover);
    }catch(error){
      trace('request.disconnected',{code:error.code,remainingMs:Math.max(0,deadline-Date.now())});
      const recovered=!recoveryAttempted&&['CONNECTION_LOST','CDP_ERROR','REQUEST_TIMEOUT'].includes(error.code)?await recover():null;
      if(recovered)value=recovered;else{if(request.method==='actions.run')error.details={...(error.details||{}),key:request.params?.key??null,action:request.params?.action??null,...(runId?{runId}:{})};throw error;}
    }finally{controller.abort();}
    write(value);if(value?.error||value?.result?.state==='failed')process.exitCode=1;
  };
  try{if(command==='batch'){for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){if(!line.trim())continue;let request;try{request=JSON.parse(line);}catch{write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON line',data:{code:'PARSE_ERROR'}}});process.exitCode=1;continue;}await execute(request);}}else await execute(request);}finally{session.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32000,message:error.message,data:{code:error.code||'CLIENT_ERROR',...(error.details?{details:error.details}:{})}}})+'\n');process.exitCode=1;});
