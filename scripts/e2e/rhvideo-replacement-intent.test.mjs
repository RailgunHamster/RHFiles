import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {replacementIntentControl,checkPackagedReplacementIntent} from '../testing/rhvideo-replacement-intent.mjs';

test('real delayed metadata cannot reopen replacement confirmation over a newer workbench or client dialog',{timeout:120000},async t=>{
  const control=replacementIntentControl(),fixture=await rhvideoFixture({videoCount:3,beforeCatalog:control.beforeCatalog});let app,view;
  t.after(async()=>{control.release();view?.close();await app?.close();await fixture.close();});
  app=await launchApp({emulateFocus:true});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/rhvideo.html'),'packaged replacement-intent library');
  view=await cdpSession(target,30000);await until(()=>view.evaluate('!!window.RHFilesAPI?.snapshot().state.application?.ready'),'library controls ready');
  let result;
  try{result=await checkPackagedReplacementIntent(view,fixture.url,fixture,control);}
  catch(error){
    try{const screen=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'replacement-intent-failure.png'),Buffer.from(screen.data,'base64'));}catch{}
    t.diagnostic('Failed packaged replacement-intent evidence: '+app.artifactDir);throw error;
  }
  fs.writeFileSync(path.join(app.artifactDir,'replacement-intent.json'),JSON.stringify(result,null,2));t.diagnostic('Packaged replacement-intent evidence: '+app.artifactDir);
});
