// Private stdin/stdout of the process this fixture just spawned. This is not
// a network transport or a replacement for the application's business APIs.
import {StringDecoder} from 'node:string_decoder';
const prefix='RHFILES_NATIVE_QA ';
const allowed=new Set(['ping','player.state','player.frame','player.window','main.frame']);
export function nativeQaChannel(input,nonce){
 if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('Invalid owned QA nonce');
 let sequence=0,pending=null,buffer='',discard=false,closed=false;const decoder=new StringDecoder('utf8');
 const close=(error=Error('Owned QA channel closed'))=>{if(closed)return;closed=true;if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
 function line(value){
  if(!value.startsWith(prefix))return;
  let reply;try{reply=JSON.parse(value.slice(prefix.length));}catch{return;}
  if(!pending||reply?.nonce!==nonce||reply.id!==pending.id)return;
  if(!Object.hasOwn(reply,'result')&&typeof reply.error!=='string')return;
  const current=pending;pending=null;clearTimeout(current.timer);
  typeof reply.error==='string'?current.reject(Error(reply.error)):current.resolve(reply.result);
 }
 function feed(chunk){
  for(const part of decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk))).split(/(?<=\n)/)){
   if(discard){if(part.endsWith('\n'))discard=false;continue;}
   buffer+=part;
   if(buffer.length>65536){buffer='';discard=!part.endsWith('\n');continue;}
   if(buffer.endsWith('\n')){line(buffer.trimEnd());buffer='';}
  }
 }
 function request(action,args={},timeout=5000){
  if(closed)return Promise.reject(Error('Owned QA channel closed'));
  if(pending)return Promise.reject(Error('Only one readback may be pending'));
  if(!allowed.has(action)||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>action!=='player.frame'||k!=='expectedInput')||('expectedInput' in args&&(!Number.isSafeInteger(args.expectedInput)||args.expectedInput<=0)))return Promise.reject(Error('Only fixed read-only QA operations are allowed'));
  if(!Number.isInteger(timeout)||timeout<1||timeout>10000)return Promise.reject(Error('Invalid QA timeout'));
  if(sequence>=512){close();return Promise.reject(Error('Owned QA request budget exhausted'));}
  const id=String(++sequence);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>close(Error('Owned native readback timed out; channel closed without retry')),timeout);
   pending={id,resolve,reject,timer};
   try{input.write(JSON.stringify({nonce,id,action,args})+'\n',error=>{if(error)close(error);});}catch(error){close(error);}
  });
 }
 return {request,feed,close};
}
