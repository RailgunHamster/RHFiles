import assert from 'node:assert/strict';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
export async function imageDecodeFixture({failFavoriteIds=[]}={}){
 const gates=new Map([99,96,94,35,34].map(n=>[n,deferred()]));let initial=false,timeout=false;
 const fixture=await rhvideoFixture({videoCount:0,galleryVideoCount:0,pictureCount:100,failFavoriteIds,
  beforeCatalog:(kind,rows)=>{if(kind==='picture')rows.forEach((row,i)=>{row.original_filename=String(i).padStart(3,'0')+'.webp';if(initial&&i===35)row.webp_path='pictures/initial35.svg';if(timeout&&i===34)row.webp_path='pictures/initial34.svg';});},
  beforeMedia:async({path,image})=>{if(!image)return;const match=path.match(/^\/storage\/pictures\/(\d+)\.svg$/);const n=path==='/storage/pictures/initial35.svg'?35:path==='/storage/pictures/initial34.svg'?34:match?Number(match[1]):-1;if(gates.has(n)&&(n!==35||initial)&&(n!==34||timeout))await gates.get(n).promise;if(n===98)return {body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><broken'),contentType:'image/svg+xml'};}
 });
 return {...fixture,armInitial:()=>{initial=true;},armTimeout:()=>{timeout=true;},release:n=>{assert(gates.has(n));gates.get(n).resolve();},releaseAll:()=>gates.forEach(g=>g.resolve())};
}
export async function exerciseImageDecode({page,until,server,fixture,receipt,screenshot=async()=>{}}){
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const begin=(label,ratio)=>page.evaluate(`(()=>{window.__qaImageDecodes??={};const row=__qaImageDecodes[${JSON.stringify(label)}]={done:false};RHFilesAPI.invoke('rhvideo.image.seek',{ratio:${ratio}}).then(value=>{row.value=value;row.done=true;},error=>{row.error=String(error);row.done=true;});return true;})()`);
 const finish=(label,budget)=>until(()=>page.evaluate('window.__qaImageDecodes?.['+JSON.stringify(label)+']?.done?__qaImageDecodes['+JSON.stringify(label)+']:null'),'actual image action '+label,budget);
 const requested=n=>fixture.requests.some(r=>r.path==='/storage/pictures/'+n+'.svg');
 const caption=async(name,title,index,source)=>{
  const state=await api('image.state'),ui=await page.evaluate('(()=>({title:document.getElementById("image-title").textContent,position:document.getElementById("image-position").textContent,status:document.getElementById("image-load-status").textContent,alt:document.getElementById("full-image").alt}))()');
  assert.equal(ui.title,title,'The visible caption must identify its actual target');assert.equal(ui.position,(index+1)+' / 100');assert.equal(ui.alt,title);assert.equal(state.caption.title,title);assert.equal(state.caption.index,index);assert.equal(state.caption.source,source);assert.equal(ui.status,state.status);(receipt.captions??={})[name]={...ui,caption:state.caption,requested:state.requested,failed:state.failed};return state;
 };
 await api('connection.connect',{server,username:'preview',password:'fixture-only'});await api('category',{kind:'picture'});await api('sort',{value:'nameAsc'});await api('media.open',{kind:'picture',id:'picture-0'});
 assert.equal((await api('image.state')).current.id,'picture-0');
 await begin('held',1);await until(()=>requested(99),'actual offscreen image HTTP request');
 const held=receipt.held=await api('image.state');assert.equal(held.loading,true,'Metadata is not a decoded picture');assert.equal(held.current.id,'picture-0');assert.equal(held.index,0);assert.equal(held.requestedIndex,99);assert.equal(await page.evaluate('__qaImageDecodes.held.done'),false);
 const pending=await caption('held','000.webp',0,'current');assert.equal(pending.requested.id,'picture-99');assert.match(pending.status,/099.webp/);
 assert.equal(await page.evaluate('!document.getElementById("image-load-status").hidden'),true);await screenshot('image-decode-held');
 fixture.release(99);const completed=await finish('held');assert.equal(completed.error,undefined);const ready=receipt.ready=await api('image.state');assert.equal(ready.loading,false);assert.equal(ready.error,'');assert.equal(ready.index,99);
 assert.equal((await caption('ready','099.webp',99,'current')).requested,null);
 assert.equal(await page.evaluate('(()=>{const i=document.getElementById("full-image");return i.complete&&i.naturalWidth===800&&i.naturalHeight===500;})()'),true);await screenshot('image-decode-ready');
 await begin('invalid',98/99);const failed=await finish('invalid');assert.match(failed.error,/图片/);const error=receipt.error=await api('image.state');assert.equal(error.loading,false);assert.equal(error.index,99);assert.equal(error.current.id,'picture-99');assert.match(error.error,/图片/);
 const retained=await caption('retained-after-error','099.webp',99,'current');assert.equal(retained.failed.id,'picture-98');assert.equal(retained.failed.index,98);assert.match(retained.status,/098.webp/);
 assert.equal(await page.evaluate('!document.getElementById("image-load-status").hidden&&document.getElementById("image-load-status").classList.contains("is-error")'),true);await screenshot('image-decode-error');
 assert.equal(fixture.requests.filter(r=>r.path==='/storage/pictures/98.svg').length,1,'Do not automatically retry an undecodable image');
 await begin('retired',96/99);await until(()=>requested(96),'held former image');await begin('newer',95/99);assert.equal((await finish('newer')).error,undefined);fixture.release(96);assert.equal((await finish('retired')).value.stale,true);
 const newer=receipt.newer=await api('image.state');assert.equal(newer.current.id,'picture-95');assert.equal(newer.error,'');assert.equal(newer.loading,false);
 assert.equal((await caption('newer','095.webp',95,'current')).failed,null);
 await begin('closed',94/99);await until(()=>requested(94),'held image before close');await api('image.close');fixture.release(94);assert.equal((await finish('closed')).value.stale,true);assert.equal((await api('image.state')).opened,false);
 fixture.armInitial();await api('refresh');await page.evaluate("(()=>{const row=__qaImageDecodes.initial={done:false};RHFilesAPI.invoke('rhvideo.media.open',{kind:'picture',id:'picture-35'}).then(value=>{row.value=value;row.done=true;},error=>{row.error=String(error);row.done=true;});return true;})()");await until(()=>fixture.requests.some(r=>r.path==='/storage/pictures/initial35.svg'),'initial uncached picture held');
 const initial=receipt.initial=await until(async()=>{const s=await api('image.state');return s.opened&&s.loading?s:null;},'first loading exposes Close/Back before decoding');assert.equal(initial.opened,true);assert.equal(initial.loading,true);await screenshot('image-initial-loading');
 const first=await caption('initial','035.webp',35,'requested');assert.equal(first.current,null);assert.equal(first.requested.id,'picture-35');
 await api('settings.open');assert.equal(await page.evaluate('document.activeElement.closest("dialog")?.id'),'wb-settings');fixture.release(35);assert.equal((await finish('initial')).error,undefined);assert.equal(await page.evaluate('document.activeElement.closest("dialog")?.id'),'wb-settings','Decoding must not re-raise the image over a newer panel');
 await api('panel.close',{id:'wb-settings'});await api('image.close');
 fixture.armTimeout();await api('refresh');await page.evaluate("(()=>{const row=__qaImageDecodes.timeout={done:false};RHFilesAPI.invoke('rhvideo.media.open',{kind:'picture',id:'picture-34'}).then(value=>{row.value=value;row.done=true;},error=>{row.error=String(error);row.done=true;});return true;})()");await until(()=>fixture.requests.some(r=>r.path==='/storage/pictures/initial34.svg'),'genuine image timeout request');
 const timedOut=await finish('timeout',25000);assert.match(timedOut.error,/图片/);receipt.timeout=await api('image.state');assert.equal(receipt.timeout.current,null);assert.equal(receipt.timeout.loading,false);assert.match(receipt.timeout.error,/图片/);assert.equal(await page.evaluate('document.getElementById("full-image").getAttribute("src")'),null,'Failure must revoke the still-pending source');const absent=await caption('timeout','034.webp',34,'failed');assert.equal(absent.current,null);assert.equal(absent.failed.id,'picture-34');fixture.release(34);assert.equal(fixture.requests.filter(r=>r.path==='/storage/pictures/initial34.svg').length,1);await screenshot('image-decode-timeout');await api('image.close');
 assert.deepEqual((await api('ui.contract')).missing,[]);receipt.passed=true;
}
