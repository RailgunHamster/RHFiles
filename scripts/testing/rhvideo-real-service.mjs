// Start only the generated RHVideo fixture, never the user's server/database.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function realRhVideoService({directory,video,source=process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),delay=.2}){
  if(!fs.existsSync(path.join(source,'app/main.py')))throw Error('Actual RHVideo source is required');
  if(!path.isAbsolute(directory)||fs.existsSync(directory))throw Error('Use a new absolute fixture directory');
  fs.mkdirSync(directory);fs.copyFileSync(video,path.join(directory,'sample.mp4'));
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const script=fileURLToPath(new URL('./rhvideo-real-server.py',import.meta.url));
  const child=spawn('uv',['run','--project',source,'--no-sync','python',script,source,directory,String(port)],{cwd:directory,windowsHide:true,env:{...process.env,RHVIDEO_QA_EXPORT_DELAY:String(delay)},stdio:['ignore','pipe','pipe']});
  let output='',spawnError,closed=false;child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('error',e=>spawnError=e);
  const close=async()=>{if(closed)return;closed=true;if(child.pid&&child.exitCode===null){if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});else child.kill();}fs.writeFileSync(path.join(directory,'service.log'),output);};
  let sourceHashes;
  try{
    const end=Date.now()+45000;
    while(!output.includes('RHVIDEO_QA_READY')){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('Actual RHVideo fixture exited: '+output.slice(-2000));if(Date.now()>=end)throw Error('Actual RHVideo fixture startup exceeded deadline: '+output.slice(-2000));await new Promise(r=>setTimeout(r,100));}
    sourceHashes=Object.fromEntries(['sample.mp4','original.png','book.txt'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')]));
  }catch(error){await close();throw error;}
  return {url:'http://127.0.0.1:'+port,directory,sourceHashes,get requests(){const log=path.join(directory,'requests.jsonl');if(!fs.existsSync(log))return [];const text=fs.readFileSync(log,'utf8');return text.slice(0,text.lastIndexOf('\n')+1).split(/\r?\n/).filter(Boolean).map(v=>JSON.parse(v));},close};
}
