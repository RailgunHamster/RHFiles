import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {holdPresentationReplyScript,makePresentationMarkers,fourPresentationMarkers} from '../testing/rhvideo-presentation-input.mjs';
import {exercisePresentationModal,missingNativePlane} from '../testing/rhvideo-presentation-modal.mjs';

test('a late actual native video reply cannot cover settings or resume playback behind them',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:180000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let fixture,page;
 const preserve=(label,frame)=>fs.copyFileSync(frame.path,path.join(app.artifactDir,label+'.bmp'));
 try{
  const movie=path.join(app.directory,'modal-markers.mp4');makePresentationMarkers(movie);fixture=await rhvideoFixture({videoFile:movie,videoCount:1,pictureCount:1,videoDuration:20});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const values=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return values.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned library');page=await cdpSession(target,30000);
  await page.send('Page.enable');await until(()=>page.evaluate('document.readyState==="complete"&&!!globalThis.RHFilesAPI?.list().find(a=>a.id==="rhvideo.viewer.video")'),'initial workbench');
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:holdPresentationReplyScript});await page.send('Page.reload');await until(()=>page.evaluate('typeof __qaPresentationNative==="function"&&!!RHFilesAPI.list().find(a=>a.id==="rhvideo.viewer.video")'),'actual workbench transport');
  const sha=s=>createHash('sha256').update(s).digest('hex');assert.equal(sha(await page.evaluate('fetch("js/rhvideo-workbench.js").then(r=>r.text())')),sha(fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url))),'Use the exact admitted production workbench');
  await exercisePresentationModal({page,until,server:fixture.url,receipt,checkHidden:async(label,state)=>{
   let frame;try{frame=await app.readPresentationFrame({expectedInput:state.inputId});}catch(error){assert(missingNativePlane(error),'Only zero visible owned planes prove hidden; multiple planes or other tool errors must fail: '+String(error));return {hidden:true};}
   preserve(label+'-leaked',frame);receipt.leakedNative={alpha:frame.alpha,width:frame.width,height:frame.height};assert.fail('Late native video must not remain visible above settings; actual alpha='+frame.alpha);
  },checkVisible:async(label,state)=>{
   const frame=await app.readPresentationFrame({expectedInput:state.inputId});assert.equal(frame.alpha,255);preserve(label,frame);const pixels=fs.readFileSync(frame.path),colors=Array.from({length:4},(_,i)=>{const x=Math.floor(frame.width*(i%2===0?.25:.75)),y=Math.floor(frame.height*(i<2?.25:.75)),offset=54+(y*frame.width+x)*4;return [pixels[offset+2],pixels[offset+1],pixels[offset]];});assert(fourPresentationMarkers(colors));return {alpha:frame.alpha,colors};
  }});
 }catch(error){receipt.failure=String(error);throw error;}
 finally{fs.writeFileSync(path.join(app.artifactDir,'presentation-modal.json'),JSON.stringify(receipt,null,2));page?.close();await app.close();await fixture?.close();console.log('Actual native modal ownership: '+app.artifactDir);}
});
