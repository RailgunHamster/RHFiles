// Bounded trace of one owned private WebView2 profile, never system ETW.
import assert from 'node:assert/strict';
export function ownedBrowserTraceEndpoint(target,port){
 const url=new URL(target.webSocketDebuggerUrl);
 assert(Number.isInteger(port)&&port>0&&port<=65535&&url.protocol==='ws:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.port===String(port)&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/devtools\/browser\/[A-Za-z0-9-]{1,80}$/.test(url.pathname),'Only the browser endpoint of this already admitted private profile is accepted');return url;
}
export async function discoverTraceCategories(send){
 const wanted=['toplevel','devtools.timeline','media','gpu','viz','ipc','renderer.scheduler'],categoryQueries=[];
 const read=async()=>{const value=await send('Tracing.getCategories');assert(Array.isArray(value?.categories)&&value.categories.length<=2000&&value.categories.every(name=>typeof name==='string'&&name.length<=180),'Invalid owned-browser trace capabilities');categoryQueries.push(value.categories.length);return value.categories;};
 let available=await read();
 // A fresh WebView2 profile can lazily initialize the tracing service on its
 // first discovery. Re-read once, only when empty; never retry tracing/media.
 if(available.length===0)available=await read();
 const categories=wanted.filter(value=>available.includes(value));
 assert(categories.includes('toplevel')&&categories.includes('devtools.timeline'),'Owned-browser tracing does not expose the required categories');
 return {categories,categoryQueries};
}
export function sanitizeTrace(raw,{limit=40000}={}){
 assert(Number.isInteger(limit)&&limit>=1&&limit<=40000);assert(Array.isArray(raw?.traceEvents));
 const rows=[];let redacted=0,rejected=0,dropped=0;
 const safeName=value=>typeof value==='string'&&/^[A-Za-z0-9 _.,:#<>+()=\-]{1,180}$/.test(value)?value:(redacted++,'redacted');
 for(const event of raw.traceEvents){
  if(rows.length>=limit){dropped++;continue;}
  if(!event||!Number.isFinite(event.ts)||event.ts<0||!Number.isSafeInteger(event.pid)||event.pid<0||!Number.isSafeInteger(event.tid)||event.tid<0||typeof event.ph!=='string'||!/^[XBEIMibensftcCNR]$/.test(event.ph)){rejected++;continue;}
  const row={name:safeName(event.name),cat:safeName(event.cat),ph:event.ph,ts:event.ts,pid:event.pid,tid:event.tid};
  if(Number.isFinite(event.dur)&&event.dur>=0&&event.dur<=150000000)row.dur=event.dur;
  const role=event.args?.name;
  if(event.ph==='M'&&typeof role==='string'&&((event.name==='process_name'&&/^(Browser|Renderer|GPU Process)$/.test(role))||(event.name==='thread_name'&&/^(CrBrowserMain|CrRendererMain|CrGpuMain|Chrome_IOThread|Chrome_ChildIOThread|Chrome_DevToolsHandlerThread|VizCompositorThread|Compositor|GpuVSyncThread|PerfettoTrace|MemoryInfra|Window owner thread|ThreadPoolServiceThread|ThreadPool(?:Foreground|Background|SingleThreadSharedForeground|SingleThreadForegroundBlocking)Worker)$/.test(role))))row.role=role;
  const message=event.args?.data?.message;if(['RHFilesStartupBegin','RHFilesStartupReply'].includes(message))row.marker=message;
  rows.push(row);
 }
 return {scope:'Sanitized own-browser event wall durations, not CPU time or kernel scheduling; no trace arguments, URLs, bodies, script text or credentials retained',rows,redacted,rejected,dropped};
}
export function traceSummary(value){
 const threadNames=new Map(),processNames=new Map(),complete=[],stacks=new Map();
 for(const row of value.rows){const key=row.pid+':'+row.tid;if(row.ph==='M'&&row.name==='thread_name'&&row.role)threadNames.set(key,row.role);if(row.ph==='M'&&row.name==='process_name'&&row.role)processNames.set(row.pid,row.role);
  if(row.ph==='X'&&Number.isFinite(row.dur))complete.push({...row,durationMs:row.dur/1000});
  else if(row.ph==='B'){const stack=stacks.get(key)||[];stack.push(row);stacks.set(key,stack);}
  else if(row.ph==='E'){const start=stacks.get(key)?.pop();if(start&&row.ts>=start.ts)complete.push({...start,durationMs:(row.ts-start.ts)/1000,paired:true});}
 }
 const describe=row=>({name:row.name,category:row.cat,pid:row.pid,tid:row.tid,process:processNames.get(row.pid)||null,thread:threadNames.get(row.pid+':'+row.tid)||null,atMs:row.ts/1000,durationMs:row.durationMs});
 return {events:value.rows.length,redacted:value.redacted,rejected:value.rejected,dropped:value.dropped,markers:value.rows.filter(row=>row.marker).map(row=>({marker:row.marker,atMs:row.ts/1000,pid:row.pid,tid:row.tid})),timestamps:value.rows.filter(row=>row.name==='TimeStamp').map(row=>({atMs:row.ts/1000,pid:row.pid,tid:row.tid})),longest:complete.sort((a,b)=>b.durationMs-a.durationMs).slice(0,30).map(describe),threads:[...threadNames].map(([key,name])=>({key,name,process:processNames.get(Number(key.split(':')[0]))||null}))};
}
export async function startOwnedTrace(target,port){
 const url=ownedBrowserTraceEndpoint(target,port),socket=new WebSocket(url);let next=0,closed=false,started=false,completeResolve,completeReject,deadline;
 const pending=new Map(),complete=new Promise((resolve,reject)=>{completeResolve=resolve;completeReject=reject;});void complete.catch(()=>{});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned trace connection timed out')),5000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Owned trace connection failed'));},{once:true});}).catch(error=>{socket.close();throw error;});
 const send=(method,params={})=>new Promise((resolve,reject)=>{if(closed)return reject(Error('Owned trace is closed'));const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Owned trace command timed out: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 socket.addEventListener('message',event=>{const text=String(event.data);if(text.length>2*1024*1024){completeReject(Error('Owned trace protocol message exceeded its limit'));return;}let value;try{value=JSON.parse(text);}catch{return;}
  const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error('Owned trace command rejected: '+String(value.error.code))):request.resolve(value.result);return;}
  if(value.method==='Tracing.tracingComplete')completeResolve(value.params);
 });
 const close=()=>{clearTimeout(deadline);closed=true;socket.close();for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Owned trace closed'));}pending.clear();};
 try{
  const version=await send('Browser.getVersion'),{categories,categoryQueries}=await discoverTraceCategories(send);
  await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'none',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:4096,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:categories}});started=true;
  let ended=false;deadline=setTimeout(()=>{if(!ended){ended=true;void send('Tracing.end').catch(completeReject);}},15000);
  return {version:{product:String(version.product).slice(0,100),protocolVersion:version.protocolVersion},categories,categoryQueries,
   async stop(){if(!ended){ended=true;await send('Tracing.end');}clearTimeout(deadline);let endTimer;const result=await Promise.race([complete,new Promise((_,reject)=>{endTimer=setTimeout(()=>reject(Error('Owned trace completion timed out')),10000);})]).finally(()=>clearTimeout(endTimer));assert.equal(typeof result.stream,'string');const chunks=[];let bytes=0,reads=0;
    try{while(true){assert(++reads<=128,'Owned trace exceeded its read budget');const chunk=await send('IO.read',{handle:result.stream,size:65536});const data=chunk.base64Encoded?Buffer.from(chunk.data,'base64'):Buffer.from(chunk.data);bytes+=data.length;assert(bytes<=8*1024*1024,'Owned trace exceeded its byte budget');chunks.push(data);if(chunk.eof)break;}}
    finally{await send('IO.close',{handle:result.stream});}
    const filtered=sanitizeTrace(JSON.parse(Buffer.concat(chunks).toString('utf8')));return {version:{product:String(version.product).slice(0,100),protocolVersion:version.protocolVersion},categories,bytes,reads,dataLossOccurred:typeof result.dataLossOccurred==='boolean'?result.dataLossOccurred:null,...filtered};
   },close};
 }catch(error){if(started)try{await send('Tracing.end');}catch{}close();throw error;}
}
