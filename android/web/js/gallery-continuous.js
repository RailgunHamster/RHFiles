/* Fitted image edges form one horizontal strip, with bounded nearby pages. */
const androidContinuousGallery=(()=>{
  function open(entry,entries,app,register){
    const seen=new Set(),images=entries.filter(item=>!item.isDir&&item.kind==='image'&&!seen.has(item.path)&&seen.add(item.path));
    if(!seen.has(entry.path))images.push(entry);
    let index=images.findIndex(item=>item.path===entry.path),position=index,zoom=1,rotation=0,x=0,y=0,origin=null,moved=false,frame=0,tapTimer,samples=[],lastTime=0,velocity=0,pinching=false;
    if(!ui.openSheet('',[]))return;
    const panel=document.getElementById('sheet-panel');panel.classList.add('viewer','image-viewer','continuous-viewer');
    const strip=RHFilesImageStrip.create(images.length,{loop:true});let stripFrames=new Map();
    const controller=new AbortController(),signal=controller.signal,points=new Map(),pages=new Map(),cache=new Map();
    const viewport=ui.el('div','media-viewport'),track=ui.el('div','gallery-track'),header=ui.el('header','viewer-topbar'),title=ui.el('div','viewer-filename'),toolbar=ui.el('div','viewer-toolbar'),info=ui.el('div','viewer-info');
    title.id='viewer-filename';viewport.append(track);panel.append(viewport,header,toolbar,info);
    const boundary=RHFilesImageStrip.boundaryLayer(viewport,{label:'末张 · 首张',first:'已回到第一张',last:'已回到最后一张'});
    function icon(label,name,fn){const b=app.button('',name,fn,'media-icon-btn');b.setAttribute('aria-label',label);b.title=label;b.querySelector('span')?.remove();return b;}
    function stop(){cancelAnimationFrame(frame);frame=0;velocity=0;}
    const autoPanel=ui.el('div','gallery-auto-controls'),autoToggle=ui.el('button','','开始'),speedLabel=ui.el('label'),speed=ui.el('input'),speedNumber=ui.el('input'),speedUnit=ui.el('span','','px/s'),speedText=ui.el('span','', '速度 1.0×');let mousePoint=null;
    autoPanel.hidden=true;speed.type='range';speedNumber.type='number';for(const input of [speed,speedNumber]){input.min='10';input.max='6000';input.step='10';input.value='60';}speed.setAttribute('aria-label','自动滚动速度');speedNumber.setAttribute('aria-label','自动滚动速度（像素/秒）');speedLabel.append(speedText,speed,speedNumber,speedUnit);autoPanel.append(autoToggle,speedLabel);panel.append(autoPanel);
    const auto=RHFilesImageStrip.autoScroll({move:delta=>{if(signal.aborted||document.hidden)return false;put(strip.move(position,delta));return images.length>1;},changed:value=>{autoToggle.textContent=value.running?'暂停':'开始';speed.value=speedNumber.value=String(value.speed);speedText.textContent='速度 '+(value.speed/60).toFixed(1)+'×';}});
    RHFilesUI.listen(autoToggle,'click',()=>RHFilesAPI.invoke('gallery.auto.toggle').catch(error=>ui.toast(error.message||String(error))),undefined,'android.gallery.auto.toggle');
    RHFilesUI.listen(speed,'input',()=>RHFilesAPI.invoke('gallery.auto.speed.set',{speed:Number(speed.value)}).catch(error=>ui.toast(error.message||String(error))),undefined,'android.gallery.auto.speed');
    RHFilesUI.listen(speedNumber,'change',()=>RHFilesAPI.invoke('gallery.auto.speed.set',{speed:Number(speedNumber.value)}).catch(error=>{speedNumber.value=auto.state().speed;ui.toast(error.message||String(error));}),undefined,'android.gallery.auto.speed.number');
    RHFilesUI.listen(document,'visibilitychange',()=>{if(document.hidden)auto.pause();},{signal},'android.gallery.auto.visibility');
    function caption(){const entries=[...pages].map(([slot,page])=>({slot,index:strip.item(slot),page,image:page.querySelector('img')})),hit=RHFilesImageStrip.hitImage(viewport,entries,mousePoint,rotation),at=hit?.index??index;return {index:at,name:images[at].name,path:images[at].path,source:hit?'pointer':'position'};}
    function paintCaption(){const shown=caption();title.textContent=shown.name;info.textContent=(shown.index+1)+' / '+images.length;}
    function transform(){render();}
    function paintTransform(){viewport.classList.toggle('image-zoomed',zoom>1);for(const [at,page]of pages){const image=page.querySelector('img'),f=stripFrames.get(at),active=at===Math.round(position);if(!f)continue;image.style.width=f.imageWidth+'px';image.style.height=f.imageHeight+'px';image.style.transform=`translate(-50%,-50%) translate(${active?x:0}px,${active?y:0}px) scale(${active?Math.max(1,zoom):1}) rotate(${rotation}deg)`;}paintCaption();}
    function render(){
      if(signal.aborted)return;
      const previousIndex=index;index=strip.item(Math.round(position));
      if(previousIndex!==index){if(zoom>1)zoom=1;x=y=0;}
      strip.resize(viewport.clientWidth,viewport.clientHeight,rotation,Math.min(1,zoom));stripFrames=new Map(strip.layout(position).map(f=>[f.slot,f]));
      title.textContent=images[index].name;info.textContent=(index+1)+' / '+images.length;previous.disabled=next.disabled=images.length<2;progressBar.update(index);
      for(const [at,page]of pages)if(!stripFrames.has(at)){page.querySelector('img').removeAttribute('src');page.remove();pages.delete(at);}
      for(const at of stripFrames.keys()){
        let page=pages.get(at);
        if(!page){
          const item=images[strip.item(at)];page=ui.el('div','gallery-page');page.dataset.imageIndex=String(strip.item(at));page.dataset.slot=String(at);pages.set(at,page);
          const image=new Image(),status=ui.el('div','gallery-load-state','正在读取图片…');image.className='full-media';image.alt=item.name;image.decoding='async';image.draggable=false;
          image.onload=()=>{status.hidden=true;if(signal.aborted||pages.get(at)!==page)return;const anchor=Math.round(position),shift=strip.offset(position)-strip.offset(anchor);strip.measure(strip.item(at),image.naturalWidth,image.naturalHeight);position=strip.move(anchor,shift);render();};image.onerror=()=>{status.hidden=false;status.textContent='图片无法解码';};page.append(image,status);track.append(page);
          const key=JSON.stringify([item.path,item.modifiedMs,item.size]);
          if(!cache.has(key)){if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,api.imageUrl(item));}
          cache.get(key).then(url=>{if(!signal.aborted&&pages.get(at)===page)image.src=url;}).catch(error=>{if(!signal.aborted&&pages.get(at)===page){status.textContent='无法查看图片：'+(error.message||error);}});
        }
        const f=stripFrames.get(at);page.style.left=f.left+'px';page.style.width=f.width+'px';page.dataset.relative=String(at-index);
      }
      track.style.transform='';paintTransform();boundary.update([...stripFrames.values()],{width:viewport.clientWidth,count:images.length,zoom,cycle:Math.floor(Math.round(position)/images.length)});
    }
    function put(value){position=images.length<2?0:value;render();}
    function jump(delta){stop();auto.pause();points.clear();origin=null;zoom=1;x=y=0;rotation=0;put(Math.round(position)+delta);transform();}
    const controls={previous:()=>jump(-1),next:()=>jump(1),fit:()=>{stop();auto.pause();zoom=1;x=y=0;transform();},rotate:()=>{stop();auto.pause();rotation=(rotation+90)%360;render();},zoomOut:()=>{stop();auto.pause();zoom=Math.max(.25,zoom/1.4);transform();},zoomIn:()=>{stop();auto.pause();zoom=Math.min(8,zoom*1.4);transform();}};
    header.append(icon('返回文件列表','back',()=>ui.closeSheet()),title,androidGallery.modeSwitch(app,'continuous'),icon('分享图片','share',()=>images[index].path.startsWith('remote://')?ui.toast('网络图片可先保存到本机，再使用系统分享'):api.shareFile(images[index].path)));
    header.insertBefore(icon('自动滚动','play',()=>{autoPanel.hidden=false;void RHFilesAPI.invoke('gallery.auto.toggle').catch(error=>ui.toast(error.message||String(error)));}),header.lastChild);
    const previous=icon('上一张','previous',controls.previous),next=icon('下一张','next',controls.next);
    toolbar.append(previous,icon('缩小','zoomOut',controls.zoomOut),icon('适应','fit',controls.fit),icon('旋转','rotate',controls.rotate),icon('放大','zoomIn',controls.zoomIn),next);
    info.hidden=true;const progressBar=androidGallery.progress(panel,images,()=>index,at=>seekAt(at),()=>{stop();auto.pause();},signal);
    function seekAt(at){stop();auto.pause();points.clear();origin=null;zoom=1;x=y=0;rotation=0;put(at);}
    header.insertBefore(icon('图片更多选项','more',()=>RHFilesAPI.invoke('gallery.more').catch(app.error)),header.children[2]);
    const clearView=register({mode:'continuous',signal,entry:()=>images[index],entries:images,app,controls,auto,seek:seekAt,state:()=>({path:images[index].path,index,count:images.length,position:strip.normalize(position),zoom,rotation,caption:caption(),previewIndex:progressBar.preview(),loopBoundary:boundary.state(),autoScroll:auto.state()})});
    function momentum(now){
      if(signal.aborted)return;const dt=Math.min(40,Math.max(0,now-lastTime));lastTime=now;
      const nextPosition=strip.move(position,velocity*dt);put(nextPosition);velocity*=Math.exp(-dt/130);
      if(Math.abs(velocity)<.015||images.length<2||now-origin.release>700){frame=0;velocity=0;return;}
      frame=requestAnimationFrame(momentum);
    }
    RHFilesUI.listen(viewport,'pointerdown',event=>{
      if(event.button!==0)return;const autoRunning=auto.state().running;stop();auto.pause();points.set(event.pointerId,[event.clientX,event.clientY]);try{viewport.setPointerCapture(event.pointerId);}catch{}
      moved=false;origin={clientX:event.clientX,clientY:event.clientY,x,y,position,autoRunning};samples=[[event.clientX,performance.now()]];
      if(points.size===2){pinching=true;moved=true;const [a,b]=[...points.values()];origin.distance=Math.hypot(a[0]-b[0],a[1]-b[1]);}
    },{signal},'android.gallery.continuous.down');
    RHFilesUI.listen(viewport,'pointermove',event=>{
      if(!points.has(event.pointerId)||!origin)return;points.set(event.pointerId,[event.clientX,event.clientY]);const dx=event.clientX-origin.clientX,dy=event.clientY-origin.clientY;
      if(Math.hypot(dx,dy)>6)moved=true;
      if(points.size===2){const [a,b]=[...points.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(origin.distance)zoom=Math.max(.25,Math.min(8,zoom*distance/origin.distance));origin.distance=distance;transform();return;}
      if(pinching)return;
      if(zoom>1){x=origin.x+dx;y=origin.y+dy;transform();return;}
      if(Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)*1.25){const now=performance.now();samples.push([event.clientX,now]);if(samples.length>32)samples.shift();put(strip.move(origin.position,-dx));}
    },{signal},'android.gallery.continuous.move');
    RHFilesUI.listen(viewport,'pointerup',event=>{
      if(!points.has(event.pointerId))return;points.delete(event.pointerId);
      if(points.size)return;
      if(origin&&!moved&&!pinching&&origin.autoRunning)auto.start();
      if(origin&&!pinching&&zoom<=1&&moved&&Math.abs(event.clientX-origin.clientX)>Math.abs(event.clientY-origin.clientY)*1.25&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const now=performance.now(),speed=mobileMedia.swipeVelocity(samples,event.clientX,now);velocity=Math.max(-3,Math.min(3,-speed));lastTime=now;origin.release=now;if(Math.abs(velocity)>=.015)frame=requestAnimationFrame(momentum);
      }
      pinching=false;
    },{signal},'android.gallery.continuous.up');
    RHFilesUI.listen(viewport,'pointercancel',()=>{stop();points.clear();origin=null;pinching=false;},{signal},'android.gallery.continuous.cancel');
    RHFilesUI.listen(viewport,'click',()=>{if(moved)return;clearTimeout(tapTimer);tapTimer=setTimeout(()=>panel.classList.toggle('chrome-hidden'),230);},{signal},'android.gallery.continuous.chrome');
    RHFilesUI.listen(viewport,'dblclick',()=>{stop();auto.pause();clearTimeout(tapTimer);zoom=zoom===1?2:1;x=y=0;transform();},{signal},'android.gallery.continuous.double');
    RHFilesUI.listen(viewport,'wheel',event=>{event.preventDefault();stop();auto.pause();if(event.ctrlKey){zoom=Math.max(.25,Math.min(8,zoom*(event.deltaY>0?.9:1.1)));transform();}else if(zoom<=1)put(strip.move(position,event.deltaX||event.deltaY));},{passive:false,signal},'android.gallery.continuous.wheel');
    RHFilesUI.listen(viewport,'pointermove',event=>{if(event.pointerType==='mouse'){mousePoint={x:event.clientX,y:event.clientY};paintCaption();}},{signal},'android.gallery.continuous.caption.move');
    RHFilesUI.listen(viewport,'pointerleave',()=>{mousePoint=null;paintCaption();},{signal},'android.gallery.continuous.caption.leave');
    RHFilesUI.listen(window,'blur',()=>{mousePoint=null;paintCaption();},{signal},'android.gallery.continuous.caption.blur');
    RHFilesUI.listen(document,'keydown',event=>{if(event.target.closest?.('dialog')||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||event.target.isContentEditable)return;if(event.key===' '){event.preventDefault();if(!event.repeat)void RHFilesAPI.invoke('gallery.auto.toggle').catch(error=>ui.toast(error.message||String(error)));return;}if(event.key==='Home'){event.preventDefault();seekAt(0);}if(event.key==='End'){event.preventDefault();seekAt(images.length-1);}if(event.key==='ArrowRight'){event.preventDefault();jump(1);}if(event.key==='ArrowLeft'){event.preventDefault();jump(-1);}},{signal},'android.gallery.continuous.keys');
    let viewportSize='';
    const resize=new ResizeObserver(()=>{const size=viewport.clientWidth+':'+viewport.clientHeight;if(viewportSize&&size!==viewportSize){stop();points.clear();origin=null;}viewportSize=size;render();});resize.observe(viewport);
    ui.onClosed(()=>{boundary.destroy();clearView();controller.abort();stop();auto.pause();clearTimeout(tapTimer);resize.disconnect();for(const page of pages.values())page.querySelector('img').removeAttribute('src');pages.clear();cache.clear();});
    render();
  }
  return {open};
})();
