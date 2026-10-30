import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {configureVideoOrderFixture,checkPackagedVideoOrder} from '../testing/rhvideo-video-order.mjs';

test('packaged video pages and selected replacement keep reference order, filtering-independent IDs and one-shot confirmation',{timeout:120000},async t=>{
  const fixture=await rhvideoFixture({videoCount:52}),app=await launchApp({emulateFocus:true});let view;
  t.after(async()=>{view?.close();await app.close();await fixture.close();});configureVideoOrderFixture(fixture);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/rhvideo.html'),'packaged video-order library');
  view=await cdpSession(target,30000);await until(()=>view.evaluate('!!window.RHFilesAPI?.snapshot().state.application?.ready'),'library controls ready');
  const result=await checkPackagedVideoOrder(view,fixture.url,fixture);
  fs.writeFileSync(path.join(app.artifactDir,'reference-video-order.json'),JSON.stringify(result,null,2));t.diagnostic('Packaged video-order evidence: '+app.artifactDir);
});
