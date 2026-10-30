// Shared Windows/owned-Android business scenario, using only generated data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {root} from './source.mjs';
import {until} from './app-session.mjs';
import {checkMobileCatalogLayout,swipeMobileCatalogToolbars,visibleCatalogCovers} from './rhvideo-mobile-catalog-layout.mjs';
export function configureVideoOrderFixture(fixture){
  assert.equal(fixture.videos.length,52);
  fixture.videos.forEach((row,i)=>Object.assign(row,{original_filename:'片段'+(i%13)+'.mp4',original_filesize:i%3,source_size:10000-i,created_at:new Date(Date.UTC(2026,0,1+i%3)).toISOString()}));fixture.videos[0].title='独立显示标题';
}
export async function checkPackagedVideoOrder(view,server,fixture){
  assert.equal(new URL(server).port,new URL(fixture.url).port,'Use this exact generated fixture server');
  const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');let sortReference;
  for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
    const node=parse(script[1],{ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='applyVideoSort');if(node)sortReference=vm.runInNewContext('('+script[1].slice(node.start,node.end)+')');
  }assert(sortReference,'Use the real reference sort function');
  for(const name of ['rhvideo-index.js','rhvideo-workbench.js']){
    const value=await view.evaluate('fetch('+JSON.stringify('js/'+name)+').then(r=>r.text())'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(hash(value),hash(fs.readFileSync(path.join(root,'src/js',name))),'Exact packaged '+name);
  }
  const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
  await invoke('category',{kind:'video'});await invoke('connection.connect',{server,username:'preview',password:'fixture-only'});
  const orders=[];
  for(const [sort,by]of [['nameAsc','name'],['dateDesc','date-desc'],['dateAsc','date-asc'],['sizeAsc','size-asc'],['sizeDesc','size-desc']]){
    const expected=Array.from(sortReference(fixture.videos,by),row=>row.id),first=await invoke('sort',{value:sort});assert.deepEqual(first.items.map(row=>row.id),expected.slice(0,36));
    assert.deepEqual(await view.evaluate("[...document.querySelectorAll('.media-card')].map(row=>row.dataset.id)"),expected.slice(0,36));
    const second=await invoke('page.jump',{page:2});assert.deepEqual(second.items.map(row=>row.id),expected.slice(36));
    assert.deepEqual(await view.evaluate("[...document.querySelectorAll('.media-card')].map(row=>row.dataset.id)"),expected.slice(36));orders.push({sort,ids:expected});
    console.log('Verified packaged reference order: '+sort+' / '+expected.length+' videos / both pages');
  }
  const chosen=['video-50','video-0','video-20'];for(const id of chosen)await invoke('selection.toggle',{kind:'video',id,enabled:true});
  await invoke('search',{query:'no selected item matches this'});assert.equal((await invoke('state')).total,0);
  const expected=Array.from(sortReference(fixture.videos,'size-desc'),row=>row.id).filter(id=>chosen.includes(id));
  const confirmation=await invoke('replacement.selected',{resolution:'1280x720',crf:30});
  const body=await view.evaluate("JSON.parse(document.querySelector('#wb-confirm .wb-details pre').textContent)");assert.deepEqual(body.video_ids,expected);assert.equal(fixture.batches.length,0);
  await invoke('confirm.advance',{ticket:confirmation.ticket});assert.equal(fixture.batches.length,0);
  await invoke('selection.toggle',{kind:'video',id:'new-selection-after-confirmation',enabled:true});
  await invoke('confirm.advance',{ticket:confirmation.ticket});assert.equal(fixture.batches.length,1);assert.deepEqual(fixture.batches[0].video_ids,expected);
  await assert.rejects(invoke('confirm.advance',{ticket:confirmation.ticket}),/失效/);assert.equal(fixture.requests.filter(row=>row.method==='POST'&&row.path==='/api/v1/replace-batches').length,1);
  await invoke('selection.clear');for(const id of ['video-0','missing-from-new-index'])await invoke('selection.toggle',{kind:'video',id,enabled:true});
  const missing=await invoke('replacement.selected',{resolution:'',crf:30}),missingBody=await view.evaluate("JSON.parse(document.querySelector('#wb-confirm .wb-details pre').textContent)");assert.deepEqual(missingBody.video_ids,['video-0','missing-from-new-index']);
  await invoke('panel.close',{id:'wb-confirm'});await assert.rejects(invoke('confirm.advance',{ticket:missing.ticket}),/失效/);assert.equal(fixture.batches.length,1);
  // Leave a real populated page for the platform screenshot, not the temporary
  // no-match filter used to verify selection independence.
  await invoke('search',{query:''});await invoke('page.jump',{page:1});
  assert.deepEqual(await view.evaluate("[...document.querySelectorAll('.media-card')].map(row=>row.dataset.id)"),orders.at(-1).ids.slice(0,36));
  assert.deepEqual((await invoke('ui.contract')).missing,[]);
  const state=await invoke('state');assert.equal(state.connected,true);assert.equal(new URL(state.server).href,new URL(server).href);
  const layout=await checkMobileCatalogLayout(view);
  if(layout.mobile&&layout.width<700){
    const css=await view.evaluate("fetch('css/rhvideo-mobile.css').then(r=>r.text())");
    assert.equal(createHash('sha256').update(css).digest('hex'),createHash('sha256').update(fs.readFileSync(path.join(root,'android/web/css/rhvideo-mobile.css'))).digest('hex'),'Use the actual current mobile layout');
    layout.gestures=await swipeMobileCatalogToolbars(view);
    console.log(JSON.stringify({checkpoint:'mobile-catalog-layout',firstCardTop:layout.firstCard.top,viewportHeight:layout.height,toolbarHeights:layout.toolbars.map(row=>row.height),gestures:layout.gestures}));
    const summary=()=>view.evaluate("(()=>{const node=document.querySelector('.wb-rules-summary');return {visible:getComputedStyle(node).display!=='none',clear:!!node.querySelector('[data-api-action=\"rhvideo.rules.clear\"]'),text:node.textContent};})()");
    assert.equal((await summary()).visible,false,'An empty duplicate summary must not occupy another row');
    await invoke('rules.apply',{rule:{mode:'and',include:['城市观察'],exclude:[]}});
    layout.activeRuleSummary=await summary();assert.equal(layout.activeRuleSummary.visible,true);assert.equal(layout.activeRuleSummary.clear,true);assert.match(layout.activeRuleSummary.text,/城市观察/);
    const filtered=await invoke('state'),expectedFiltered=orders.at(-1).ids.filter(id=>fixture.videos.find(row=>row.id===id).folder_label==='城市观察');
    assert.equal(filtered.total,expectedFiltered.length);assert.deepEqual(filtered.items.map(row=>row.id),expectedFiltered);
    // Public state deliberately projects folder_label to folder; assert the
    // actual documented snapshot, not a raw backend-only field.
    assert(filtered.items.every(row=>row.folder==='城市观察'));
    await invoke('rules.apply',{rule:{mode:'and',include:[],exclude:[]}});assert.equal((await summary()).visible,false);assert.equal((await invoke('state')).total,52);
    assert.deepEqual((await invoke('ui.contract')).missing,[]);
    layout.visibleCovers=await until(()=>view.evaluate('('+visibleCatalogCovers.toString()+')()'),'all actually visible fixture covers decoded after clearing the rule',10000);
  }
  return {orders,replacement:expected,missingSelection:missingBody.video_ids,submittedBatches:fixture.batches.length,layout};
}
