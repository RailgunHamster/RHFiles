import assert from 'node:assert/strict';

// Observation only. Do not call decode(), change src, scroll, focus, reload or
// requestAnimationFrame: those would assist the product under investigation.
export function collectVisibleCovers(){
 const covers=[];
 for(const card of document.querySelectorAll('#media-grid .media-card')){
  const cover=card.querySelector('.cover-button'),r=cover?.getBoundingClientRect();
  if(!r||r.width<=0||r.height<=0||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)continue;
  const image=cover.querySelector('img'),style=image?getComputedStyle(image):null;
  covers.push({key:card.dataset.kind+':'+card.dataset.id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,connected:!!image?.isConnected,hasSource:!!image?.getAttribute('src'),complete:!!image?.complete,width:image?.naturalWidth||0,height:image?.naturalHeight||0,loaded:!!image?.classList.contains('loaded'),hidden:!!image?.hidden,opacity:style?Number(style.opacity):0,display:style?.display||'',visibility:style?.visibility||'',placeholder:!!cover.querySelector('.cover-empty')});
 }
 return {documentVisible:document.visibilityState==='visible',viewport:{width:innerWidth,height:innerHeight},covers};
}
export function visibleCoversSettled(sample){
 return sample?.documentVisible===true&&Array.isArray(sample.covers)&&sample.covers.length>0&&sample.covers.length<=100&&sample.covers.every(c=>c.connected===true&&c.hasSource===true&&c.complete===true&&c.width>0&&c.height>0&&c.loaded===true&&c.hidden===false&&Number.isFinite(c.opacity)&&c.opacity>=.98&&c.display!=='none'&&c.visibility==='visible'&&c.placeholder===false);
}
export async function observeVisibleCoverSettlement({page,until,receipt}){
 const observation=receipt.visibleCovers={budgetMs:20000,completed:false,changes:[]},started=performance.now();let signature;
 try{
  await until(async()=>{
   const sample=await page.evaluate('('+collectVisibleCovers.toString()+')()');assert(sample.covers.length<=100);
   const row={elapsedMs:performance.now()-started,...sample};observation.first??=row;observation.last=row;
   const next=JSON.stringify(sample.covers.map(c=>[c.key,c.connected,c.hasSource,c.complete,c.width,c.height,c.loaded,c.hidden,c.opacity,c.display,c.visibility,c.placeholder]));
   if(next!==signature&&observation.changes.length<32){signature=next;observation.changes.push(row);}
   return visibleCoversSettled(sample);
  },'every viewport-visible catalog cover is decoded and painted, without assisting it',observation.budgetMs);
  observation.completed=true;
 }finally{observation.elapsedMs=performance.now()-started;}
}
