// Owned-page diagnostics only: no interception, cache changes, response bodies,
// headers, credentials, URLs or application operations enter the report.
import assert from 'node:assert/strict';
export function ipcTimingCollector(){
 const tracked=new Map(),rows=[];
 const add=row=>{if(rows.length<64)rows.push(row);};
 function accept(message){
  const p=message?.params;if(!p)return;
  if(message.method==='Network.requestWillBeSent'){
   let request,action;try{request=new URL(p.request?.url);action=JSON.parse(p.request?.postData||'{}').action;}catch{return;}
   if(request.hostname!=='ipc.localhost'||request.pathname!=='/rhvideo_request'||action!=='play'||tracked.size>=4||tracked.has(p.requestId)||typeof p.requestId!=='string'||p.requestId.length>128||!Number.isFinite(p.timestamp))return;
   const entry={number:tracked.size+1,start:p.timestamp};tracked.set(p.requestId,entry);add({request:entry.number,phase:'sent',atMs:0});return;
  }
  const entry=tracked.get(p.requestId);if(!entry||!Number.isFinite(p.timestamp))return;
  const row={request:entry.number,atMs:(p.timestamp-entry.start)*1000};
  if(message.method==='Network.responseReceived'){
   const timing=p.response?.timing,selected={};
   for(const key of ['proxyStart','proxyEnd','dnsStart','dnsEnd','connectStart','connectEnd','sendStart','sendEnd','receiveHeadersStart','receiveHeadersEnd'])if(Number.isFinite(timing?.[key]))selected[key]=timing[key];
   add({...row,phase:'headers',status:Number.isFinite(p.response?.status)?p.response.status:null,timing:selected});
  }else if(message.method==='Network.dataReceived')add({...row,phase:'data',bytes:Number.isFinite(p.dataLength)?p.dataLength:null});
  else if(message.method==='Network.loadingFinished')add({...row,phase:'finished',encodedBytes:Number.isFinite(p.encodedDataLength)?p.encodedDataLength:null});
  else if(message.method==='Network.loadingFailed')add({...row,phase:'failed',code:String(p.errorText||'').match(/ERR_[A-Z_]+/)?.[0]||'redacted'});
 }
 return {accept,snapshot:()=>structuredClone(rows)};
}
export function ownedIpcTarget(target,port){
 const url=new URL(target.webSocketDebuggerUrl);
 assert(Number.isInteger(port)&&port>0&&port<=65535&&url.port===String(port)&&url.protocol==='ws:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/devtools/page/'),'Observe only the owned local debugger target');
 return url;
}
export async function observeOwnedIpc(target,port){
 const url=ownedIpcTarget(target,port);
 const socket=new WebSocket(url),collector=ipcTimingCollector();let timer;
 try{
  await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('Owned IPC network observer timed out')),5000);
   socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Network.enable'})),{once:true});
   socket.addEventListener('error',()=>reject(Error('Owned IPC observer connection failed')));
   socket.addEventListener('close',()=>reject(Error('Owned IPC observer closed before ready')),{once:true});
   socket.addEventListener('message',event=>{
    if(String(event.data).length>1024*1024)return;
    let value;try{value=JSON.parse(String(event.data));}catch{return;}
    if(value.id===1){value.error?reject(Error('Owned IPC observer could not enable Network')):resolve();return;}
    collector.accept(value);
   });
  });
 }catch(error){socket.close();throw error;}finally{clearTimeout(timer);}
 return {snapshot:collector.snapshot,close:()=>socket.close()};
}
