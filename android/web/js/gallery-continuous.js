/* Free horizontal position, three decoded pages, bounded inertial scrolling. */
const androidContinuousGallery=(()=>{
  function open(entry,entries,app,register){
    const seen=new Set(),images=entries.filter(item=>!item.isDir&&item.kind==='image'&&!seen.has(item.path)&&seen.add(item.path));
    if(!seen.has(entry.path))images.push(entry);
    let index=images.findIndex(item=>item.path===entry.path),position=index,zoom=1,rotation=0,x=0,y=0,origin=null,moved=false,frame=0,tapTimer,samples=[],lastTime=0,velocity=0,pinching=false;
    if(!ui.openSheet('',[]))return;
    const panel=document.getElementById('sheet-panel');panel.classList.add('viewer','image-viewer','continuous-viewer');
    const controller=new AbortController(),signal=controller.signal,points=new Map(),pages=new Map(),cache=new Map();
    const viewport=ui.el('div','media-viewport'),track=ui.el('div','gallery-track'),header=ui.el('header','viewer-topbar'),title=ui.el('div','viewer-filename'),toolbar=ui.el('div','viewer-toolbar'),info=ui.el('div','viewer-info');
    title.id='viewer-filename';viewport.append(track);panel.append(viewport,header,toolbar,info);
    function icon(label,name,fn){const b=app.button('',name,fn,'media-icon-btn');b.setAttribute('aria-label',label);b.title=label;b.querySelector('span')?.remove();return b;}
    function stop(){cancelAnimationFrame(frame);frame=0;velocity=0;}
    function transform(){const image=pages.get(index)?.querySelector('img');if(image)image.style.transform=`translate(${x}px,${y}px) scale(${zoom}) rotate(${rotation}deg)`;}
    function render(){
      if(signal.aborted)return;
      const previousIndex=index;index=Math.max(0,Math.min(images.length-1,Math.round(position)));
      if(previousIndex!==index){for(const page of pages.values())page.querySelector('img').style.transform='';zoom=1;x=y=0;rotation=0;}
      title.textContent=images[index].name;info.textContent=(index+1)+' / '+images.length;previous.disabled=position<=0;next.disabled=position>=images.length-1;
      for(const [at,page]of pages)if(Math.abs(at-index)>1){page.querySelector('img').removeAttribute('src');page.remove();pages.delete(at);}
      for(const at of [index,index+1,index-1].filter(at=>at>=0&&at<images.length)){
        let page=pages.get(at);
        if(!page){
          const item=images[at];page=ui.el('div','gallery-page');page.dataset.imageIndex=String(at);pages.set(at,page);
          const image=new Image(),status=ui.el('div','gallery-load-state','正在读取图片…');image.className='full-media';image.alt=item.name;image.decoding='async';image.draggable=false;
          image.onload=()=>{status.hidden=true;};image.onerror=()=>{status.hidden=false;status.textContent='图片无法解码';};page.append(image,status);track.append(page);
          const key=JSON.stringify([item.path,item.modifiedMs,item.size]);
          if(!cache.has(key)){if(cache.size>=5)cache.delete(cache.keys().next().value);cache.set(key,api.imageUrl(item));}
          cache.get(key).then(url=>{if(!signal.aborted&&pages.get(at)===page)image.src=url;}).catch(error=>{if(!signal.aborted&&pages.get(at)===page){status.textContent='无法查看图片：'+(error.message||error);}});
        }
        page.style.left=(at-index)*100+'%';page.dataset.relative=String(at-index);
      }
      track.style.transform=`translateX(${-(position-index)*viewport.clientWidth}px)`;
    }
    function put(value){position=Math.max(0,Math.min(images.length-1,value));render();}
    function jump(delta){stop();points.clear();origin=null;zoom=1;x=y=0;rotation=0;put(Math.max(0,Math.min(images.length-1,index+delta)));transform();}
    const controls={previous:()=>jump(-1),next:()=>jump(1),fit:()=>{stop();zoom=1;x=y=0;transform();},rotate:()=>{stop();rotation=(rotation+90)%360;transform();},zoomOut:()=>{stop();zoom=Math.max(.25,zoom/1.4);transform();},zoomIn:()=>{stop();zoom=Math.min(8,zoom*1.4);transform();}};
    header.append(icon('返回文件列表','back',()=>ui.closeSheet()),title,icon('逐张翻页','paged',()=>androidGallery.setMode('paged')),icon('分享图片','share',()=>images[index].path.startsWith('remote://')?ui.toast('网络图片可先保存到本机，再使用系统分享'):api.shareFile(images[index].path)));
    const previous=icon('上一张','previous',controls.previous),next=icon('下一张','next',controls.next);
    toolbar.append(previous,icon('缩小','zoomOut',controls.zoomOut),icon('适应','fit',controls.fit),icon('旋转','rotate',controls.rotate),icon('放大','zoomIn',controls.zoomIn),next);
    const clearView=register({mode:'continuous',entry:()=>images[index],entries,app,controls,state:()=>({path:images[index].path,index,count:images.length,position,zoom,rotation})});
    function momentum(now){
      if(signal.aborted)return;const dt=Math.min(40,Math.max(0,now-lastTime));lastTime=now;
      const nextPosition=Math.max(0,Math.min(images.length-1,position+velocity*dt));put(nextPosition);velocity*=Math.exp(-dt/130);
      if(Math.abs(velocity)*viewport.clientWidth<.015||nextPosition===0||nextPosition===images.length-1||now-origin.release>700){frame=0;velocity=0;return;}
      frame=requestAnimationFrame(momentum);
    }
    RHFilesUI.listen(viewport,'pointerdown',event=>{
      if(event.button!==0)return;stop();points.set(event.pointerId,[event.clientX,event.clientY]);try{viewport.setPointerCapture(event.pointerId);}catch{}
      moved=false;origin={clientX:event.clientX,clientY:event.clientY,x,y,position};samples=[[event.clientX,performance.now()]];
      if(points.size===2){pinching=true;moved=true;const [a,b]=[...points.values()];origin.distance=Math.hypot(a[0]-b[0],a[1]-b[1]);}
    },{signal},'android.gallery.continuous.down');
    RHFilesUI.listen(viewport,'pointermove',event=>{
      if(!points.has(event.pointerId)||!origin)return;points.set(event.pointerId,[event.clientX,event.clientY]);const dx=event.clientX-origin.clientX,dy=event.clientY-origin.clientY;
      if(Math.hypot(dx,dy)>6)moved=true;
      if(points.size===2){const [a,b]=[...points.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(origin.distance)zoom=Math.max(.25,Math.min(8,zoom*distance/origin.distance));origin.distance=distance;transform();return;}
      if(pinching)return;
      if(zoom>1){x=origin.x+dx;y=origin.y+dy;transform();return;}
      if(Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)*1.25){const now=performance.now();samples.push([event.clientX,now]);if(samples.length>32)samples.shift();put(origin.position-dx/Math.max(1,viewport.clientWidth));}
    },{signal},'android.gallery.continuous.move');
    RHFilesUI.listen(viewport,'pointerup',event=>{
      if(!points.has(event.pointerId))return;points.delete(event.pointerId);
      if(points.size)return;
      if(origin&&!pinching&&zoom<=1&&moved&&Math.abs(event.clientX-origin.clientX)>Math.abs(event.clientY-origin.clientY)*1.25&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const now=performance.now(),speed=mobileMedia.swipeVelocity(samples,event.clientX,now);velocity=Math.max(-3,Math.min(3,-speed))/Math.max(1,viewport.clientWidth);lastTime=now;origin.release=now;if(Math.abs(velocity)*viewport.clientWidth>=.015)frame=requestAnimationFrame(momentum);
      }
      pinching=false;
    },{signal},'android.gallery.continuous.up');
    RHFilesUI.listen(viewport,'pointercancel',()=>{stop();points.clear();origin=null;pinching=false;},{signal},'android.gallery.continuous.cancel');
    RHFilesUI.listen(viewport,'click',()=>{if(moved)return;clearTimeout(tapTimer);tapTimer=setTimeout(()=>panel.classList.toggle('chrome-hidden'),230);},{signal},'android.gallery.continuous.chrome');
    RHFilesUI.listen(viewport,'dblclick',()=>{stop();clearTimeout(tapTimer);zoom=zoom===1?2:1;x=y=0;transform();},{signal},'android.gallery.continuous.double');
    RHFilesUI.listen(viewport,'wheel',event=>{event.preventDefault();stop();if(event.ctrlKey){zoom=Math.max(.25,Math.min(8,zoom*(event.deltaY>0?.9:1.1)));transform();}else if(zoom<=1)put(position+(event.deltaX||event.deltaY)/Math.max(1,viewport.clientWidth));},{passive:false,signal},'android.gallery.continuous.wheel');
    RHFilesUI.listen(document,'keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();jump(1);}if(event.key==='ArrowLeft'){event.preventDefault();jump(-1);}},{signal},'android.gallery.continuous.keys');
    let viewportSize='';
    const resize=new ResizeObserver(()=>{const size=viewport.clientWidth+':'+viewport.clientHeight;if(viewportSize&&size!==viewportSize){stop();points.clear();origin=null;}viewportSize=size;render();});resize.observe(viewport);
    ui.onClosed(()=>{clearView();controller.abort();stop();clearTimeout(tapTimer);resize.disconnect();for(const page of pages.values())page.querySelector('img').removeAttribute('src');pages.clear();cache.clear();});
    render();
  }
  return {open};
})();
