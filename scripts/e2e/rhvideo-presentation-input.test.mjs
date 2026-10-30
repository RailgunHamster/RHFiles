import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {holdPresentationReplyScript,makePresentationMarkers,fourPresentationMarkers,exercisePresentationInputs} from '../testing/rhvideo-presentation-input.mjs';

test('real native slideshow input survives a late former-viewer reply, a same-viewer race and retired native controls',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:180000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let fixture,page;
 try{
  const movie=path.join(app.directory,'native-identity-markers.mp4');makePresentationMarkers(movie);fixture=await rhvideoFixture({videoFile:movie,videoCount:2,pictureCount:1,videoDuration:20});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const entry=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned packaged library');page=await cdpSession(entry,30000);
  await page.send('Page.enable');await until(()=>page.evaluate('document.readyState==="complete"&&typeof RHVideoWorkbench==="object"&&!!RHFilesAPI.list().find(a=>a.id==="rhvideo.viewer.video")'),'initial packaged workbench');
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:holdPresentationReplyScript});await page.send('Page.reload');
  await until(()=>page.evaluate('typeof __qaPresentationNative==="function"&&!!RHFilesAPI.list().find(a=>a.id==="rhvideo.viewer.video")'),'original workbench and delivery-only shim');
  const served=await page.evaluate('fetch("js/rhvideo-workbench.js").then(r=>r.text())'),expected=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');assert.equal(sha(served),sha(expected),'The executable must embed the exact admitted workbench');
  await exercisePresentationInputs({page,until,server:fixture.url,receipt,checkFrame:async(label,state)=>{
   if(process.env.RHFILES_EXPECT_RENDERER)assert.equal(state.renderer,process.env.RHFILES_EXPECT_RENDERER);
   const frame=await app.readPresentationFrame({expectedInput:state.inputId});assert.equal(frame.alpha,255);const destination=path.join(app.artifactDir,label+'.bmp');fs.copyFileSync(frame.path,destination);
   const data=fs.readFileSync(frame.path),colors=Array.from({length:4},(_,i)=>{const x=Math.floor(frame.width*(i%2===0?.25:.75)),y=Math.floor(frame.height*(i<2?.25:.75)),offset=54+(y*frame.width+x)*4;return [data[offset+2],data[offset+1],data[offset]];});assert(fourPresentationMarkers(colors),'Native input must still display the four actual decoded markers');return {alpha:frame.alpha,width:frame.width,height:frame.height,colors};
  }});
 }catch(error){receipt.failure=String(error);throw error;}
 finally{fs.writeFileSync(path.join(app.artifactDir,'presentation-input.json'),JSON.stringify(receipt,null,2));page?.close();await app.close();await fixture?.close();console.log('Native presentation ownership: '+app.artifactDir);}
});
