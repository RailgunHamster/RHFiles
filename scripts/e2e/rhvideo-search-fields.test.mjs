import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {configureSearchFixture,checkPackagedSearchFields} from '../testing/rhvideo-search-fields.mjs';

test('packaged worker searches raw technical fields and favorite filenames through both UI and API',{timeout:90000},async t=>{
  const fixture=await rhvideoFixture({videoCount:3}),app=await launchApp({emulateFocus:true});let view;
  t.after(async()=>{view?.close();await app.close();await fixture.close();});
  configureSearchFixture(fixture);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/rhvideo.html'),'packaged search library');
  view=await cdpSession(target,30000);
  await until(()=>view.evaluate('!!window.RHFilesAPI?.snapshot().state.application.ready'),'library startup settled');
  const result=await checkPackagedSearchFields(view,fixture.url);
  fs.writeFileSync(path.join(app.artifactDir,'search-fields.json'),JSON.stringify(result,null,2));
  await view.send('Page.captureScreenshot',{format:'png'}).then(value=>fs.writeFileSync(path.join(app.artifactDir,'favorite-filename-search.png'),Buffer.from(value.data,'base64')));
  t.diagnostic('Actual packaged search evidence: '+app.artifactDir);
});
