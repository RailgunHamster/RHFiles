// Disposable native-input probe for Computer Use acceptance. It never uses a
// production profile, server, account or media. Keep stdin open (tty=true when
// launched through exec_command) and send "close" to clean up.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp,until} from './app-session.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
const slideshow=process.argv.includes('--slideshow');
const app=await launchApp({emulateFocus:false});let fixture,library,player;
const action=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
let closing=false;
async function close(exitCode=0){if(closing)return;closing=true;player?.close();library?.close();app.close();await fixture?.close();process.exit(exitCode);}
try{
  const file=path.join(app.directory,'native-input.mp4');
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','30','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
  fixture=await rhvideoFixture({videoFile:file,videoDuration:30,videoCount:slideshow?0:6,pictureCount:slideshow?4:8});
  if(slideshow)for(let i=0;i<4;i++)fixture.favorites.add('picture:picture-'+i);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=async file=>until(async()=>{const tabs=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return tabs.find(t=>new URL(t.url).pathname.endsWith('/'+file));},file);
  library=await cdpSession(await target('rhvideo.html'),30000);
  await until(()=>library.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.playlist.sequential")'),'library ready');
  await action(library,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  if(slideshow){
    await action(library,'preferences.set',{key:'favoriteStay',value:60});
    await action(library,'category',{kind:'favorite'});await action(library,'viewer.open',{mode:'slideshow',source:'favorite'});await action(library,'viewer.toggle');
    await until(()=>library.evaluate('document.querySelector(".wb-slide:not(.outgoing) img")?.naturalWidth>0'),'actual slideshow image');
  }else{
    await action(library,'playlist.sequential');
    player=await cdpSession(await target('rhvideo-player.html'),30000);
    await until(()=>player.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.player.state")'),'player ready');
    await until(async()=>(await action(player,'player.state')).renderedFrames>0,'real native frame',25000);
    await action(player,'player.control',{command:'pause'});
  }
  const manifest={probePid:process.pid,mode:slideshow?'slideshow':'player',port:app.port,artifactDir:app.artifactDir,directory:app.directory,server:fixture.url};
  fs.writeFileSync(path.join(app.artifactDir,'input-probe.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({ready:true,...manifest,state:await action(slideshow?library:player,slideshow?'viewer.state':'player.state')}));
  process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='close')void close();});
  process.stdin.on('end',()=>void close());
  process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
}catch(error){console.error(error);await close(1);}
