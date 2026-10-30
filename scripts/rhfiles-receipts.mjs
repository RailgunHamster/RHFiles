// Only authenticated, explicitly advertised local Windows receipt pipes. No
// actions, network hosts, operation replay, or unbounded reads are supported.
import net from 'node:net';
const fail=(code,message)=>Object.assign(new Error(message),{code});
export function receiptTransport(value,platform=process.platform){
  if(platform!=='win32'||!value||value.type!=='windows-pipe'||typeof value.path!=='string'||!/^\\\\\.\\pipe\\RHFiles\.receipts\.[a-f0-9]{32}$/.test(value.path)||typeof value.secret!=='string'||!/^[a-f0-9]{64}$/.test(value.secret)||Object.keys(value).some(key=>!['type','path','secret'].includes(key)))return null;
  return {type:value.type,path:value.path,secret:value.secret};
}
export function matchingReceipt(value,request,runId){
  return !!value&&typeof value.id==='string'&&value.id.length>0&&value.id.length<=240&&value.action===request.params.action&&(!runId||value.id===runId)&&Number.isSafeInteger(value.startedAt)&&value.startedAt>=0&&['running','succeeded','failed'].includes(value.state)&&(value.state==='running'||Number.isSafeInteger(value.finishedAt)&&value.finishedAt>=0)&&(value.state!=='succeeded'||Object.hasOwn(value,'result')&&value.result!==undefined)&&(value.state!=='failed'||typeof value.error?.code==='string'&&typeof value.error?.message==='string');
}
export async function readProcessReceipt(transport,query,deadline,{signal,connect=options=>net.createConnection(options),platform=process.platform}={}){
  const descriptor=receiptTransport(transport,platform);
  if(!descriptor)throw fail('INVALID_RECEIPT_TRANSPORT','Invalid local receipt transport');
  if(signal?.aborted)throw fail('READ_ABORTED','The receipt read was ended');
  if(Date.now()>=deadline)throw fail('REQUEST_TIMEOUT','Receipt read deadline expired');
  const bytes=JSON.stringify({secret:descriptor.secret,query})+'\n';
  if(Buffer.byteLength(bytes)>4096)throw fail('INVALID_PARAMS','Local receipt query is too large');
  return new Promise((resolve,reject)=>{
    let socket,settled=false,buffer=Buffer.alloc(0);
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);socket?.destroy();error?reject(error):resolve(value);};
    const aborted=()=>finish(fail('READ_ABORTED','The receipt read was ended'));
    const timer=setTimeout(()=>finish(fail('REQUEST_TIMEOUT','Receipt read deadline expired')),Math.max(1,deadline-Date.now()));
    try{socket=connect({path:descriptor.path});}catch{finish(fail('RECEIPT_UNAVAILABLE','Local receipt transport unavailable'));return;}
    socket.on('error',()=>finish(fail('RECEIPT_UNAVAILABLE','Local receipt transport unavailable')));
    socket.on('close',()=>{if(!settled)finish(fail('RECEIPT_UNAVAILABLE','Local receipt response was not confirmed'));});
    // Newline frames the request. Do not half-close: some pipe/socket hosts
    // retire their write side on EOF before a pending receipt can be returned.
    socket.once('connect',()=>socket.write(bytes));
    socket.on('data',chunk=>{
      if(settled)return;
      if(buffer.length+chunk.length>1024*1024){finish(fail('INVALID_RECEIPT','Local receipt response exceeds its limit'));return;}
      buffer=Buffer.concat([buffer,chunk]);const end=buffer.indexOf(10);if(end<0)return;
      let value;try{if(end!==buffer.length-1)throw Error();value=JSON.parse(buffer.subarray(0,end).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'result')&&!Object.hasOwn(value,'error'))throw Error();}catch{finish(fail('INVALID_RECEIPT','Malformed local receipt response'));return;}
      finish(null,value);
    });
    signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted)aborted();
  });
}
