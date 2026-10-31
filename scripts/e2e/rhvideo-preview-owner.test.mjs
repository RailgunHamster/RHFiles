// Generated pictures and a private profile only. In particular, remove test
// marks before closing a preview: this test must never stage any source file.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';

test('the actual top preview owns current-file marking, not an underlying slideshow',{timeout:60000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let page,fixture;
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 try{
  fixture=await rhvideoFixture({videoCount:0,galleryVideoCount:0,pictureCount:8});await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned preview library');page=await cdpSession(target,30000);await page.send('Page.enable');await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.viewer.state")'),'preview APIs');
  await api('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await api('category',{kind:'picture'});await api('sort',{value:'nameAsc'});await api('viewer.open',{mode:'slideshow',source:'picture'});
  let viewer=await until(async()=>{const s=await api('viewer.state');return s.current&&!s.loading?s:null;},'actual decoded slideshow target');if(viewer.running)await api('viewer.toggle');
  receipt.viewer=await api('viewer.state');const chosen=receipt.viewer.current.id==='picture-7'?'picture-6':'picture-7';await api('media.open',{kind:'picture',id:chosen});receipt.image=await api('image.state');receipt.dialogs=await page.evaluate('({image:document.getElementById("image-dialog").open,viewer:document.getElementById("wb-viewer").open,focused:document.activeElement.closest("dialog")?.id})');
  assert.equal(receipt.dialogs.image,true);assert.equal(receipt.dialogs.viewer,true);assert.equal(receipt.dialogs.focused,'image-dialog');assert.equal(receipt.image.current.id,chosen);assert.notEqual(chosen,receipt.viewer.current.id);
  const control=await page.evaluate('RHFilesAPI.invoke("ui.list").then(rows=>rows.find(row=>row.id==="wb-image-mark"))');assert(control,'Visible marking control must expose the same public action');await page.evaluate('RHFilesAPI.invoke("ui.invoke",'+JSON.stringify({controlId:control.controlId})+')');receipt.marked=await api('preview.pending');
  fs.writeFileSync(path.join(app.artifactDir,'preview-owner.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png'})).data,'base64'));assert.equal(receipt.marked.items.length,1);assert.equal(receipt.marked.items[0].id,chosen,'The visible image button must mark the visible image, never the covered slideshow');
  await api('preview.mark',{kind:'picture',id:chosen,title:'Generated',enabled:false});await api('settings.open');await assert.rejects(api('selection.markCurrent'),/预览|窗口|可见/);assert.equal((await api('preview.pending')).items.length,0);
  await api('panel.close',{id:'wb-settings'});await api('image.close');const current=await api('viewer.state');await api('selection.markCurrent',{expectedViewer:current.token});assert.equal((await api('preview.pending')).items[0].id,current.current.id);await api('preview.mark',{kind:'picture',id:current.current.id,title:'Generated',enabled:false});
  assert.deepEqual((await api('ui.contract')).missing,[]);receipt.passed=true;
 }catch(error){receipt.failure=String(error);throw error;}
 finally{
  if(page)try{for(const row of (await api('preview.pending')).items)await api('preview.mark',{kind:row.kind,id:row.id,title:row.title,enabled:false});receipt.remaining=(await api('preview.pending')).items.length;}catch(error){receipt.cleanupError=String(error);}
  page?.close();await app.close();if(fixture){receipt.trash=fixture.trash;receipt.stagingRequests=fixture.requests.filter(r=>r.path.startsWith('/api/v1/trash/')&&r.method==='POST').length;await fixture.close();}fs.writeFileSync(path.join(app.artifactDir,'preview-owner.json'),JSON.stringify(receipt,null,2));console.log('Actual preview ownership: '+app.artifactDir);
 }
});
