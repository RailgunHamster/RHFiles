/* Bounded filesystem image canvas and native libVLC controls. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),api=window.RHFilesAPI,core=window.__TAURI__.core,native=(action,args={})=>core.invoke('file_viewer_request',{action,args}),windowApi=window.__TAURI__.window.getCurrentWindow();
  let state=null,position=0,zoom=1,angle=0,x=0,y=0,epoch=0,loading=false,pointer=null,video=null,poll=null,seekDragging=false,rendered=false,imageSeeking=false,selectionTask=null;
  const pages=new Map(),sources=new Map();let strip=null,stripFrames=new Map(),auto=null,autoSpeed=60,closing=false;
  let mousePoint=null,contextImage=null,saveTask=null;
  let focused=null,focusEpoch=0,focusPointer=null;
  function focusState(){return focused?{opened:true,index:focused.index,path:state.entries[focused.index].path,zoom:focused.zoom,angle:focused.angle,x:focused.x,y:focused.y,loading:focused.loading,error:focused.error}:{opened:false};}
  function paintFocus(){if(!focused)return;const image=$('image-focus-image'),stage=$('image-focus-stage'),quarter=focused.angle%180!==0,scale=Math.min(stage.clientWidth/Math.max(1,quarter?image.naturalHeight:image.naturalWidth),stage.clientHeight/Math.max(1,quarter?image.naturalWidth:image.naturalHeight));image.style.width=image.naturalWidth*scale+'px';image.style.height=image.naturalHeight*scale+'px';image.style.transform=`translate(-50%,-50%) translate(${focused.x}px,${focused.y}px) scale(${focused.zoom}) rotate(${focused.angle}deg)`;$('image-focus-scale').textContent=Math.round(focused.zoom*100)+'%';$('image-focus-message').textContent=focused.error|| (focused.loading?text('正在读取图片…','Loading image…'):'');}
  function focusZoom(value,point){if(!focused)throw Error(text('请先双击图片','Double-click an image first'));if(!Number.isFinite(value)||value<.1||value>16)throw Error(text('缩放范围为 10%–1600%','Zoom range is 10%–1600%'));const r=$('image-focus-stage').getBoundingClientRect(),px=(point?.x??r.left+r.width/2)-r.left-r.width/2,py=(point?.y??r.top+r.height/2)-r.top-r.height/2,ratio=value/focused.zoom;focused.x=px-(px-focused.x)*ratio;focused.y=py-(py-focused.y)*ratio;focused.zoom=value;paintFocus();return focusState();}
  function focusPan(px,py){if(!focused)throw Error(text('请先双击图片','Double-click an image first'));if(!Number.isFinite(px)||!Number.isFinite(py)||Math.abs(px)>1000000||Math.abs(py)>1000000)throw Error('Invalid image position');focused.x=px;focused.y=py;paintFocus();return focusState();}
  function focusFit(){if(!focused)throw Error(text('请先双击图片','Double-click an image first'));focused.zoom=1;focused.x=focused.y=0;paintFocus();return focusState();}
  function focusLeave(){if(!focused)return focusState();++focusEpoch;focused=null;if(focusPointer)try{$('image-focus-stage').releasePointerCapture(focusPointer.id);}catch{}focusPointer=null;$('image-focus-stage').classList.remove('dragging');$('image-focus-image').onload=$('image-focus-image').onerror=null;$('image-focus-image').removeAttribute('src');$('image-focus').hidden=true;document.body.classList.remove('image-focused');hideImageMenu();$('viewport').focus({preventScroll:true});header();return focusState();}
  async function focusEnter(at){at=imageIndex(at);if(selectionTask||loading)throw Error(text('请等待图片切换完成','Wait for image navigation'));auto?.pause();hideImageMenu();pointer=null;const token=++focusEpoch;focused={index:at,zoom:1,angle,x:0,y:0,loading:true,error:''};$('image-focus-title').textContent=state.entries[at].name;$('image-focus-image').alt=state.entries[at].name;$('image-focus').hidden=false;document.body.classList.add('image-focused');const image=$('image-focus-image');image.onload=image.onerror=null;image.removeAttribute('src');image.onload=()=>{if(token===focusEpoch&&focused){focused.loading=false;paintFocus();}};image.onerror=()=>{if(token===focusEpoch&&focused){focused.loading=false;focused.error=text('图片无法解码，可使用系统应用打开','Cannot decode this image. Try the system app.');paintFocus();}};paintFocus();header();$('image-focus-stage').focus({preventScroll:true});try{const url=await source(state.entries[at]);if(token===focusEpoch&&focused)image.src=url;}catch(e){if(token===focusEpoch&&focused){focused.loading=false;focused.error=String(e.message||e);paintFocus();}}return focusState();}
  let volumeJob=null,volumeDragging=false,fullscreen=false,controlsVisible=true,chromeTimer=null,wheelDelta=0,chromeHover=false,controlRevision=0;
  let diagnosticsOpen=false,videoPolling=null;
  function seekSeconds(){try{const value=JSON.parse(localStorage.getItem('rhfiles-settings')||'{}').videoSeekSeconds;return Number.isInteger(value)&&value>=1&&value<=600?value:5;}catch{return 5;}}
  function paintVolume(){const value=volumeJob?.value??video?.volume??100;if(!volumeDragging)$('volume').value=String(value);$('video-volume-value').textContent=Math.round(value)+'%';}
  function fullVideo(){return fullscreen&&state?.kind==='video';}
  function paintChrome(){document.body.classList.toggle('video-fullscreen',fullVideo());document.body.classList.toggle('video-controls-visible',controlsVisible);}
  function showControls(){clearTimeout(chromeTimer);if(!fullVideo())return;const changed=!controlsVisible;controlsVisible=true;paintChrome();if(changed)void bounds().catch(error);if(diagnosticsOpen)return;chromeTimer=setTimeout(()=>{if(!rendered||volumeDragging||seekDragging||chromeHover){showControls();return;}controlsVisible=false;paintChrome();void bounds().catch(error);},2200);}
  async function setFullscreen(value){await windowApi.setFullscreen(value);fullscreen=value;controlsVisible=true;paintChrome();if(fullVideo())showControls();await bounds();return {fullscreen};}
  async function toggleFullscreen(){return setFullscreen(!await windowApi.isFullscreen());}
  async function setVolume(value){
    if(!Number.isFinite(value)||value<0||value>100)throw Error(text('音量必须为 0–100','Volume must be 0–100'));
    if(!video?.opened)throw Error(text('播放器尚未就绪','Player is not ready'));
    value=Math.round(value);++controlRevision;showControls();
    if(volumeJob&&volumeJob.epoch===epoch&&volumeJob.input===video.inputId){volumeJob.value=value;volumeJob.pending=value;paintVolume();return volumeJob.promise;}
    const job={epoch,input:video.inputId,scope:scope(),value,pending:value,promise:null};volumeJob=job;paintVolume();
    job.promise=(async()=>{try{while(job.pending!==null){if(job.epoch!==epoch||job.input!==video?.inputId)throw Error(text('播放输入已改变','Player input changed'));const next=job.pending;job.pending=null;const result=await native('video.control',{...job.scope,expectedInput:job.input,command:'volume',value:next});if(job.epoch!==epoch||volumeJob!==job)throw Error(text('播放输入已改变','Player input changed'));++controlRevision;video=result;paintVolume();}return video;}finally{if(volumeJob===job){volumeJob=null;paintVolume();}}})();return job.promise;
  }
  async function skipVideo(seconds){if(!Number.isFinite(seconds)||seconds===0||Math.abs(seconds)>600)throw Error(text('跳转秒数无效','Invalid seek interval'));if(!video?.opened)throw Error(text('播放器尚未就绪','Player is not ready'));const token=epoch,input=video.inputId,latest=await native('video.state',scope());if(token!==epoch||input!==latest.inputId)throw Error(text('播放输入已改变','Player input changed'));video=latest;const at=latest.restoringPausedFrame?latest.restoreTargetMs:latest.positionMs;showControls();return videoControl('seek',Math.max(0,Math.min(latest.durationMs||Number.MAX_SAFE_INTEGER,at+seconds*1000)));}
  const imageEntries=()=>[...pages].map(([slot,page])=>({slot,index:strip.item(slot),page,image:page.querySelector('img')}));
  const hitImage=point=>RHFilesImageStrip.hitImage($('viewport'),imageEntries(),point,angle);
  function caption(){const hit=contextImage||focused||state?.kind==='image'&&hitImage(mousePoint),at=hit?hit.index:index();return {index:at,...state.entries[at],source:contextImage?'context':focused?'focus':hit?'pointer':'position'};}
  let zh=true;
  const text=(cn,en)=>zh?cn:en,scope=()=>({generation:state.generation,selection:state.selection}),index=()=>state.kind==='image'?strip.item(Math.round(position)):Math.max(0,Math.min(state.entries.length-1,Math.round(position))),clock=ms=>{const seconds=Math.max(0,Math.floor((ms||0)/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
  const boundary=RHFilesImageStrip.boundaryLayer($('viewport'),{get label(){return text('末张 · 首张','Last · First');},get first(){return text('已回到第一张','Back to the first image');},get last(){return text('已回到最后一张','Back to the last image');}});
  function applyLanguage(preferred){
    let language=preferred;
    if(!language)try{language=localStorage.getItem('rhfiles-lang')||JSON.parse(localStorage.getItem('rhfiles-settings')||'{}').language;}catch{}
    zh=/^zh/i.test(language||navigator.language||'en');document.documentElement.lang=zh?'zh-CN':'en';
    const labels={close:['关闭','Close'],fullscreen:['全屏','Fullscreen'],previous:['上一张','Previous'],next:['下一张','Next'],mode:['图片浏览模式','Image browsing mode'],system:['系统应用','System app'],fit:['适应窗口','Fit window'],'zoom-in':['放大','Zoom in'],'zoom-out':['缩小','Zoom out'],rotate:['旋转','Rotate'],'auto-speed':['自动滚动速度','Automatic scroll speed'],seek:['播放进度','Playback position'],volume:['音量','Volume'],rate:['播放速度','Playback speed'],'image-seek':['图片浏览进度：拖动快速跳转','Image progress: drag to jump']};
    for(const [id,pair]of Object.entries(labels)){const element=$(id);element.title=text(...pair);element.setAttribute('aria-label',text(...pair));}
    $('mode-paged').textContent=text('逐张翻页','Paged');$('mode-continuous').textContent=text('连续滚动','Continuous');$('system').textContent=text('系统应用','System app');$('fit').textContent=text('适应窗口','Fit window');
    $('image-focus-back').textContent=text('返回浏览 · Esc','Back · Esc');$('image-focus-fit').textContent=text('适应窗口','Fit window');$('image-focus-in').setAttribute('aria-label',text('放大','Zoom in'));$('image-focus-out').setAttribute('aria-label',text('缩小','Zoom out'));
    const menuItems={'image-save-as':['另存为…','Save as…','M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5'],'image-copy-path':['复制文件路径','Copy file path','M9 9h11v12H9zM5 16H3V3h11v3'],'image-system-open':['使用系统应用打开','Open in system app','M14 3h7v7m0-7L10 14M9 3H3v18h18v-6']};
    for(const [id,[cn,en,path]]of Object.entries(menuItems)){$(id).replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');line.setAttribute('d',path);svg.append(line);$(id).append(svg,document.createTextNode(text(cn,en)));}
    $('auto-speed-number').setAttribute('aria-label',text('自动滚动速度（像素/秒）','Auto scroll speed (pixels/sec)'));$('image-save-dismiss').setAttribute('aria-label',text('关闭提示','Dismiss'));paintSave();
    paintAuto(auto?.state()||{running:false,speed:autoSpeed});
    for(const page of pages.values()){const status=page.querySelector('.image-error');if(status)status.textContent=status.dataset.failed?text('图片无法解码，可使用系统应用打开','Cannot decode this image. Try the system app.'):text('正在读取图片…','Loading image…');}
    boundary.relabel();if(state)header();
  }
  function imageProgress(preview){
    if(state?.kind!=='image')return;const at=preview??index(),label=(at+1)+' / '+state.entries.length+' · '+state.entries[at].name;
    $('image-seek').max=String(state.entries.length-1);$('image-seek').disabled=state.entries.length<2;
    if(preview!==undefined||!imageSeeking){$('image-seek').value=String(at);$('image-seek').setAttribute('aria-valuetext',label);$('image-count').textContent=label;$('image-count').title=label;}
  }
  function paintSelection(){
    if(contextImage?.focused){$('image-selection').hidden=true;$('image-focus-image').classList.add('selected');return;}
    const page=contextImage&&pages.get(contextImage.slot),bounds=page&&RHFilesImageStrip.imageBounds(page.querySelector('img'),angle),frame=$('viewport').getBoundingClientRect();
    $('image-selection').hidden=!bounds;if(bounds)Object.assign($('image-selection').style,{left:(bounds.left-frame.left)+'px',top:(bounds.top-frame.top)+'px',width:bounds.width+'px',height:bounds.height+'px'});
  }
  function hideImageMenu(){contextImage=null;$('image-menu').hidden=true;$('image-selection').hidden=true;$('image-focus-image').classList.remove('selected');if(state)header();}
  function showImageMenu(target,point){
    if(!target)throw Error(text('请指向一张已加载的图片','Point to a loaded image'));auto?.pause();contextImage={index:target.index,slot:target.slot,focused:!!target.focused};
    $('image-menu-name').textContent=state.entries[target.index].name;$('image-menu-name').title=state.entries[target.index].name;$('image-menu').hidden=false;
    const bounds=target.bounds||RHFilesImageStrip.imageBounds(target.image,focused?.angle??angle),x=point?.x??bounds.left+bounds.width/2,y=point?.y??bounds.top+bounds.height/2;
    Object.assign($('image-menu').style,{left:Math.max(8,Math.min(x+4,innerWidth-$('image-menu').offsetWidth-8))+'px',top:Math.max(8,Math.min(y+4,innerHeight-$('image-menu').offsetHeight-8))+'px'});
    header();paintSelection();$('image-save-as').focus({preventScroll:true});return snapshot();
  }
  function contextOpen(p={}){
    if(state?.kind!=='image')throw Error(text('当前不是图片','The current item is not an image'));
    if(focused){const image=$('image-focus-image');if(!image.naturalWidth)throw Error(text('图片尚未读取完成','Image is not loaded'));return showImageMenu({index:focused.index,slot:0,focused:true,image},p.x===undefined?null:{x:p.x,y:p.y});}
    const at=p.index??index(),target=imageEntries().filter(row=>row.index===at&&row.image.naturalWidth>0).sort((a,b)=>Math.abs(a.slot-position)-Math.abs(b.slot-position))[0];
    return showImageMenu(target,p.x===undefined?null:{x:p.x,y:p.y});
  }
  function imageIndex(value){const at=value??contextImage?.index??focused?.index??index();if(state?.kind!=='image'||!Number.isInteger(at)||at<0||at>=state.entries.length)throw Error(text('图片位置无效','Invalid image index'));return at;}
  function paintSave(){
    const task=saveTask;$('image-save-progress').hidden=!task||task.dismissed;if(!task)return;
    $('image-save-title').textContent=task.name;$('image-save-progress').classList.toggle('failed',task.status==='failed');
    $('image-save-detail').textContent=task.error||({choosing:text('请选择保存位置…','Choose where to save…'),running:text('正在保存','Saving')+' · '+Math.round(task.percentage||0)+'%'+(task.speed?' · '+(task.speed/1048576).toFixed(1)+' MB/s':''),complete:text('已保存','Saved'),cancelled:text('已取消','Cancelled')})[task.status];
    if(task.status==='choosing')$('image-save-bar').removeAttribute('value');else $('image-save-bar').value=task.status==='complete'?100:task.percentage||0;
  }
  async function saveAs(p={}){
    const at=imageIndex(p.index);if(saveTask&&['choosing','running'].includes(saveTask.status))throw Error(text('已有图片正在保存','An image save is already in progress'));
    auto?.pause();const task=saveTask={id:'image-save-'+crypto.randomUUID(),index:at,name:state.entries[at].name,source:state.entries[at].path,status:'choosing',percentage:0,destination:null,error:null,speed:0,bytesTransferred:0,totalBytes:0};paintSave();hideImageMenu();
    try{const result=await native('image.saveAs',{...scope(),index:at,operationId:task.id,...(p.destination===undefined?{}:{destination:p.destination}),...(p.overwrite===undefined?{}:{overwrite:p.overwrite}),...(p.expectedTargetRevision===undefined?{}:{expectedTargetRevision:p.expectedTargetRevision})});task.status=result.saved?'complete':'cancelled';task.destination=result.path??null;if(result.saved)task.percentage=100;return result;}
    catch(e){task.status=String(e).includes('[cancelled]')?'cancelled':'failed';task.error=String(e.message||e);throw e;}finally{if(saveTask===task)paintSave();}
  }
  async function copyImagePath(p={}){
    const at=imageIndex(p.index);let path=state.entries[at].path;auto?.pause();
    if(RHFilesDevicePaths.is(path)){const data=await core.invoke('device_groups',{command:'state',args:{}}),peers=[];for(const group of data.groups||[])for(const peer of group.members||[])if(!peer.self&&!peer.blocked&&peer.server)peers.push({group:group.id,groupName:group.name,peer:peer.id,name:data.deviceAliases?.[peer.id]||peer.name});path=RHFilesDevicePaths.addressFor(path,peers,{strict:true});}
    await navigator.clipboard.writeText(path);hideImageMenu();return {copied:true,path};
  }
  applyLanguage();
  function error(value){const target=state?.kind==='video'?'video-startup-status':'message';$(target).textContent=String(value.message||value);}
  function paintAuto(value){autoSpeed=value.speed;$('auto-scroll').textContent=value.running?text('暂停滚动','Pause'):text('自动滚动','Auto scroll');$('auto-scroll').setAttribute('aria-keyshortcuts','Space');$('auto-speed').value=value.speed;$('auto-speed-number').value=value.speed;$('auto-speed-multiplier').textContent=(value.speed/60).toFixed(1)+'×';$('auto-speed').title=text('滚动速度 ','Scroll speed ')+(value.speed/60).toFixed(1)+'×';}
  function autoControl(command,value){if(focused&&command!=='pause')throw Error(text('请先退出专注浏览','Exit focused image viewing first'));if(state?.kind!=='image'||state.mode!=='continuous')throw Error(text('请先打开连续图片浏览','Open continuous image browsing first'));if(command==='start'||command==='toggle'&&!auto.state().running){zoom=1;x=y=0;}return command==='speed'?auto.setSpeed(value):auto[command]();}
  function header(){if(!state)return;const i=index(),shown=caption();$('title').textContent=shown.name;$('title').title=shown.name;document.title=shown.name+' · RHFiles';$('counter').textContent=(shown.index+1)+' / '+state.entries.length;$('previous').disabled=state.kind==='image'?state.entries.length<2:i===0;$('next').disabled=state.kind==='image'?state.entries.length<2:i===state.entries.length-1;for(const mode of ['paged','continuous'])$('mode-'+mode).setAttribute('aria-pressed',String(state.mode===mode));imageProgress();}
  async function source(entry){const key=entry.path;if(!sources.has(key)){if(sources.size>=32)sources.delete(sources.keys().next().value);sources.set(key,key.startsWith('rhfiles-device:')?core.invoke('device_fs',{action:'resource',args:{path:key}}).then(v=>v.url):Promise.resolve(core.convertFileSrc(key)));}return sources.get(key);}
  let stripScale=1;
  function transform(){
    if(state?.mode==='continuous'&&stripScale!==Math.min(zoom,1)){images();return;}
    const quarter=angle%180!==0,w=$('viewport').clientWidth,h=$('viewport').clientHeight;$('viewport').classList.toggle('image-zoomed',zoom>1);
    for(const [at,page]of pages){
      const image=page.querySelector('img'),active=at===Math.round(position),frame=state.mode==='continuous'?stripFrames.get(at):null;
      image.style.width=frame?frame.imageWidth+'px':quarter?h+'px':'100%';
      image.style.height=frame?frame.imageHeight+'px':quarter?w+'px':'100%';
      image.style.transform=`translate(-50%,-50%) translate(${active?x:0}px,${active?y:0}px) scale(${active?(frame?Math.max(zoom,1):zoom):1}) rotate(${angle}deg)`;
    }
    header();paintSelection();
  }
  function images(){
    if(!state||state.kind!=='image')return;
    const center=Math.round(position),continuous=state.mode==='continuous';header();$('auto-scroll').hidden=!continuous;$('auto-speed-label').hidden=!continuous;stripScale=continuous?Math.min(zoom,1):1;strip.resize($('viewport').clientWidth,$('viewport').clientHeight,angle,stripScale);
    stripFrames=new Map(continuous?strip.layout(position).map(frame=>[frame.slot,frame]):[]);
    const wanted=continuous?[...stripFrames.keys()]:state.entries.length<2?[0]:[center,center+1,center-1];
    for(const [at,page]of pages)if(!wanted.includes(at)){page.querySelector('img').removeAttribute('src');page.remove();pages.delete(at);}
    for(const at of wanted){
      let page=pages.get(at);
      if(!page){
        page=document.createElement('div');page.className='image-page';page.dataset.index=strip.item(at);page.dataset.slot=at;
        const image=new Image(),status=document.createElement('div');image.alt=state.entries[strip.item(at)].name;image.draggable=false;image.decoding='async';status.className='image-error';status.textContent=text('正在读取图片…','Loading image…');
        image.onload=()=>{
          status.remove();if(pages.get(at)!==page)return;
          const anchor=Math.round(position),shift=strip.offset(position)-strip.offset(anchor);
          strip.measure(strip.item(at),image.naturalWidth,image.naturalHeight);
          if(state.mode==='continuous')position=strip.move(anchor,shift);
          images();
        };
        image.onerror=()=>{status.dataset.failed='true';status.textContent=text('图片无法解码，可使用系统应用打开','Cannot decode this image. Try the system app.');};
        page.append(image,status);pages.set(at,page);$('track').append(page);const token=epoch;
        source(state.entries[strip.item(at)]).then(url=>{if(token===epoch&&pages.get(at)===page)image.src=url;}).catch(e=>{if(token===epoch&&pages.get(at)===page)status.textContent=e.message;});
      }
      const frame=stripFrames.get(at);page.dataset.active=String(at===center);page.style.left=frame?frame.left+'px':(at-center)*100+'%';page.style.width=frame?frame.width+'px':'100%';
    }
    $('track').style.transform=continuous?'':`translateX(${-(position-center)*$('viewport').clientWidth}px)`;transform();
    boundary.update(continuous?[...stripFrames.values()]:wanted.map(at=>({slot:at,index:strip.item(at),left:(at-position)*$('viewport').clientWidth})),{width:$('viewport').clientWidth,count:state.entries.length,zoom,...(continuous?{cycle:Math.floor(Math.round(position)/state.entries.length)}:{})});
  }
  function clear(){focusLeave();hideImageMenu();boundary.clear();auto?.pause();auto=null;++epoch;clearTimeout(poll);clearTimeout(chromeTimer);volumeJob=null;volumeDragging=false;wheelDelta=0;chromeHover=false;document.body.classList.remove('video-fullscreen');video=null;rendered=false;pointer=null;imageSeeking=false;zoom=1;angle=x=y=0;for(const p of pages.values())p.querySelector('img').removeAttribute('src');pages.clear();sources.clear();$('track').replaceChildren();$('track').style.transform='';$('message').textContent='';$('video-startup-status').textContent='';}
  async function select(at){
    if(!state)return;if(closing)throw Error(text('查看器正在关闭','The viewer is closing'));const generation=state.generation;
    if(selectionTask){await selectionTask.catch(()=>{});if(generation!==state.generation)throw Error(text('查看内容已改变','The viewed content changed'));return select(at);}
    const wrapped=state.kind==='image'&&state.entries.length>1&&(at<0||at>=state.entries.length)?Math.sign(at):0;
    at=state.kind==='image'?strip.item(at):Math.max(0,Math.min(state.entries.length-1,at));
    const token=++epoch;loading=true;
    const task=(async()=>{const result=await native('select',{...scope(),index:at});if(token===epoch)await activate(result);})();selectionTask=task;
    try{await task;if(wrapped&&generation===state.generation&&state.index===at)boundary.notify(wrapped);return snapshot();}finally{if(selectionTask===task){selectionTask=null;loading=false;}}
  }
  async function seekImage(at){if(state?.kind!=='image'||!Number.isInteger(at)||at<0||at>=state.entries.length)throw Error(text('图片位置无效','Invalid image index'));auto?.pause();imageSeeking=false;pointer=null;return select(at);}
  async function videoControl(command,value){if(command==='volume')return setVolume(value);if(!video?.opened)throw Error(text('播放器尚未就绪','Player is not ready'));++controlRevision;const token=epoch,input=video.inputId,result=await native('video.control',{...scope(),expectedInput:input,command,...(value===undefined?{}:{value})});if(token===epoch){++controlRevision;video=result;}return result;}
  async function bounds(){if(!video?.opened)return;const r=$('viewport').getBoundingClientRect(),shown=fullVideo()&&controlsVisible;return native('video.bounds',{...scope(),expectedInput:video.inputId,x:r.x,y:r.y,width:r.width,height:r.height,clipTop:shown?document.querySelector('header').getBoundingClientRect().height:0,clipBottom:shown?document.querySelector('footer').getBoundingClientRect().height:0});}
  function paintVideoStartup() {
    const panel=$('video-diagnostics'), button=$('video-diagnostics-toggle');
    button.hidden=state?.kind!=='video';
    button.textContent=text('播放诊断','Playback diagnostics');
    button.setAttribute('aria-expanded',String(diagnosticsOpen));
    panel.hidden=!diagnosticsOpen||button.hidden;
    const startup=video?.startup;
    const phases={window:text('正在打开查看器…','Opening viewer…'),source:text('正在连接视频来源…','Connecting to video source…'),player:text('正在初始化播放器…','Initializing player…'),firstFrame:text('正在等待首帧…','Waiting for first frame…'),output:text('正在显示首帧…','Showing first frame…')};
    if(startup?.error)error(startup.error);
    else if(!rendered&&!button.hidden)$('video-startup-status').textContent=phases[startup?.phase]||text('正在准备视频…','Opening video…');
    if(panel.hidden)return;
    $('video-diagnostics-title').textContent=button.textContent;
    const source={local:text('本地文件','Local file'),smb:'SMB',device:text('RHFiles 设备','RHFiles device')}[startup?.transport];
    const status=startup?.phase==='ready'?text('首帧就绪','First frame ready'):phases[startup?.phase]||text('正在准备视频…','Opening video…');
    $('video-diagnostics-summary').textContent=[source,startup?.reused?text('已复用播放器','Player reused'):null,startup?.error||status].filter(Boolean).join(' · ');
    const stages=startup?.stages;
    const init=startup?.vlcInit;
    const rows=[
      [text('窗口创建','Viewer window'),startup?.windowMs],
      [text('VLC 初始化','VLC initialization'),startup?.playerInitMs],
      ...(init ? [
        [text('VLC 初始化任务排队','VLC worker queue'),init.workerQueueMs],
        ...(init.libraryWaitMs>0?[[text('等待 VLC DLL 加载','Wait for VLC DLL loader'),init.libraryWaitMs]]:[]),
        ...(init.runtimeLookupMs!=null?[[text('定位 VLC 运行库','Locate VLC runtime'),init.runtimeLookupMs]]:[]),
        [text('加载 VLC DLL','Load VLC DLL'),init.libraryReused?text('已加载','Already loaded'):init.dllLoadMs],
        ...(init.prewarm?[[text('后台预加载 VLC DLL','Background VLC DLL load'),init.prewarm.dllLoadMs]]:[]),
        ...(init.apiSetupMs!=null?[[text('读取 VLC 接口与插件索引','Resolve VLC exports and plugin index'),init.apiSetupMs]]:[]),
        [text('创建 VLC 实例','Create VLC instance'),init.instanceMs],
        [text('创建 VLC 播放器','Create VLC player'),init.playerCreateMs],
      ] : []),
      [text('画布排队','Surface dispatch'),startup?.surfaceQueueMs],
      [text('画布创建与初始化','Surface creation and setup'),startup?.surfaceInitMs],
      [text('来源准备','Source setup'),startup?.sourceMs],
      [text('切换播放输入','Switch playback input'),stages?.inputSwitchMs],
      [text('开始播放至读到数据','Play to first input data'),stages?.firstReadMs],
      [text('首次读取 I/O','First read I/O'),stages?.readWaitMs],
      ...(startup?.transport==='device'?[[text('远程首字节','Remote first byte'),startup.firstRemoteByteMs]]:[]),
      [text('播放缓冲','Playback buffering'),stages?.bufferingMs],
      [text('缓冲后等解码器','Decoder wait after buffering'),stages?.decoderWaitMs],
      [text('解码器就绪至解码首帧','Decoder ready to first picture'),stages?.decodeMs],
      [text('开始播放至解码首帧','Play to first decoded picture'),stages?.decodedAtMs],
      [text('解码至检测到 VLC 输出','Decoded to observed VLC output'),stages?.outputMs],
      [text('打开至网页视口就绪','Open to WebView viewport'),startup?.frontendViewportAtMs],
      [text('首帧显示排队','First-frame display dispatch'),startup?.layoutQueueMs],
      [text('首帧显示布局','First-frame display layout'),startup?.layoutMs],
      [text('VLC 输出至画布显示','VLC output to visible surface'),startup?.revealMs],
      [text('总等待','Total wait'),startup?.elapsedMs],
    ];
    $('video-diagnostics-steps').replaceChildren(...rows.map(([label,value])=>{
      const item=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=typeof value==='number'?value.toLocaleString()+' ms':value??'—';
      item.append(dt,dd);return item;
    }));
  }
  function setDiagnostics(open) {
    if(state?.kind!=='video')return {open:false,startup:null};
    diagnosticsOpen=open;
    paintVideoStartup();showControls();
    void bounds().catch(error);
    return {open:diagnosticsOpen,startup:video?.startup??null};
  }
  function wakeVideo() {
    if(state?.kind!=='video')return;
    clearTimeout(poll);
    if(videoPolling?.token===epoch){videoPolling.again=true;return;}
    void pollVideo(epoch);
  }
  async function pollVideo(token) {
    const job={token,again:false};
    videoPolling=job;
    try{
      const revision=controlRevision,result=await native('video.state',scope());
      if(token!==epoch||revision!==controlRevision)return;
      const changedInput=video?.inputId!==result.inputId;
      video=result;paintVolume();
      let failure;
      if(result.opened){
        $('position').textContent=clock(result.positionMs);
        $('duration').textContent=clock(result.durationMs);
        if(!seekDragging)$('seek').value=result.durationMs>0?Math.round(result.positionMs/result.durationMs*1000):0;
        $('toggle').textContent=result.pauseRequested||result.state===4?text('继续','Play'):result.state===6?text('重播','Replay'):text('暂停','Pause');
        failure=result.presentationError||result.seekError||(result.state===7?text('播放失败，可使用系统应用打开','Playback failed. Try the system app.'):null);
        if(result.renderedFrames>0&&!rendered){
          const alreadyVisible=result.startup?.phase==='ready';
          const reveal=alreadyVisible?{visible:true}:await bounds();
          if(token!==epoch)return;
          if(reveal?.visible){
            if(reveal.startup)video.startup={...video.startup,...reveal.startup};
            $('video-startup-status').textContent='';rendered=true;
            if(alreadyVisible&&changedInput)void bounds().catch(e=>{if(token===epoch)error(e);});
          }
        }else if(changedInput||result.restoringPausedFrame||result.pendingSeekMs!=null)await bounds();
      }
      if(token!==epoch)return;
      paintVideoStartup();
      if(failure)error(failure);
    }catch(e){if(token===epoch)error(e);}
    finally{
      if(videoPolling===job)videoPolling=null;
      if(token===epoch){if(job.again)wakeVideo();else poll=setTimeout(wakeVideo,400);}
    }
  }
  async function activate(result) {
    const fresh=result.generation!==state?.generation;
    clear();state=result;position=state.index;
    strip=RHFilesImageStrip.create(state.entries.length,{loop:state.kind==='image'});
    if(fresh){closing=false;applyLanguage(state.language);}
    header();
    const image=state.kind==='image';
    $('image-progress').hidden=!image;$('mode').hidden=!image;$('image-controls').hidden=!image;$('video-controls').hidden=image;
    if(image){
      diagnosticsOpen=false;
      paintVideoStartup();
      $('message').textContent='';
      auto=RHFilesImageStrip.autoScroll({speed:autoSpeed,move:delta=>{if(document.hidden||state.mode!=='continuous')return false;position=strip.move(position,delta);images();return state.entries.length>1;},changed:paintAuto});
      paintAuto(auto.state());images();return;
    }
    paintVideoStartup();
    const token=epoch;
    controlsVisible=true;
    wakeVideo();
    const full=await windowApi.isFullscreen();
    if(token!==epoch)return;
    fullscreen=full;paintChrome();if(fullVideo())showControls();
  }
  async function refresh(){const result=await native('state');if(result.generation&&result.generation!==state?.generation)await activate(result);}
  async function mode(value){if(!['paged','continuous'].includes(value))throw Error(text('图片浏览模式无效','Invalid image mode'));hideImageMenu();const result=await native('mode',{...scope(),mode:value});state=result;if(value==='paged'){auto?.pause();position=index();}images();return snapshot();}
  function snapshot(){return state?{opened:true,...state,focus:focusState(),fullscreen,controlsVisible,videoSeekSeconds:seekSeconds(),index:index(),path:state.entries[index()].path,position:state.kind==='image'?strip.normalize(position):position,zoom,angle,rendered,language:zh?'zh':'en',caption:caption(),contextMenu:contextImage?{index:contextImage.index,path:state.entries[contextImage.index].path}:null,saveTask,progress:{index:index(),total:state.entries.length,previewIndex:imageSeeking?Number($('image-seek').value):null},loopBoundary:boundary.state(),autoScroll:auto?.state()||{running:false,speed:autoSpeed},video:video?{...video}:null}:{opened:false};}
  async function close(run){const generation=state.generation;closing=true;auto?.pause();try{if(selectionTask)await selectionTask.catch(()=>{});if(state.generation!==generation)throw Error(text('查看内容已改变','The viewed content changed'));const args=scope();clear();return await native('close',{...args,...(run?{_automationRun:run}:{})});}catch(error){if(state.generation===generation)closing=false;throw error;}}
  async function systemOpen(at=index()){if(!Number.isInteger(at)||at<0||at>=state.entries.length)throw Error(text('文件位置无效','Invalid file index'));const path=state.entries[at].path;return path.startsWith('rhfiles-device:')?core.invoke('device_transfer',{action:'open',args:{path,command:'open_file'}}):core.invoke('open_file',{path});}
  const actions={next:()=>select(index()+1),previous:()=>select(index()-1),fit:()=>{if(focused)return focusFit();auto?.pause();zoom=1;x=y=0;transform();},zoomIn:()=>{if(focused)return focusZoom(Math.min(16,focused.zoom*1.4));auto?.pause();zoom=Math.min(8,zoom*1.4);transform();},zoomOut:()=>{if(focused)return focusZoom(Math.max(.1,focused.zoom/1.4));auto?.pause();zoom=Math.max(.25,zoom/1.4);transform();},rotate:()=>{if(focused){focused.angle=(focused.angle+90)%360;paintFocus();return focusState();}auto?.pause();angle=(angle+90)%360;images();},close,systemOpen,fullscreen:toggleFullscreen};
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  api.provideState('application',()=>({platform:'windows',window:'window-file-viewer',ready:!!state}));api.register('media.viewer.state',snapshot,{params:object(),risk:'read'});api.register('media.viewer.mode.set',p=>mode(p.mode),{params:object({mode:{enum:['paged','continuous']}},['mode']),risk:'settings'});api.register('media.viewer.video.control',p=>videoControl(p.command,p.value),{params:object({command:{enum:['pause','resume','seek','volume','rate']},value:{type:'number'}},['command']),risk:'ui'});
  api.register('media.viewer.seek',p=>seekImage(p.index),{params:object({index:{type:'integer',minimum:0,maximum:4999}},['index']),risk:'ui'});
  api.register('media.viewer.focus.state',focusState,{params:object(),risk:'read'});
  api.register('media.viewer.focus.enter',p=>focusEnter(p.index),{params:object({index:{type:'integer',minimum:0,maximum:4999}}),risk:'ui'});
  api.register('media.viewer.focus.exit',focusLeave,{params:object(),risk:'ui'});
  api.register('media.viewer.focus.zoom',p=>focusZoom(p.scale,p.x===undefined&&p.y===undefined?null:p),{params:object({scale:{type:'number',minimum:.1,maximum:16},x:{type:'number'},y:{type:'number'}},['scale']),risk:'ui'});
  api.register('media.viewer.focus.pan',p=>focusPan(p.x,p.y),{params:object({x:{type:'number',minimum:-1000000,maximum:1000000},y:{type:'number',minimum:-1000000,maximum:1000000}},['x','y']),risk:'ui'});
  api.register('media.viewer.focus.fit',focusFit,{params:object(),risk:'ui'});
  api.register('media.viewer.video.diagnostics.set',p=>setDiagnostics(p.open),{params:object({open:{type:'boolean'}},['open']),risk:'ui'});
  api.register('media.viewer.video.diagnostics',()=>({open:diagnosticsOpen,startup:video?.startup??null}),{params:object(),risk:'read'});
  api.register('media.viewer.video.skip',p=>skipVideo(p.seconds),{params:object({seconds:{type:'number',minimum:-600,maximum:600}},['seconds']),risk:'ui'});
  api.register('media.viewer.fullscreen.set',p=>setFullscreen(p.fullscreen),{params:object({fullscreen:{type:'boolean'}},['fullscreen']),risk:'ui'});
  api.register('media.viewer.window.state',()=>native('window.state',scope()),{params:object(),risk:'read'});
  api.provideRunLookup(query=>core.invoke('automation_receipt',{query}));api.provideRunTransport(()=>core.invoke('automation_receipt_transport'));
  for(const command of ['start','pause','toggle'])api.register('media.viewer.auto.'+command,()=>autoControl(command),{params:object(),risk:'ui'});
  api.register('media.viewer.auto.speed.set',p=>autoControl('speed',p.speed),{params:object({speed:{type:'number',minimum:10,maximum:6000}},['speed']),risk:'ui'});
  const imageParam={type:'integer',minimum:0,maximum:4999};
  api.register('media.viewer.context.open',contextOpen,{params:object({index:imageParam,x:{type:'number'},y:{type:'number'}}),risk:'ui'});
  api.register('media.viewer.context.close',()=>{hideImageMenu();return snapshot();},{params:object(),risk:'ui'});
  api.register('media.viewer.saveAs',saveAs,{params:object({index:imageParam,destination:{type:'string',minLength:1,maxLength:32768},overwrite:{type:'boolean'},expectedTargetRevision:{type:'string',maxLength:256}}),risk:'write'});
  api.register('media.viewer.copyPath',copyImagePath,{params:object({index:imageParam}),risk:'external'});
  api.register('media.viewer.save.dismiss',()=>{if(saveTask)saveTask.dismissed=true;paintSave();return snapshot();},{params:object(),risk:'ui'});
  api.register('media.viewer.systemOpen',p=>{const at=p.index??focused?.index??index();hideImageMenu();return systemOpen(at);},{params:object({index:imageParam}),risk:'external'});
  api.register('media.viewer.close',(_,run)=>close(run),{params:object(),risk:'ui'});
  for(const [name,handler]of Object.entries(actions))if(!['close','systemOpen'].includes(name))api.register('media.viewer.'+name,handler,{params:object(),risk:'ui'});
  function listen(id,event,fn){RHFilesUI.listen(typeof id==='string'?$(id):id,event,fn,undefined,'desktop.file-viewer.'+(typeof id==='string'?id:'document')+'.'+event);}
  for(const [id,action]of Object.entries({previous:'previous',next:'next',fit:'fit','zoom-in':'zoomIn','zoom-out':'zoomOut',rotate:'rotate',close:'close',system:'systemOpen',fullscreen:'fullscreen'}))listen(id,'click',()=>api.invoke('media.viewer.'+action).catch(error));
  listen('video-diagnostics-toggle','click',()=>api.invoke('media.viewer.video.diagnostics.set',{open:!diagnosticsOpen}).catch(error));
  for(const value of ['paged','continuous'])listen('mode-'+value,'click',()=>api.invoke('media.viewer.mode.set',{mode:value}).catch(error));listen('toggle','click',()=>videoControl(video?.pauseRequested||video?.state===4||video?.state===6?'resume':'pause').catch(error));listen('rate','change',()=>videoControl('rate',Number($('rate').value)).catch(error));
  listen('volume','pointerdown',()=>volumeDragging=true);listen('volume','pointerup',()=>volumeDragging=false);listen('volume','pointercancel',()=>{volumeDragging=false;paintVolume();});listen('volume','blur',()=>volumeDragging=false);
  for(const event of ['input','change'])listen('volume',event,()=>api.invoke('media.viewer.video.control',{command:'volume',value:Number($('volume').value)}).catch(error));
  listen('auto-scroll','click',()=>api.invoke('media.viewer.auto.toggle').catch(error));listen('auto-speed','input',()=>api.invoke('media.viewer.auto.speed.set',{speed:Number($('auto-speed').value)}).catch(error));
  listen('auto-speed-number','change',()=>api.invoke('media.viewer.auto.speed.set',{speed:Number($('auto-speed-number').value)}).catch(e=>{paintAuto(auto.state());error(e);}));
  for(const [id,action]of Object.entries({'image-save-as':'saveAs','image-copy-path':'copyPath','image-system-open':'systemOpen'}))listen(id,'click',()=>{const at=contextImage?.index;if(at===undefined)return;void api.invoke('media.viewer.'+action,{index:at}).catch(error);});
  listen('image-save-dismiss','click',()=>api.invoke('media.viewer.save.dismiss').catch(error));
  const observeMouse=event=>{if(event.pointerType==='mouse'){mousePoint={x:event.clientX,y:event.clientY};header();}};
  listen('viewport','pointerenter',observeMouse);listen('viewport','pointermove',observeMouse);listen('viewport','pointerleave',()=>{mousePoint=null;header();});
  listen(window,'blur',()=>{mousePoint=null;header();});
  listen(document,'pointerdown',event=>{if(contextImage&&!$('image-menu').contains(event.target))hideImageMenu();});
  listen('viewport','contextmenu',event=>{event.preventDefault();event.stopPropagation();if(state?.kind!=='image')return;const point={x:event.clientX,y:event.clientY},target=hitImage(point);if(target)showImageMenu(target,point);else hideImageMenu();});
  listen('image-seek','pointerdown',()=>{imageSeeking=true;auto?.pause();});listen('image-seek','input',()=>{imageSeeking=true;auto?.pause();imageProgress(Number($('image-seek').value));});listen('image-seek','change',()=>{const at=Number($('image-seek').value);imageSeeking=false;void seekImage(at).catch(error);});listen('image-seek','pointercancel',()=>{imageSeeking=false;imageProgress();});
  listen(window,'storage',event=>{if(event.key==='rhfiles-lang')applyLanguage(event.newValue||state?.language);});
  listen(document,'visibilitychange',()=>{if(document.hidden)auto?.pause();});
  listen('seek','pointerdown',()=>seekDragging=true);listen('seek','pointercancel',()=>seekDragging=false);listen('seek','change',()=>{seekDragging=false;void videoControl('seek',Math.round(Number($('seek').value)/1000*(video?.durationMs||0))).catch(error);});
  listen('viewport','pointerdown',event=>{if(state?.kind!=='image'||event.button!==0)return;auto?.pause();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,position,panX:x,panY:y};try{$('viewport').setPointerCapture(event.pointerId);}catch{}});
  listen('viewport','pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(zoom>1){x=pointer.panX+dx;y=pointer.panY+dy;transform();return;}if(Math.abs(dx)<Math.abs(dy))return;position=state.entries.length<2?0:state.mode==='continuous'?strip.move(pointer.position,-dx):pointer.position-dx/Math.max(1,$('viewport').clientWidth);images();});
  listen('viewport','pointerup',event=>{if(!pointer||event.pointerId!==pointer.id)return;const start=pointer;pointer=null;if(zoom>1)return;if(state.mode==='paged'){const dx=event.clientX-start.x,dy=event.clientY-start.y;position=start.position;if(Math.abs(dx)>=Math.min(60,$('viewport').clientWidth*.12)&&Math.abs(dx)>Math.abs(dy)*1.25)void select(Math.round(position)+(dx<0?1:-1)).catch(error);else images();}});
  listen('viewport','pointercancel',()=>{pointer=null;if(state?.mode==='paged'){position=state.index;images();}});
  RHFilesUI.listen($('viewport'),'wheel',event=>{if(state?.kind==='video'){if(!video?.opened||!event.deltaY||event.ctrlKey||event.altKey||event.metaKey)return;event.preventDefault();wheelDelta+=event.deltaY*(event.deltaMode===1?40:event.deltaMode===2?100:1);const steps=Math.trunc(wheelDelta/100);if(steps){wheelDelta-=steps*100;void api.invoke('media.viewer.video.control',{command:'volume',value:Math.max(0,Math.min(100,(volumeJob?.value??video.volume)-Math.max(-4,Math.min(4,steps))*5))}).catch(error);}return;}if(state?.kind!=='image')return;event.preventDefault();auto?.pause();if(event.ctrlKey){zoom=Math.max(.25,Math.min(8,zoom*(event.deltaY>0?.9:1.1)));transform();return;}if(zoom>1)return;if(state.mode==='continuous'){position=strip.move(position,event.deltaX||event.deltaY);images();}else if(Math.abs(event.deltaX||event.deltaY)>10)void select(index()+((event.deltaX||event.deltaY)>0?1:-1)).catch(error);},{passive:false},'desktop.file-viewer.wheel');
  for(const area of [document.querySelector('header'),document.querySelector('footer')]){listen(area,'pointerenter',()=>{chromeHover=true;showControls();});listen(area,'pointerleave',()=>{chromeHover=false;showControls();});}
  listen(document,'pointermove',()=>showControls());listen('viewport','dblclick',event=>{if(state?.kind==='video')void api.invoke('media.viewer.fullscreen').catch(error);else if(state?.kind==='image'){const hit=hitImage({x:event.clientX,y:event.clientY});if(hit)void api.invoke('media.viewer.focus.enter',{index:hit.index}).catch(error);}});
  listen('viewport','pointerdown',()=>{if(state?.kind==='video')$('viewport').focus({preventScroll:true});});
  listen(document,'keydown',event=>{
    if(event.isComposing||event.ctrlKey||event.altKey||event.metaKey)return;
    const editing=event.target.isContentEditable||/TEXTAREA|SELECT/.test(event.target.tagName)||event.target.tagName==='INPUT'&&event.target.type!=='range';
    if(contextImage){if(event.key==='Escape'){event.preventDefault();hideImageMenu();$('viewport').focus({preventScroll:true});}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...$('image-menu').querySelectorAll('button')],at=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}return;}
    if(focused&&!contextImage&&!editing){
      if(event.key==='Escape'){event.preventDefault();void api.invoke('media.viewer.focus.exit').catch(error);return;}
      if(['+','=','-','0'].includes(event.key)){event.preventDefault();void api.invoke(event.key==='0'?'media.viewer.focus.fit':'media.viewer.focus.zoom',event.key==='0'?{}:{scale:Math.max(.1,Math.min(16,focused.zoom*(event.key==='-'?1/1.2:1.2)))}).catch(error);return;}
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End',' '].includes(event.key)){event.preventDefault();return;}
      if(event.key==='Tab'){const nodes=[...$('image-focus').querySelectorAll('button,[tabindex]')],at=nodes.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();nodes.at(-1).focus();}else if(!event.shiftKey&&at===nodes.length-1){event.preventDefault();nodes[0].focus();}return;}
    }
    if(!editing&&event.key.toLowerCase()==='f'){event.preventDefault();if(!event.repeat)void api.invoke('media.viewer.fullscreen').catch(error);return;}
    if(!editing&&event.key==='Escape'&&diagnosticsOpen){event.preventDefault();setDiagnostics(false);return;}
    if(!editing&&event.key==='Escape'&&fullscreen){event.preventDefault();void api.invoke('media.viewer.fullscreen.set',{fullscreen:false}).catch(error);return;}
    if(state?.kind==='video')showControls();
    if(editing||event.target.tagName==='INPUT')return;
    if(event.key===' '){if(state?.kind==='image'&&state.mode==='continuous'){event.preventDefault();if(!event.repeat)void api.invoke('media.viewer.auto.toggle').catch(error);}else if(state?.kind==='video'){event.preventDefault();if(!event.repeat)void videoControl(video?.pauseRequested||video?.state===4?'resume':'pause').catch(error);}return;}
    if(state?.kind==='image'&&['Home','End'].includes(event.key)){event.preventDefault();void seekImage(event.key==='Home'?0:state.entries.length-1).catch(error);return;}
    if(event.key==='ContextMenu'&&state?.kind==='image'){event.preventDefault();void api.invoke('media.viewer.context.open').catch(error);return;}
    if(state?.kind==='video'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(!event.repeat)void api.invoke('media.viewer.video.skip',{seconds:(event.key==='ArrowLeft'?-1:1)*seekSeconds()}).catch(error);return;}
    const action={ArrowRight:'next',ArrowLeft:'previous',Escape:'close',f:'fullscreen','+':'zoomIn','-':'zoomOut','0':'fit'}[event.key];if(action){event.preventDefault();void api.invoke('media.viewer.'+action).catch(error);}
  });
  listen(document,'contextmenu',event=>event.preventDefault());
  listen('image-focus-back','click',()=>api.invoke('media.viewer.focus.exit').catch(error));
  listen('image-focus-fit','click',()=>api.invoke('media.viewer.focus.fit').catch(error));
  for(const [id,factor]of [['image-focus-in',1.2],['image-focus-out',1/1.2]])listen(id,'click',()=>api.invoke('media.viewer.focus.zoom',{scale:Math.max(.1,Math.min(16,focused.zoom*factor))}).catch(error));
  RHFilesUI.listen($('image-focus-stage'),'wheel',event=>{if(!focused)return;event.preventDefault();const delta=(event.deltaY||event.deltaX)*(event.deltaMode===1?40:event.deltaMode===2?100:1),scale=Math.max(.1,Math.min(16,focused.zoom*Math.exp(-Math.max(-600,Math.min(600,delta))*.0015)));void api.invoke('media.viewer.focus.zoom',{scale,x:event.clientX,y:event.clientY}).catch(error);},{passive:false},'desktop.file-viewer.focus.wheel');
  listen('image-focus-stage','pointerdown',event=>{if(!focused||focused.loading||event.button!==0)return;focusPointer={id:event.pointerId,x:event.clientX,y:event.clientY,panX:focused.x,panY:focused.y};$('image-focus-stage').classList.add('dragging');try{$('image-focus-stage').setPointerCapture(event.pointerId);}catch{}});
  listen('image-focus-stage','pointermove',event=>{if(!focused||!focusPointer||event.pointerId!==focusPointer.id)return;void api.invoke('media.viewer.focus.pan',{x:focusPointer.panX+event.clientX-focusPointer.x,y:focusPointer.panY+event.clientY-focusPointer.y}).catch(error);});
  for(const event of ['pointerup','pointercancel'])listen('image-focus-stage',event,()=>{focusPointer=null;$('image-focus-stage').classList.remove('dragging');});
  listen('image-focus-stage','contextmenu',event=>{event.preventDefault();event.stopPropagation();void api.invoke('media.viewer.context.open',{x:event.clientX,y:event.clientY}).catch(error);});
  const resize=new ResizeObserver(()=>{if(focused)paintFocus();if(state?.kind==='image')images();else void bounds().catch(error);});resize.observe($('viewport'));
  window.__TAURI__.event.listen('op-progress',({payload:p})=>{if(saveTask&&p?.operationId===saveTask.id&&!['complete','failed','cancelled'].includes(saveTask.status)){Object.assign(saveTask,{status:'running',percentage:p.percentage??0,speed:p.speed??0,bytesTransferred:p.bytesTransferred??0,totalBytes:p.totalBytes??0});paintSave();}}).catch(error);
  window.__TAURI__.event.listen('file-viewer-video',({payload})=>{if(payload.generation===state?.generation&&payload.selection===state.selection)wakeVideo();}).catch(error);
  window.__TAURI__.event.listen('file-viewer-changed',()=>refresh().catch(error)).catch(error);void refresh().catch(error);
})();
