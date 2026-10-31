// Real packaged-page geometry; no CSS-string-only proof or DOM replacement.
import assert from 'node:assert/strict';
export function readMobileGalleryLayout(rootId='gallery-content'){
 const root=document.getElementById(rootId),tools=root?.querySelector('.wb-gallery-tools'),grid=root?.querySelector('.wb-gallery-grid');if(!tools||!grid?.firstElementChild)return null;
 const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 return {mobile:document.body.classList.contains('mobile-client'),viewport:{width:innerWidth,height:innerHeight},pageWidth:document.documentElement.scrollWidth,tools:{...rect(tools),scrollWidth:tools.scrollWidth,clientWidth:tools.clientWidth,scrollLeft:tools.scrollLeft},card:rect(grid.firstElementChild),commands:[...tools.querySelectorAll('button')].filter(node=>!node.hidden&&getComputedStyle(node).display!=='none').map(node=>({action:node.dataset.apiAction,label:node.textContent,...rect(node)}))};
}
export function assertMobileGalleryLayout(layout){
 assert(layout?.mobile,'Exercise the actual mobile client');assert(layout.viewport.width<700&&layout.viewport.height>layout.viewport.width,'The narrow portrait gate is not tablet/landscape acceptance');
 assert.deepEqual(layout.commands.map(row=>row.action),['rules.open','playlist.start','grid.open','gallery.refresh','gallery.shuffle','gallery.restore','gallery.orders','gallery.resume','viewer.open','settings.open'].map(id=>'rhvideo.'+id));
 assert(layout.tools.height<=64,'Screenshot gallery tools must stay one accessible row: '+JSON.stringify(layout));assert(layout.pageWidth<=layout.viewport.width+1,'Toolbar overflow must not widen the page');
 assert(layout.card.top<layout.viewport.height*.75,'Keep the first screenshot reachable without a page of toolbars');for(const command of layout.commands)assert(command.width>=44&&command.height>=44,'Preserve touch targets: '+JSON.stringify(command));
}
export async function swipeMobileGalleryTools(page,rootId='gallery-content'){
 const snapshot=()=>page.evaluate('('+readMobileGalleryLayout.toString()+')('+JSON.stringify(rootId)+')');
 const before=await snapshot();assert(before);assert(before.tools.scrollWidth>before.tools.clientWidth+1,'Exercise real overflow rather than a desktop-width row');
 await page.evaluate('(()=>{const tools=document.getElementById('+JSON.stringify(rootId)+').querySelector(".wb-gallery-tools");window.__qaGalleryToolbar={clicks:0};tools.addEventListener("click",()=>__qaGalleryToolbar.clicks++,true);return true;})()');
 const gestures=[];
 for(let attempt=0;attempt<4;attempt++){
  const layout=await snapshot(),last=layout.commands.at(-1);if(last.right<=layout.tools.right+1&&last.left>=layout.tools.left-1)break;
  const from=layout.tools.right-24,to=layout.tools.left+24,y=layout.tools.top+layout.tools.height/2;let touching=false;
  try{await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y}]});touching=true;for(let step=1;step<=10;step++){await page.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*step/10,y}]});await new Promise(resolve=>setTimeout(resolve,20));}await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}finally{if(touching)await page.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}).catch(()=>{});}gestures.push({attempt,before:layout.tools.scrollLeft});
  await new Promise(resolve=>setTimeout(resolve,120));
 }
 const after=await snapshot(),clicks=await page.evaluate('__qaGalleryToolbar.clicks');assert.equal(clicks,0,'Swiping must not invoke a toolbar operation');assert(after.tools.scrollLeft>before.tools.scrollLeft,'Real touch must move the gallery row');const last=after.commands.at(-1);assert(last.left>=after.tools.left-1&&last.right<=after.tools.right+1,'Settings at the row end must remain touch reachable');
 await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:last.left+last.width/2,y:last.top+last.height/2}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return {before,after,clicks,gestures};
}
export async function exerciseMobileGalleryLayout({page,until,server,receipt,screenshot=async()=>{}}){
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');await api('connection.connect',{server,username:'preview',password:'fixture-only'});
 for(const [name,rootId]of [['main','gallery-content'],['popup','wb-gallery']]){
  const row={};(receipt.mobileGallery??={})[name]=row;
  if(name==='main')row.opened=await api('gallery.show');else{await api('category',{kind:'video'});row.opened=await api('gallery.open');assert.equal(await page.evaluate('document.getElementById("wb-gallery").open'),true);}
  assert.equal(row.opened.total,32,'Generated fixture has actual screenshots, not only pictures');row.before=await until(()=>page.evaluate('('+readMobileGalleryLayout.toString()+')('+JSON.stringify(rootId)+')'),'actual '+name+' gallery geometry');await screenshot('gallery-'+name+'-before');assertMobileGalleryLayout(row.before);
  row.swipe=await swipeMobileGalleryTools(page,rootId);await until(()=>page.evaluate('document.getElementById("wb-settings")?.open'),'actual settings from '+name+' end-of-row touch');await api('panel.close',{id:'wb-settings'});
  assert.equal(await page.evaluate('document.activeElement.closest("dialog")?.id||null'),name==='popup'?'wb-gallery':null,'Settings must return to the producing gallery, not dismiss it');row.after=await page.evaluate('('+readMobileGalleryLayout.toString()+')('+JSON.stringify(rootId)+')');assertMobileGalleryLayout(row.after);await screenshot('gallery-'+name+'-return');if(name==='popup')await api('panel.close',{id:'wb-gallery'});
 }
 assert.deepEqual((await api('ui.contract')).missing,[]);receipt.passed=true;
}
