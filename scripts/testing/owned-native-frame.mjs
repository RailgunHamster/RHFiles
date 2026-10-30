// Test-only external pixel observation. Never enables a production readback
// endpoint or falls back to frame counters when pixels cannot be observed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';

export function admitOwnedFrameTool(workspace,requested){
  const root=fs.realpathSync(workspace),tool=path.resolve(requested),base=path.join(root,'test-artifacts')+path.sep;
  if(fs.realpathSync(tool).toLowerCase()!==tool.toLowerCase()||!tool.toLowerCase().startsWith(base.toLowerCase())||path.extname(tool).toLowerCase()!=='.exe')throw Error('Owned frame tool must be a real test-artifacts executable');
  const proofFile=tool+'.json';
  if(fs.realpathSync(proofFile).toLowerCase()!==proofFile.toLowerCase()||fs.statSync(proofFile).size>16384)throw Error('Invalid owned frame tool proof');
  const proof=JSON.parse(fs.readFileSync(proofFile,'utf8')),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(proof.format!=='RHFiles.owned-frame-tool'||proof.protocol!==1||proof.sourceSHA256!==sha(path.join(root,'scripts/testing/owned-native-frame.cpp'))||proof.exeSHA256!==sha(tool))throw Error('Owned frame tool does not match its source and compiled bytes');
  return tool;
}
export function validateFrameInput(args){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>key!=='expectedInput')||Object.hasOwn(args,'expectedInput')&&(!Number.isSafeInteger(args.expectedInput)||args.expectedInput<=0))throw Error('Only the current positive input identity may be supplied');
}
export function validateOwnedBitmap(file,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error('Invalid owned bitmap geometry');
  if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size!==54+width*height*4)throw Error('Invalid owned bitmap file');
  const header=Buffer.alloc(54),handle=fs.openSync(file,'r');try{if(fs.readSync(handle,header,0,54,0)!==54)throw Error('Incomplete owned bitmap header');}finally{fs.closeSync(handle);}
  if(header.toString('ascii',0,2)!=='BM'||header.readUInt32LE(2)!==54+width*height*4||header.readUInt32LE(10)!==54||header.readUInt32LE(14)!==40||header.readInt32LE(18)!==width||header.readInt32LE(22)!==-height||header.readUInt16LE(26)!==1||header.readUInt16LE(28)!==32||header.readUInt32LE(30)!==0)throw Error('Owned bitmap layout mismatch');
}
export function ownedWindowDriver({workspace,tool,pid,executable,directory,execute=executeOwnedFrame}){
  if(!Number.isSafeInteger(pid)||pid<=0)throw Error('The window observer requires its own spawned process');
  const admitted=admitOwnedFrameTool(workspace,tool);let closed=false,busy=false,count=0,active;
  const request=async args=>{
    if(closed)throw Error('Owned window observer is closed');if(busy)throw Error('Only one owned window observation may be pending');if(count++>=512)throw Error('Owned window observation budget exhausted');busy=true;
    const controller=active=new AbortController();
    try{const reply=JSON.parse(await execute(admitted,[String(pid),executable,...args],{cwd:directory,windowsHide:true,encoding:'utf8',timeout:4500,maxBuffer:65536,signal:controller.signal}));
      if(closed||reply.protocol!==1||reply.scope!=='owned-sibling-windows'||reply.pid!==pid)throw Error('Owned window observation identity mismatch');return reply;
    }finally{active=null;busy=false;}
  };
  return {
    async windows(){const reply=await request(['windows']);if(!Array.isArray(reply.windows)||reply.windows.length>2||reply.windows.some(row=>!['main','window-rhvideo'].includes(row.label)||['foreground','active','inputFocus'].some(key=>typeof row[key]!=='boolean')))throw Error('Invalid owned window observations');return reply.windows;},
    async libraryKey({key,encoding='virtual-key'}={}){if(!['Home','End'].includes(key))throw Error('Only Home/End may be submitted');if(!['virtual-key','scan-code'].includes(encoding))throw Error('Invalid key encoding');const reply=await request(['library-key',key,encoding]);if(reply.sent!==2||reply.key!==key||reply.encoding!==encoding||reply.transport!=='windows-send-input')throw Error('Invalid owned key acknowledgement');return {sent:reply.sent,key:reply.key,encoding:reply.encoding,transport:reply.transport};},
    async activateMain(){return request(['activate-main']);},
    close(){closed=true;active?.abort();},
  };
}
export function executeOwnedFrame(tool,args,options){
  return new Promise((resolve,reject)=>execFile(tool,args,options,(error,stdout)=>error?reject(error):resolve(stdout)));
}
export function ownedFrameReader({workspace,tool,pid,executable,directory,getState,execute=executeOwnedFrame,scope='player'}){
  if(!Number.isSafeInteger(pid)||pid<=0||typeof getState!=='function')throw Error('The frame reader requires its own spawned process');
  if(!['player','presentation'].includes(scope))throw Error('Unknown owned frame scope');
  const admitted=admitOwnedFrameTool(workspace,tool),controllers=new Set(),files=new Set();let closed=false,sequence=0,busy=false;
  const discard=file=>{if(!files.delete(file))return;try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
  return {
    async read(args={}){
      validateFrameInput(args);if(closed)throw Error('Owned frame reader is closed');if(busy)throw Error('Only one owned pixel observation may be pending');if(sequence>=512)throw Error('Owned pixel observation budget exhausted');busy=true;sequence++;
      const controller=new AbortController();controllers.add(controller);let file;
      try{
        const before=await getState();
        if(closed)throw Error('Owned frame reader is closed');
        if(!before?.opened||!Number.isSafeInteger(before.inputId)||before.inputId<=0)throw Error('No current owned player input');
        if(args.expectedInput!==undefined&&args.expectedInput!==before.inputId)throw Error('Playback input changed before pixel observation');
        if(!['native-hardware-auto','gdi-compatibility'].includes(before.renderer))throw Error('Unknown actual native renderer');
        const name='rhvideo-native-'+randomBytes(16).toString('hex')+'.bmp';file=path.join(directory,name);
        const text=await execute(admitted,[String(pid),executable,name,before.renderer,...(scope==='presentation'?['library-presentation']:[])],{cwd:directory,windowsHide:true,encoding:'utf8',timeout:4500,maxBuffer:65536,signal:controller.signal});
        files.add(file);
        const reply=JSON.parse(text);
        if(reply.protocol!==1||reply.scope!==(scope==='presentation'?'owned-sibling-presentation':'owned-sibling-client')||reply.pid!==pid)throw Error('Owned pixel observation identity mismatch');
        if(scope==='presentation'&&(!Number.isInteger(reply.alpha)||reply.alpha<0||reply.alpha>255))throw Error('Invalid observed presentation alpha');
        validateOwnedBitmap(file,reply.width,reply.height);
        const after=await getState();
        if(closed||!after?.opened||after.inputId!==before.inputId||after.renderer!==before.renderer||after.rotation!==before.rotation)throw Error('Playback input changed during pixel observation');
        return {...reply,path:file,inputId:before.inputId,renderer:before.renderer,rotation:before.rotation};
      }catch(error){if(file&&files.has(file))discard(file);throw error;}
      finally{controllers.delete(controller);busy=false;}
    },
    close(){if(closed)return [];closed=true;for(const controller of controllers)controller.abort();const errors=[];for(const file of [...files])try{discard(file);}catch(error){errors.push({file:path.basename(file),code:error.code||'CLEANUP_FAILED'});}return errors;},
  };
}
