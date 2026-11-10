/* Three bounded pages: adjacent pictures move with the finger, not a swap on Up. */
const androidGallery=(()=>{
  let active=null;
  function mode(){return localStorage.getItem('rhfiles.imageBrowseMode')==='continuous'?'continuous':'paged';}
  function state(){return active?{open:true,mode:active.mode,...active.state()}:{open:false,mode:mode()};}
  function control(command){if(!active)throw Error('图片浏览器未打开');if(active.deleting)throw Error('正在删除当前图片');const action=active.controls[command];if(!action)throw Error('未知图片操作');action();return state();}
  function auto(command,value){if(!active?.auto)throw Error('请先打开连续图片浏览');if(command==='start'||command==='toggle'&&!active.auto.state().running)active.controls.fit();return command==='speed'?active.auto.setSpeed(value):active.auto[command]();}
  function modeSwitch(app,value){const group=ui.el('div','gallery-mode-switch');group.setAttribute('role','group');group.setAttribute('aria-label','图片浏览模式');for(const [mode,label,icon]of [['paged','逐张翻页','paged'],['continuous','连续浏览','continuous']]){const button=app.button('',icon,()=>RHFilesAPI.invoke('gallery.mode.set',{mode}),'media-icon-btn');button.querySelector('span')?.remove();button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(mode===value));group.append(button);}return group;}
  function seek(at){if(!active||active.deleting||!Number.isInteger(at)||at<0||at>=active.state().count)throw Error('图片位置无效或正在删除');active.seek(at);return state();}
  function progress(panel,images,getIndex,go,pause,signal){
    const row=ui.el('div','gallery-progress'),bar=ui.el('input'),label=ui.el('span','gallery-progress-label');let dragging=false;
    bar.type='range';bar.min='0';bar.max=String(images.length-1);bar.step='1';bar.disabled=images.length<2;bar.setAttribute('aria-label','图片浏览进度');bar.title='拖动快速跳转';row.append(bar,label);panel.append(row);
    function show(at){const text=(at+1)+' / '+images.length+' · '+images[at].name;label.textContent=text;label.title=text;bar.setAttribute('aria-valuetext',text);}
    function update(at){if(!dragging){bar.value=String(at);show(at);}}
    RHFilesUI.listen(bar,'pointerdown',()=>{dragging=true;pause();},{signal},'android.gallery.progress.start');
    RHFilesUI.listen(bar,'input',()=>{dragging=true;pause();show(Number(bar.value));},{signal},'android.gallery.progress.preview');
    RHFilesUI.listen(bar,'change',()=>{dragging=false;go(Number(bar.value));update(getIndex());},{signal},'android.gallery.progress.commit');
    RHFilesUI.listen(bar,'pointercancel',()=>{dragging=false;update(getIndex());},{signal},'android.gallery.progress.cancel');
    update(getIndex());return {update,preview:()=>dragging?Number(bar.value):null};
  }
  function setMode(value){
    if(!['paged','continuous'].includes(value))throw Error('图片浏览模式无效');
    localStorage.setItem('rhfiles.imageBrowseMode',value);
    document.querySelectorAll('[data-gallery-mode]').forEach(element=>{element.value=value;});
    document.querySelectorAll('[data-gallery-setting]').forEach(element=>element.setAttribute('aria-pressed',String(element.dataset.gallerySetting===value)));
    if(active&&active.mode!==value){const view=active,entry=view.entry();ui.closeSheet();open(entry,view.entries,view.app);}
    return state();
  }
  function register(view){active=view;return ()=>{if(active===view)active=null;};}
  function dialog(title,items,view){
    return new Promise(resolve=>{
      const popup=ui.el('dialog','media-dialog'),heading=ui.el('strong','',title);let settled=false;
      popup.append(heading);document.body.append(popup);
      const abort=()=>finish(null);
      const finish=value=>{if(settled)return;settled=true;view.signal.removeEventListener('abort',abort);popup.close();popup.remove();resolve(value);};
      for(const item of items){const button=ui.el('button',item.danger?'danger':'',item.label);button.type='button';button.dataset.mediaAction=item.id;RHFilesUI.listen(button,'click',()=>finish(item.id),undefined,'android.gallery.dialog.'+item.id);popup.append(button);}
      RHFilesUI.listen(popup,'cancel',event=>{event.preventDefault();finish(null);},undefined,'android.gallery.dialog.cancel');
      RHFilesUI.listen(popup,'click',event=>{if(event.target===popup){const r=popup.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)finish(null);}},undefined,'android.gallery.dialog.outside');
      view.signal.addEventListener('abort',abort,{once:true});popup.showModal();
    });
  }
  async function remove(expectedPath){
    const view=active;if(!view||view.deleting)throw Error('图片浏览器未就绪');
    const entry=view.entry();if(expectedPath&&entry.path!==expectedPath)throw Error('图片已改变，请重新读取状态');
    view.auto?.pause();view.deleting=true;
    try{
      const policy=await api.deletePolicy([entry.path]);if(active!==view||view.entry().path!==entry.path)return {cancelled:true};
      const selected=await dialog('删除 '+entry.name+'？\n'+policy.message,[{id:'confirm-delete',label:policy.recycle?'移入回收站':'永久删除',danger:true},{id:'cancel-delete',label:'取消'}],view);
      if(selected!=='confirm-delete'||active!==view||view.entry().path!==entry.path)return {cancelled:true};
      const revisions=entry.revision?{[entry.path]:entry.revision}:{};
      const busy=ui.el('dialog','media-dialog'),message=ui.el('strong','','正在删除 '+entry.name+'…');busy.append(message);document.body.append(busy);busy.showModal();
      const abortBusy=()=>{busy.close();busy.remove();};view.signal.addEventListener('abort',abortBusy,{once:true});
      RHFilesUI.listen(busy,'cancel',event=>event.preventDefault(),undefined,'android.gallery.delete.wait');
      let result;try{result=policy.kind==='local'?await api.runJob('trash',{sources:[entry.path]}):await api.deleteEntries({paths:[entry.path],permanent:!policy.recycle,revisions});}finally{view.signal.removeEventListener('abort',abortBusy);abortBusy();}
      if(!(result.deleted||[]).includes(entry.path))throw Error(result.failures?.[0]?.message||'删除结果未确认，请核对目标；未重复发送');
      view.app.state.entries=view.app.state.entries.filter(e=>e.path!==entry.path);
      const ordered=view.entries.filter(e=>!e.isDir&&e.kind==='image'),at=ordered.findIndex(e=>e.path===entry.path),next=ordered[(at+1)%ordered.length],remaining=view.entries.filter(e=>e.path!==entry.path);
      if(active===view){ui.closeSheet();if(next&&next.path!==entry.path)open(next,remaining,view.app);}
      await view.app.refresh();ui.toast('已删除 '+entry.name);return {deleted:true,path:entry.path};
    }finally{view.deleting=false;}
  }
  async function more(){
    const view=active;if(!view||view.deleting)return;view.auto?.pause();const entry=view.entry();
    const selected=await dialog(entry.name,[{id:'delete',label:'删除',danger:true},{id:'close-menu',label:'关闭'}],view);
    if(selected==='delete'&&active===view&&view.entry().path===entry.path)return remove(entry.path);
  }
  function open(entry,entries,app){
    if(mode()==='continuous')return androidContinuousGallery.open(entry,entries,app,register);
    const images=entries.filter(e=>!e.isDir&&e.kind==='image');if(!images.some(e=>e.path===entry.path))images.push(entry);
    let index=images.findIndex(e=>e.path===entry.path),epoch=0,zoom=1,rotation=0,x=0,y=0,origin,samples=[],dx=0,dy=0,moved=false,sliding=false,settling=false,tapTimer,settleTimer;
    const controller=new AbortController(),signal=controller.signal,points=new Map(),cache=new Map();
    if(!ui.openSheet('',[]))return;const panel=document.getElementById('sheet-panel');panel.classList.add('viewer','image-viewer');
    const viewport=ui.el('div','media-viewport'),track=ui.el('div','gallery-track'),header=ui.el('header','viewer-topbar'),title=ui.el('div','viewer-filename'),toolbar=ui.el('div','viewer-toolbar'),info=ui.el('div','viewer-info');
    title.id='viewer-filename';viewport.append(track);panel.append(viewport,header,toolbar,info);let currentImage;
    const boundary=RHFilesImageStrip.boundaryLayer(viewport,{label:'末张 · 首张',first:'已回到第一张',last:'已回到最后一张'});
    function icon(label,name,fn){const button=app.button('',name,fn,'media-icon-btn');button.setAttribute('aria-label',label);button.title=label;button.querySelector('span')?.remove();return button;}
    header.append(icon('返回文件列表','back',()=>ui.closeSheet()),title,modeSwitch(app,'paged'),icon('分享图片','share',()=>images[index].path.startsWith('remote://')?ui.toast('网络图片可先保存到本机，再使用系统分享'):api.shareFile(images[index].path)));
    const previous=icon('上一张','previous',()=>animate(-1)),next=icon('下一张','next',()=>animate(1));
    const transform=()=>{if(currentImage)currentImage.style.transform=`translate(${x}px,${y}px) scale(${zoom}) rotate(${rotation}deg)`;};
    const controls={previous:()=>animate(-1),next:()=>animate(1),zoomOut:()=>{zoom=Math.max(.25,zoom/1.4);transform();},fit:()=>{zoom=1;x=y=0;transform();},rotate:()=>{rotation=(rotation+90)%360;transform();},zoomIn:()=>{zoom=Math.min(8,zoom*1.4);transform();}};
    toolbar.append(previous,icon('缩小','zoomOut',controls.zoomOut),icon('适应','fit',controls.fit),icon('旋转','rotate',controls.rotate),icon('放大','zoomIn',controls.zoomIn),next);
    info.hidden=true;const progressBar=progress(panel,images,()=>index,at=>seekAt(at),()=>{},signal);
    header.insertBefore(icon('图片更多选项','more',()=>RHFilesAPI.invoke('gallery.more').catch(app.error)),header.children[2]);
    const clearView=register({mode:'paged',signal,entry:()=>images[index],entries:images,app,controls,seek:seekAt,state:()=>({path:images[index].path,index,count:images.length,position:index,zoom,rotation,previewIndex:progressBar.preview(),loopBoundary:boundary.state()})});
    function seekAt(at){clearTimeout(settleTimer);settling=sliding=false;points.clear();origin=null;index=at;render();}
    function source(item){const key=JSON.stringify([item.path,item.modifiedMs,item.size]);if(!cache.has(key)){if(cache.size>=5)cache.delete(cache.keys().next().value);cache.set(key,api.imageUrl(item));}return cache.get(key);}
    function render(){
      const token=++epoch;currentImage=null;track.replaceChildren();track.style.transition='none';track.style.transform='translateX(0px)';dx=dy=0;zoom=1;x=y=0;rotation=0;
      title.textContent=images[index].name;info.textContent=(index+1)+' / '+images.length;previous.disabled=next.disabled=images.length<2;progressBar.update(index);
      for(const relative of images.length<2?[0]:[0,1,-1]){
        const item=images[((index+relative)%images.length+images.length)%images.length];
        const page=ui.el('div','gallery-page');page.style.left=relative*100+'%';page.dataset.relative=relative;
        const image=new Image();image.className='full-media';image.alt=relative===0?item.name:'';image.decoding='async';image.draggable=false;
        const status=ui.el('div','gallery-load-state','正在读取图片…');page.append(image,status);track.append(page);if(relative===0)currentImage=image;
        image.onload=()=>{status.hidden=true;};image.onerror=()=>{status.hidden=false;status.textContent='图片无法解码';};
        source(item).then(url=>{if(!signal.aborted&&token===epoch)image.src=url;}).catch(error=>{if(!signal.aborted&&token===epoch){status.textContent='无法查看图片：'+(error.message||error);status.classList.add('danger');}});
      }
    }
    function animate(delta){
      if(settling||signal.aborted)return;
      if(images.length<2)delta=0;
      const wrapped=delta&&(index+delta<0||index+delta>=images.length);settling=true;sliding=false;const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:220;
      track.style.transition=`transform ${duration}ms cubic-bezier(.2,.7,.3,1)`;track.style.transform=`translateX(${-delta*viewport.clientWidth}px)`;
      settleTimer=setTimeout(()=>{settling=false;if(delta){index=((index+delta)%images.length+images.length)%images.length;render();if(wrapped)boundary.notify(delta);}else{track.style.transition='none';dx=dy=0;}},duration+20);
    }
    RHFilesUI.listen(viewport,'pointerdown',event=>{
      if(settling)return;points.set(event.pointerId,[event.clientX,event.clientY]);try{viewport.setPointerCapture(event.pointerId);}catch{}
      moved=false;origin=[event.clientX,event.clientY,x,y];samples=[[event.clientX,performance.now()]];
      if(points.size===2){sliding=false;track.style.transform='translateX(0px)';const [a,b]=[...points.values()];origin.distance=Math.hypot(a[0]-b[0],a[1]-b[1]);}
    },{signal},"android.web.js.gallery.open.c3786814889e");
    RHFilesUI.listen(viewport,'pointermove',event=>{
      if(!points.has(event.pointerId)||settling||!origin)return;
      points.set(event.pointerId,[event.clientX,event.clientY]);dx=event.clientX-origin[0];dy=event.clientY-origin[1];if(Math.hypot(dx,dy)>8)moved=true;
      if(points.size===2){moved=true;const [a,b]=[...points.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(origin.distance)zoom=Math.max(.25,Math.min(8,zoom*distance/origin.distance));origin.distance=distance;transform();return;}
      if(zoom>1){x=origin[2]+dx;y=origin[3]+dy;transform();return;}
      const now=performance.now();samples.push([event.clientX,now]);if(samples.length>32)samples.shift();
      if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.25)sliding=true;
      if(sliding){track.style.transition='none';track.style.transform=`translateX(${images.length<2?dx*.22:dx}px)`;}
    },{signal},"android.web.js.gallery.open.1cd6d22ede11");
    RHFilesUI.listen(viewport,'pointerup',event=>{
      if(!points.has(event.pointerId))return;
      const single=points.size===1;points.delete(event.pointerId);
      if(single&&sliding&&origin){
        const speed=mobileMedia.swipeVelocity(samples,event.clientX,performance.now());
        animate(mobileMedia.swipe(event.clientX-origin[0],event.clientY-origin[1],viewport.clientWidth,speed));
      }
      origin=null;
    },{signal},"android.web.js.gallery.open.6d581fa355c0");
    RHFilesUI.listen(viewport,'pointercancel',()=>{points.clear();origin=null;if(sliding)animate(0);},{signal},"android.web.js.gallery.open.c03e4ba4678a");
    RHFilesUI.listen(viewport,'click',()=>{if(moved||settling)return;clearTimeout(tapTimer);tapTimer=setTimeout(()=>panel.classList.toggle('chrome-hidden'),230);},{signal},"android.web.js.gallery.open.f057c1e4f451");
    RHFilesUI.listen(viewport,'dblclick',()=>{clearTimeout(tapTimer);zoom=zoom===1?2:1;x=y=0;transform();},{signal},"android.web.js.gallery.open.ecc9bd5c139a");
    RHFilesUI.listen(viewport,'wheel',event=>{event.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*(event.deltaY>0?.9:1.1)));transform();},{passive:false,signal},"android.web.js.gallery.open.eb6ce9fd7939");
    RHFilesUI.listen(document,'keydown',event=>{if(event.target.closest?.('dialog')||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;if(event.key==='ArrowRight')animate(1);if(event.key==='ArrowLeft')animate(-1);if(event.key==='Home')seekAt(0);if(event.key==='End')seekAt(images.length-1);},{signal},"android.web.js.gallery.open.ea5a60ea371d");
    ui.onClosed(()=>{boundary.destroy();clearView();controller.abort();clearTimeout(tapTimer);clearTimeout(settleTimer);epoch++;for(const image of track.querySelectorAll('img'))image.removeAttribute('src');cache.clear();});
    render();
  }
  return {open,mode,setMode,state,control,auto,seek,progress,modeSwitch,more,remove};
})();
