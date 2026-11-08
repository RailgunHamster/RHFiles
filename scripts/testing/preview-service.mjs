import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

// Stdio control of the production service library; its only share is synthetic.
export async function startPreviewService(executable,directory){
  const file=fs.realpathSync(executable),root=fs.realpathSync('.')+path.sep;
  if(!file.startsWith(root)||!/^preview_fixture(?:\.exe)?$/.test(path.basename(file)))throw Error('Expected the repository-owned preview_fixture binary');
  const child=spawn(file,[directory],{windowsHide:true,stdio:['pipe','pipe','pipe']}),pending=new Map();let sequence=0,closing=false,stderr='';
  child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-4000));
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>readyReject(Error('Preview fixture did not start')),30000);
  const lines=createInterface({input:child.stdout});
  const fail=error=>{readyReject(error);for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();};
  lines.on('line',line=>{
    let value;try{value=JSON.parse(line);}catch{fail(Error('Invalid fixture control response'));return;}
    if(value.port){if(!Number.isInteger(value.port)||value.port<1||value.port>65535||!value.readOnly||![value.group,value.peer].every(v=>/^[a-f0-9]{64}$/.test(v)))fail(Error('Invalid fixture readiness'));else readyResolve(value);return;}
    const request=pending.get(value.id);if(!request)return;pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(value.error)):request.resolve(value.value);
  });
  child.on('error',fail);child.stdin.on('error',fail);child.on('exit',code=>{if(!closing)fail(Error('Preview fixture exited '+code+': '+stderr));});
  async function close(){closing=true;child.stdin.end();if(child.exitCode===null){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill();}lines.close();}
  try{
    const service=await ready;clearTimeout(timer);
    return {service,approve:uri=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Fixture approval timed out'));},30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,uri})+'\n');}),close};
  }catch(error){clearTimeout(timer);await close();throw error;}
}
