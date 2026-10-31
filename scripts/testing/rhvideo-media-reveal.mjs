import assert from 'node:assert/strict';
import {observeVisibleCoverSettlement} from './rhvideo-visible-cover-settle.mjs';
// Observe only the real catalog boundary. Arguments/results are not replaced,
// operations are never replayed and all HTTP/worker/native media remain real.
export const observeMediaRevealScript=`(()=>{
 Object.defineProperty(window,'RHVideoWorkbench',{configurable:true,set(value){
  const install=value.install;
  value.install=function(ctx){
   window.__qaPresentationNative=ctx.native;window.__qaCatalogReads=[];window.__qaObserveCatalog=false;
   const result=install.call(this,ctx),catalog=result.catalog;
   result.catalog=function(...args){
    const row=window.__qaObserveCatalog&&__qaCatalogReads.length<64?{offset:ctx.state.offset,loadId:ctx.state.loadId,status:'pending'}:null;
    if(row)__qaCatalogReads.push(row);
    return catalog.apply(this,args).then(value=>{if(row){row.status='fulfilled';row.ids=value.items.map(v=>v.id);row.total=value.total;row.finalOffset=value.offset;}return value;},error=>{if(row)row.status='rejected';throw error;});
   };return result;
  };Object.defineProperty(window,'RHVideoWorkbench',{value,writable:true,configurable:true});
 }});
})()`;

export async function exerciseMediaReveal({page,until,server,receipt}){
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 await api('connection.connect',{server,username:'preview',password:'fixture-only'});
 await api('category',{kind:'picture'});await api('sort',{value:'nameAsc'});
 await api('page.jump',{page:3});const before=await api('state');assert.equal(before.offset,72);assert(before.items.length>0);const target=before.items.at(-1);assert.equal(target.kind,'picture');
 await api('media.open',{kind:'picture',id:target.id});await until(async()=>{const s=await api('image.state');return s.opened&&!s.loading&&s.current.id===target.id;},'actual off-page image decoded');
 await page.evaluate('__qaObserveCatalog=true;true');const started=performance.now();
 const completion=await page.evaluate('RHFilesAPI.invoke("rhvideo.image.reveal").then(result=>({result,highlighted:document.querySelector(".media-card.wb-revealed")?.dataset.id}))');
 receipt.revealed=completion.result;receipt.revealHostMs=performance.now()-started;assert.equal(completion.highlighted,target.id,'The actual target card is highlighted at completion');
 const reads=receipt.reads=await page.evaluate('__qaCatalogReads'),after=receipt.after=await api('state');receipt.target={id:target.id,offset:before.offset};
 assert.equal(reads.length,1,'Locate must not load/render a preliminary first page');assert.equal(reads[0].status,'fulfilled');assert(reads[0].ids.includes(target.id));assert(reads[0].ids.length<=36);
 assert.equal(after.offset,before.offset);assert.equal(after.kind,'picture');assert.equal(after.view,'catalog');assert.equal(after.error,'');assert(after.items.some(v=>v.id===target.id));
 assert.equal((await api('image.state')).opened,false,'Successful location closes its preview');
 receipt.visible=await until(()=>page.evaluate(`(()=>{const n=[...document.querySelectorAll('.media-card')].find(n=>n.dataset.id===${JSON.stringify(target.id)}&&n.dataset.kind==='picture'),r=n?.getBoundingClientRect(),img=n?.querySelector('img');return r&&r.bottom>0&&r.top<innerHeight&&img?.complete&&img.naturalWidth>0?{top:r.top,bottom:r.bottom,width:img.naturalWidth,height:img.naturalHeight}:null;})()`),'the actual target is scrolled into view with a decoded cover');
 await observeVisibleCoverSettlement({page,until,receipt});
 receipt.passed=true;
}
