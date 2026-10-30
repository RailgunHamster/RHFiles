// Read-only geometry from the real packaged page, not CSS-string inference.
import assert from 'node:assert/strict';
export function visibleCatalogCovers(){
  // Sample visible cover containers: a missing/hidden failed IMG must not drop
  // out of the sample and let the remaining successful images pass the gate.
  const covers=[...document.querySelectorAll('.media-card .cover-button')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;});
  const images=covers.map(node=>node.querySelector('img'));
  const ready=node=>{if(!node||!node.complete||node.naturalWidth<=0||!node.classList.contains('loaded'))return false;const r=node.getBoundingClientRect(),style=getComputedStyle(node);return r.width>0&&r.height>0&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>=.99;};
  if(images.length<2||images.some(node=>!ready(node)))return null;
  return images.map(node=>({width:node.naturalWidth,height:node.naturalHeight}));
}
export async function checkMobileCatalogLayout(view){
  const layout=await view.evaluate(`(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height,width:r.width};};
    return {mobile:document.body.classList.contains('mobile-client'),width:innerWidth,height:innerHeight,
      firstCard:rect(document.querySelector('.media-card')),
      toolbars:[...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden])')].filter(node=>getComputedStyle(node).display!=='none').map(node=>({
        ...rect(node),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,
        commands:[...node.querySelectorAll('button:not([hidden]),select:not([hidden])')].filter(button=>getComputedStyle(button).display!=='none').map(button=>({action:button.dataset.apiAction,...rect(button)}))})),
      volumeDirection:getComputedStyle(document.querySelector('.rhvideo-master-volume')).flexDirection};
  })()`);
  if(!layout.mobile||layout.width>=700)return layout;
  assert(layout.height>layout.width,'This portrait geometry gate must not stand in for landscape acceptance');
  assert(layout.firstCard.top<layout.height*.6,'Library controls consume most of the actual phone viewport: '+JSON.stringify(layout));
  assert.equal(layout.volumeDirection,'row','The volume label and slider must not create a second header row');
  assert(layout.toolbars.length>=2,'Exercise both the workflow and selection toolbars');
  for(const bar of layout.toolbars){
    assert(bar.height<=64,'A narrow toolbar must remain one accessible scroll row: '+JSON.stringify(bar));
    for(const command of bar.commands){assert(command.action,'Keep semantic APIs for every toolbar command');assert(command.width>=44&&command.height>=44,'Do not gain space by shrinking touch targets: '+JSON.stringify(command));}
  }
  return layout;
}

// Actual WebView touch input, not a scrollLeft assignment or replaced button
// handler. This is a CDP gesture, not a claim about physical-device input.
export async function swipeMobileCatalogToolbars(view){
  const bars=await view.evaluate(`(()=>{const nodes=[...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden])')].filter(node=>getComputedStyle(node).display!=='none');return nodes.map((node,index)=>{const r=node.getBoundingClientRect();return {index,left:r.left,right:r.right,y:r.top+r.height/2,overflow:node.scrollWidth>node.clientWidth+1};});})()`),gestures=[];
  for(const bar of bars){
    if(!bar.overflow)continue;
    await view.evaluate(`(()=>{const node=[...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden])')].filter(node=>getComputedStyle(node).display!=='none')[${bar.index}];window.__catalogSwipe={node,clicks:0,before:node.scrollLeft};window.__catalogSwipe.observe=()=>window.__catalogSwipe.clicks++;node.addEventListener('click',window.__catalogSwipe.observe,true);return true;})()`);
    let touching=false;
    try{
      const from=bar.right-24,to=bar.left+24;
      await view.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y:bar.y}]});touching=true;
      for(let step=1;step<=10;step++){await view.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*step/10,y:bar.y}]});await new Promise(resolve=>setTimeout(resolve,20));}
      await view.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;
      const until=Date.now()+2000;let result;
      do{result=await view.evaluate('({delta:window.__catalogSwipe.node.scrollLeft-window.__catalogSwipe.before,clicks:window.__catalogSwipe.clicks})');if(result.delta>1)break;await new Promise(resolve=>setTimeout(resolve,50));}while(Date.now()<until);
      assert(result.delta>1,'A horizontal touch gesture must reveal the other commands');assert.equal(result.clicks,0,'Scrolling cannot activate a toolbar command');gestures.push({index:bar.index,...result});
    }finally{
      if(touching)await view.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      await view.evaluate('window.__catalogSwipe.node.removeEventListener("click",window.__catalogSwipe.observe,true);delete window.__catalogSwipe;true');
    }
  }
  assert.equal(gestures.length,2,'Both narrow workflow and selection rows must remain reachable by touch');
  return gestures;
}
