(() => {
  'use strict';
  const api=window.RHFilesAPI,$=id=>document.getElementById(id),object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const native=(action,args={})=>window.__TAURI__.core.invoke('rhvideo_request',{action,args:state.generation?{...args,_sessionGeneration:state.generation}:args});
  api.provideRunLookup(query=>window.__TAURI__.core.invoke('automation_receipt',{query}));
  api.provideRunTransport(()=>window.__TAURI__.core.invoke('automation_receipt_transport'));
  api.provideState('application',()=>({platform:'windows',window:'window-rhvideo-player',ready}));
  let state={opened:false},ready=false,busy=false,dragging=false,volumeDragging=false,queueDragging=false,favoriteDragging=false,closed=false;
  function error(value){delete $('error').dataset.automation;$('error').textContent=String(value?.message||value);}
  let audibleVolume=100;
  function paused(value){return value.pauseRequested??(value.state===4);}
  function toggleCommand(value){return value.state===6||paused(value)?'resume':'pause';}
  function sourceControls(enabled){for(const node of document.querySelectorAll('#controls button,#controls input,#controls select'))if(node.id!=='back')node.disabled=!enabled;}
  function paint(value){
    const generation=value.generation??state.generation;if(generation&&state.generation&&generation<state.generation)return;
    sourceControls(value.opened&&value.queue?.id);
    state={...value,generation};ready=true;if(!state.opened){$('status').textContent='播放已停止';return;}
    $('title').textContent=state.title;$('position').textContent=RHVideoModel.clock(state.positionMs/1000);$('duration').textContent=RHVideoModel.clock(state.durationMs/1000);
    if(!dragging)$('seek').value=state.durationMs>0?Math.round(state.positionMs/state.durationMs*1000):0;
    $('toggle').textContent=state.state===6?'重新播放':paused(state)?'继续':'暂停';
    $('status').textContent=state.state===7?'播放失败，请检查服务器或媒体编码':state.state===6?'播放结束':paused(state)?state.state===4?'已暂停':'正在暂停…':state.state===4?'正在继续…':state.state===1||state.state===2?'正在缓冲…':'播放中';
    if(state.pendingSeekMs!=null)$('status').textContent='正在定位…';
    if(state.state===5)$('status').textContent='播放已停止';
    if(state.restoringPausedFrame)$('status').textContent='正在恢复暂停画面…';
    if(state.presentationError)$('status').textContent='画面显示失败';
    if(state.volume>0)audibleVolume=state.volume;
    if(!volumeDragging)$('volume').value=String(state.volume);$('rate').value=String(state.rate);
    $('previous').disabled=!state.queue?.hasPrevious;$('next').disabled=!state.queue?.hasNext;
    const repeat=$('player-loop');if(repeat){repeat.textContent=state.queue?.options?.fullLength===false?'循环当前片段':'循环当前视频';repeat.setAttribute('aria-pressed',String(state.queue?.options?.loop===true));}
    const rotate=$('player-rotate');if(rotate){rotate.textContent='智能旋转';rotate.setAttribute('aria-pressed',String(state.autoRotate===true));rotate.title='仅在更适合当前画面比例时旋转 90°；按媒体库账号记住开关';rotate.hidden=state.rotationAvailable===false;}
    const q=state.queue,reference=q?.options?.reference===true;
    const favorite=q?.options?.origin==='favorite';
    $('back').textContent=favorite?'返回收藏':q?.options?.origin==='frame'?'返回截图':'返回媒体库';
    if(favorite)for(const [id,title]of [['previous','上一项'],['next','下一项']]){$(id).textContent=title;$(id).setAttribute('aria-label',title+'收藏');}
    $('favorite-row').hidden=!favorite;
    if(favorite){const count=q.options.parentTotal,index=q.options.parentIndex;$('favorite-counter').textContent=`${index+1} / ${count}`;if(!favoriteDragging)$('favorite-seek').value=String(count>1?Math.round(index/(count-1)*1000):0);}
    if($('player-favorite')){$('player-favorite').textContent=state.favorite?'取消收藏':'收藏';$('player-favorite').setAttribute('aria-pressed',String(!!state.favorite));}
    if($('player-mark')){$('player-mark').textContent=state.marked?'取消暂存标记':'标记暂存';$('player-mark').setAttribute('aria-pressed',String(!!state.marked));}
    $('queue-row').hidden=!reference;$('segment-row').hidden=!reference;
    if(reference){
      const elapsed=Math.max(0,Math.min(q.segmentLengthMs||0,state.positionMs-(q.segmentStartMs||0)))+(q.elapsedBeforeMs||0);
      if(!queueDragging)$('queue-seek').value=String(Math.round(elapsed/Math.max(1,q.totalMs)*1000));
      $('queue-counter').textContent=`${q.index+1}/${q.total} · ${RHVideoModel.clock(elapsed/1000)} / ${RHVideoModel.clock(q.totalMs/1000)}`;
      $('full-length').checked=q.options.fullLength!==false;
      $('portrait-only').checked=q.options.portraitOnly===true;
      $('portrait-count').textContent=`${q.portraitTotal??0}/${q.sourceTotal??q.total}`;
      if(document.activeElement!==$('segment-length'))$('segment-length').value=String(q.options.segment||3);
      $('segment-length').disabled=q.options.fullLength!==false;
    }
    if(state.presentationError){$('error').dataset.automation='true';$('error').textContent=state.presentationError;}else if(state.seekError){$('error').dataset.automation='true';$('error').textContent='跳转失败：'+state.seekError;}else if(state.automationError){$('error').dataset.automation='true';$('error').textContent='自动播放失败：'+state.automationError.message;}else if($('error').dataset.automation){delete $('error').dataset.automation;$('error').textContent='';}
  }
  api.provideState('player',()=>state);
  async function currentTarget(){if(state.opened&&state.queue?.id)return state;const value=await native('player.state');paint(value);if(!value.opened||!value.queue?.id)throw Error('视频正在准备，请稍候');return value;}
  const register=(name,params,handler)=>api.register('rhvideo.player.'+name,handler,{params,risk:['state','preloadState'].includes(name)?'read':'ui',description:'Native RHVideo player '+name});
  register('state',object(),async()=>{const value=await native('player.state');paint(value);return value;});
  register('control',object({command:{type:'string',enum:['pause','resume','seek','rate','volume','rotate','autoRotate']},value:{type:'number'},enabled:{type:'boolean'},expectedInput:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['command']),async args=>{const value=await native('player.control',args);paint(value);return value;});
  register('options',object({loop:{type:'boolean'},fullLength:{type:'boolean'},segment:{type:'number',minimum:1,maximum:300},super:{type:'boolean'},portraitOnly:{type:'boolean'}}),async args=>{const current=await currentTarget();await native('player.options',{options:args,expectedId:current.queue.id,expectedRevision:current.queue.revision});const value=await native('player.state');paint(value);return value.queue;});
  register('mute',object(),async()=>{const current=await currentTarget();return control({command:'volume',value:current.volume?0:audibleVolume});});
  register('rotate',object(),async()=>{const current=await currentTarget();return control({command:'autoRotate',enabled:!current.autoRotate,expectedInput:current.inputId});});
  register('loop',object(),async()=>{const current=await currentTarget();return api.invoke('rhvideo.player.options',{loop:!current.queue.options?.loop});});
  let favoriteBusy=false;
  register('favorite',object(),async()=>{if(favoriteBusy)throw Error('收藏请求正在处理');favoriteBusy=true;try{const current=await currentTarget();await native('player.favorite',{id:current.queue.id,revision:current.queue.revision});return api.invoke('rhvideo.player.state');}finally{favoriteBusy=false;}});
  register('mark',object(),async()=>{const current=await currentTarget();await native('preview.mark',{id:current.queue.id,kind:'video',title:current.title,expectedInput:current.inputId});return api.invoke('rhvideo.player.state');});
  for(const [name,title]of [['mute','静音'],['rotate','旋转'],['loop','循环当前视频'],['favorite','收藏'],['mark','标记暂存']]){const b=document.createElement('button');b.id='player-'+name;b.dataset.apiAction='rhvideo.player.'+name;b.textContent=title;if(name==='mark')b.title='关闭预览时将已标记源文件移入 RHVideo 的暂存区（不是永久删除）';RHFilesUI.listen(b,'click',()=>api.invoke('rhvideo.player.'+name).catch(error),undefined,'rhvideo.player.'+name);$('playback-actions').append(b);}
  register('fullscreen',object(),()=>native('player.fullscreen'));
  for(const direction of ['next','previous'])register(direction,object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}),async args=>{const result=await native('player.'+direction,args);paint(result);return result;});
  register('preloadState',object(),()=>native('player.preloadState'));
  register('repeatCurrent',object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['expectedId','expectedRevision']),async args=>{const value=await native('player.repeatCurrent',args);paint(value);return value;});
  register('finishSegment',object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['expectedId','expectedRevision']),async args=>{const value=await native('player.finishSegment',args);paint(value);return value;});
  register('preload',object(),()=>native('player.preload'));
  register('close',object(),(_,run)=>native('player.close',run?{_automationRun:run}:{}));
  register('back',object(),(_,run)=>native('player.back',run?{_automationRun:run}:{}));
  register('seekQueue',object({ratio:{type:'number',minimum:0,maximum:1},expectedPlanRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['ratio']),async args=>{const value=await native('player.seekQueue',args);paint(value);return value;});
  register('seekParent',object({ratio:{type:'number',minimum:0,maximum:1},expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1},expectedInput:{type:'integer',minimum:1}},['ratio']),async args=>{const current=await currentTarget();return native('player.seekParent',{expectedId:current.queue.id,expectedRevision:current.queue.revision,expectedInput:current.inputId,...args});});
  let inputBusy=false;
  register('input',object({inputId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},intent:{type:'string',enum:['next','previous','first','last','toggle','close','expand','mark']}},['inputId','intent']),async({inputId,intent},run)=>{
    if(inputBusy)return {ignored:true};inputBusy=true;
    try{
      const current=await native('player.state');paint(current);
      if(!current.opened||!current.queue?.id||current.inputId!==inputId)return {stale:true};
      const guard={expectedInput:inputId,expectedId:current.queue?.id,expectedRevision:current.queue?.revision};
      let result;
      if(['next','previous'].includes(intent))result=await native('player.'+intent,guard);
      else if(intent==='first'||intent==='last'){if(!current.queue?.options?.reference&&current.queue?.options?.origin!=='favorite')return {ignored:true};result=await native(current.queue.options.origin==='favorite'?'player.seekParent':'player.seekQueue',{...guard,ratio:intent==='first'?0:1});}
      else if(intent==='toggle')result=await native('player.control',{expectedInput:inputId,command:toggleCommand(current)});
      else if(intent==='close')return await native('player.close',{expectedInput:inputId,...(run?{_automationRun:run}:{})});
      else if(intent==='expand')return await native('player.fullscreen',{expectedInput:inputId});
      else if(intent==='mark')return await native('preview.mark',{expectedInput:inputId,id:current.queue.id,kind:'video',title:current.title});
      if(result?.opened)paint(result);return result;
    }finally{inputBusy=false;}
  });
  window.__TAURI__.event.listen('rhvideo-native-input',({payload})=>{void api.invoke('rhvideo.player.input',{inputId:payload.inputId,intent:payload.intent}).catch(error);}).catch(error);
  for(const [id,name]of Object.entries({back:'back',toggle:'control',next:'next',previous:'previous',seek:'control',rate:'control',volume:'control',fullscreen:'fullscreen','queue-seek':'seekQueue','favorite-seek':'seekParent','full-length':'options','segment-length':'options','portrait-only':'options'}))$(id).dataset.apiAction='rhvideo.player.'+name;
  api.register('rhvideo.ui.contract',()=>{const ids=new Set(api.list().map(v=>v.id)),controls=[...document.querySelectorAll('button,input,select')].map(n=>({label:n.getAttribute('aria-label')||n.id||n.textContent,action:n.dataset.apiAction}));return {controls:controls.length,missing:controls.filter(v=>!ids.has(v.action)),operations:api.list()};},{params:object(),risk:'read',description:'Native player UI/public API coverage'});
  const control=args=>api.invoke('rhvideo.player.control',{...(Number.isSafeInteger(state.inputId)?{expectedInput:state.inputId}:{}),...args}).catch(error);
  function bindSourceRange(id,command,setLocked,preview,scope='input'){
    const node=$(id);let target=null,active=false,keyHeld=false;
    // Source controls belong to one decoder input. Whole-queue progress instead
    // belongs to one immutable time/ordering plan, even across automatic Next.
    const snapshot=()=>scope==='queue'?{planRevision:state.queue?.planRevision}:scope==='parent'?{inputId:state.inputId,id:state.queue?.id,revision:state.queue?.revision}:{inputId:state.inputId,durationMs:state.durationMs};
    const begin=()=>{target=snapshot();active=true;setLocked(true);};
    RHFilesUI.listen(node,'pointerdown',event=>{if(event.button===0)begin();},undefined,'rhvideo.player.'+id+'.begin');
    RHFilesUI.listen(node,'keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.code)){if(!event.repeat)begin();keyHeld=true;}},undefined,'rhvideo.player.'+id+'.keyboard.begin');
    RHFilesUI.listen(node,'keyup',()=>{keyHeld=false;},undefined,'rhvideo.player.'+id+'.keyboard.end');
    RHFilesUI.listen(node,'input',()=>{if(!active&&!keyHeld)begin();preview?.(target);},undefined,'rhvideo.player.'+id+'.preview');
    RHFilesUI.listen(node,'change',event=>{
      // A standalone public ui.fire(change) is a new automation action. A
      // trusted pointer/key commit retains its original source, including ABA.
      const started=(!active&&!keyHeld&&event?.isTrusted===false?snapshot():target)||snapshot();active=false;setLocked(false);
      if(!started||!Number.isSafeInteger(scope==='queue'?started.planRevision:started.inputId))return error('播放器尚未就绪，拖动未执行');
      if(started.cancelled)return error('拖动已取消，未更改播放');
      if(scope==='queue')void api.invoke('rhvideo.player.seekQueue',{...command(Number(node.value),started),expectedPlanRevision:started.planRevision}).catch(error);
      else if(scope==='parent')return api.invoke('rhvideo.player.seekParent',{...command(Number(node.value),started),expectedId:started.id,expectedRevision:started.revision,expectedInput:started.inputId}).catch(error);
      else void control({...command(Number(node.value),started),expectedInput:started.inputId});
    },undefined,'rhvideo.player.'+id+'.commit');
    RHFilesUI.listen(node,'pointercancel',()=>{if(target)target.cancelled=true;active=false;setLocked(false);},undefined,'rhvideo.player.'+id+'.cancel');
  }
  RHFilesUI.listen($('toggle'),'click',()=>control({command:toggleCommand(state)}),undefined,'rhvideo.player.toggle');
  for(const name of ['next','previous'])RHFilesUI.listen($(name),'click',()=>api.invoke('rhvideo.player.'+name).catch(error),undefined,'rhvideo.player.'+name);
  bindSourceRange('seek',(value,started)=>({command:'seek',value:Math.round(value/1000*started.durationMs)}),locked=>{dragging=locked;},started=>{$('position').textContent=RHVideoModel.clock(Number($('seek').value)/1000*started.durationMs/1000);});
  RHFilesUI.listen($('rate'),'change',()=>control({command:'rate',value:Number($('rate').value)}),undefined,'rhvideo.player.rate');
  bindSourceRange('volume',value=>({command:'volume',value}),locked=>{volumeDragging=locked;});
  RHFilesUI.listen($('fullscreen'),'click',()=>api.invoke('rhvideo.player.fullscreen').catch(error),undefined,'rhvideo.player.fullscreen');
  bindSourceRange('queue-seek',value=>({ratio:value/1000}),locked=>{queueDragging=locked;},undefined,'queue');
  bindSourceRange('favorite-seek',value=>({ratio:value/1000}),locked=>{favoriteDragging=locked;},undefined,'parent');
  RHFilesUI.listen($('full-length'),'change',()=>api.invoke('rhvideo.player.options',{fullLength:$('full-length').checked}).catch(error),undefined,'rhvideo.player.options.fullLength');
  RHFilesUI.listen($('segment-length'),'change',()=>api.invoke('rhvideo.player.options',{segment:Number($('segment-length').value),fullLength:false}).catch(error),undefined,'rhvideo.player.options.segment');
  RHFilesUI.listen($('portrait-only'),'change',()=>api.invoke('rhvideo.player.options',{portraitOnly:$('portrait-only').checked}).catch(value=>{paint(state);error(value);}),undefined,'rhvideo.player.options.portrait');
  RHFilesUI.listen($('back'),'click',()=>api.invoke('rhvideo.player.back').catch(error),undefined,'rhvideo.player.back');
  RHFilesUI.listen(document,'keydown',event=>{
    // Like the reference playlist handler, named navigation follows the key's
    // meaning, not its physical location (notably NumLock and OS-generated keys).
    const key=event.key&&event.key!=='Unidentified'?(event.key===' '?'Space':event.key):event.code;
    if(key==='Escape'){event.preventDefault();void api.invoke('rhvideo.player.close').catch(error);return;}
    if(event.target.matches('input,select,textarea')||event.target.isContentEditable)return;
    let name,args={};
    if(key==='Space'){name='control';args={command:toggleCommand(state)};}
    else if(key==='Delete'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey)name='mark';
    else if(key==='ArrowLeft')name='previous';
    else if(key==='ArrowRight')name='next';
    else if((state.queue?.options?.reference||state.queue?.options?.origin==='favorite')&&['Home','End'].includes(key)){name=state.queue.options.origin==='favorite'?'seekParent':'seekQueue';args={ratio:key==='Home'?0:1};}
    if(!name)return;event.preventDefault();void api.invoke('rhvideo.player.'+name,args).catch(error);
  },undefined,'rhvideo.player.keyboard');
  let wheelAt=0;RHFilesUI.listen(document,'wheel',event=>{if((!state.queue?.options?.reference&&!['frame','favorite'].includes(state.queue?.options?.origin))||event.target.closest('input,select,textarea'))return;event.preventDefault();if(performance.now()-wheelAt<180)return;wheelAt=performance.now();void api.invoke('rhvideo.player.'+(event.deltaY>0?'next':'previous')).catch(error);},{passive:false},'rhvideo.player.wheel');
  RHFilesUI.listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.player.contextmenu');
  async function poll(){
    if(busy||closed)return;busy=true;
    const generation=state.generation;
    try{
      paint(await native('player.state'));
      // Display only. Native progression continues when this WebView's timers
      // are throttled, hidden, suspended, or not yet initialized.
    }catch(e){if(generation===state.generation)error(e);}finally{busy=false;if(!closed)setTimeout(poll,500);}
  }
  // The existing poll owns the sole timer chain. A session event invalidates
  // cached identity, but must not start another recurring loop on every switch.
  window.__TAURI__.event.listen('rhvideo-player-session',({payload})=>{if(Number.isSafeInteger(payload.generation)&&payload.generation>(state.generation||0)){state={opened:false,generation:payload.generation};ready=false;sourceControls(false);$('back').textContent='返回';$('error').textContent='';}}).catch(error);
  // A loaded WebView is not yet an initialized player. Until the first native
  // state arrives, do not offer controls with an unknown source or parent.
  sourceControls(false);
  window.addEventListener('pagehide',()=>{closed=true;ready=false;});void poll();
})();
