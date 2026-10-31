import assert from 'node:assert/strict';
import {visibleCoverReadiness} from './rhvideo-visible-covers.mjs';

// Same real DOM/decode/request assertions on Windows and Android. The caller
// supplies only its generated fixture and does not replace a UI handler.
export async function exerciseVisibleCardCache({page,server,fixture,receipt,onSnapshot=()=>{}}){
 const invoke=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const ready=async()=>{await page.evaluate('('+visibleCoverReadiness.toString()+')("#media-grid .cover-button")');await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
 await invoke('category',{kind:'video'});await invoke('connection.connect',{server,username:'preview',password:'fixture-only'});
 await invoke('search',{query:'qing chen'});await ready();
 const before=await page.evaluate('(()=>{window.__qaSeenCards=[...document.querySelectorAll("#media-grid .media-card")].filter(card=>{const r=card.querySelector(".cover-button").getBoundingClientRect();return r.width>0&&r.height>0&&r.left<innerWidth&&r.top<innerHeight&&r.right>0&&r.bottom>0;}).map(card=>({card,image:card.querySelector("img"),id:card.dataset.id}));return {visible:__qaSeenCards.length,bytes:__qaSeenCards.reduce((n,v)=>n+v.image.naturalWidth*v.image.naturalHeight*4,0),ids:__qaSeenCards.map(v=>v.id),viewport:{width:innerWidth,height:innerHeight}};})()');
 assert(before.visible>0);assert(before.bytes<=16*1024*1024,'Actual visible workload must fit the unchanged cache budget');
 const visible=new Set(before.ids),reads=()=>fixture.requests.filter(r=>r.path.endsWith('/thumbnail')&&visible.has(r.path.split('/').at(-2))).length,initialReads=reads();assert(initialReads>0);
 await invoke('search',{query:'海边'});await ready();await invoke('search',{query:'qing chen'});await ready();
 const result=await page.evaluate('(()=>{const current=new Map([...document.querySelectorAll("#media-grid .media-card")].map(v=>[v.dataset.id,v]));return {sameCards:__qaSeenCards.every(v=>current.get(v.id)===v.card),sameImages:__qaSeenCards.every(v=>v.card.querySelector("img")===v.image&&v.image.complete&&v.image.naturalWidth>0),replaced:__qaSeenCards.filter(v=>current.get(v.id)!==v.card).map(v=>v.id)};})()');
 receipt.visibleCardCache={before,result,initialReads,finalReads:reads()};onSnapshot(receipt.visibleCardCache);
 assert.equal(result.sameCards,true,'Actual previously visible cards, not unseen bottom rows, must survive the alternate list');assert.equal(result.sameImages,true);assert.equal(reads(),initialReads,'Returning to a seen page must not reread its visible thumbnails');receipt.passed=true;
}
