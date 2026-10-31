(() => {
  'use strict';
  window.RHVideoPlayerControls=Object.freeze({install(options={}){
  const registry=options.api||window.RHFilesAPI,root=options.root||document,idPrefix=options.idPrefix||'',actionPrefix=options.actionPrefix||'rhvideo.player.',standalone=options.standalone??actionPrefix==='rhvideo.player.';
  if(!/^[A-Za-z0-9_-]{0,64}$/.test(idPrefix)||!/^[A-Za-z][A-Za-z0-9_.-]{0,150}\.$/.test(actionPrefix))throw Error('播放器作用域无效');
  if(standalone&&actionPrefix!=='rhvideo.player.')throw Error('独立播放器窗口必须使用标准接口作用域');
  const model=options.model||globalThis.RHVideoModel,phase=options.playbackPhase||globalThis.RHVideoPlaybackPhase;
  if(typeof model?.clock!=='function'||typeof phase?.describe!=='function')throw Error('播放器依赖尚未载入');
  const $=options.lookup||(id=>root===document?document.getElementById(idPrefix+id):root.querySelector('[id="'+idPrefix+id+'"]'));
  for(const id of ['controls','back','title','status','error','queue-row','queue-seek','queue-counter','favorite-row','favorite-seek','favorite-counter','playback-actions','previous','toggle','next','position','seek','duration','rate','volume','fullscreen','segment-row','full-length','segment-length','portrait-only','portrait-count'])if(!$(id))throw Error('播放器控件尚未载入：'+id);
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false}),disposers=[],gestureCancels=[],cleanupErrors=[];
  const actionId=id=>id.startsWith('rhvideo.player.')?actionPrefix+id.slice('rhvideo.player.'.length):id==='rhvideo.ui.contract'&&actionPrefix!=='rhvideo.player.'?actionPrefix+'contract':id;
  const remember=remove=>{if(typeof remove==='function')disposers.push(remove);return remove;};
  function recordCleanupError(value){if(cleanupErrors.length<16)cleanupErrors.push(String(value?.message||value).slice(0,512));}
  function releaseBindings(){for(const remove of disposers.splice(0).reverse()){try{const pending=remove();pending?.catch?.(recordCleanupError);}catch(error){recordCleanupError(error);}}}
  const api={register:(id,handler,spec)=>remember(registry.register(actionId(id),(args,run)=>{if(closed)throw Error('播放器控件已关闭，旧操作未执行');if((!active||options.isTop?.()===false)&&!['rhvideo.player.state','rhvideo.player.preloadState','rhvideo.player.close','rhvideo.player.back','rhvideo.ui.contract'].includes(id))throw Error('播放器控件当前未激活，操作未执行');return handler(args,run);},spec)),invoke:(id,args)=>registry.invoke(actionId(id),args),list:()=>registry.list(),provideState:(name,read)=>remember(registry.provideState(name==='player'?(options.stateName||(actionPrefix==='rhvideo.player.'?'player':actionPrefix.slice(0,-1))):name,read))};
  let state={opened:false},ready=false,busy=false,dragging=false,volumeDragging=false,queueDragging=false,favoriteDragging=false,closed=false,active=options.active!==false,pollTimer=null,activityEpoch=0;
  const rawNative=options.nativeRequest||((action,args)=>window.__TAURI__.core.invoke('rhvideo_request',{action,args}));
  let standaloneHost=null;
  const native=(action,args={})=>{
    if(closed)return Promise.reject(Error('播放器控件已关闭，旧操作未执行'));
    if((!active||options.isTop?.()===false)&&!['player.state','player.preloadState','player.close','player.back'].includes(action))return Promise.reject(Error('播放器控件当前未激活，操作未执行'));
    if(standalone&&standaloneHost)args={...args,_hostLease:standaloneHost};
    if(standalone&&!standaloneHost&&!['player.state','player.preloadState'].includes(action))return Promise.reject(Error('播放器宿主尚未就绪'));
    let pending;try{pending=rawNative(action,state.generation?{...args,_sessionGeneration:state.generation}:args);}catch(error){return Promise.reject(error);}
    return Promise.resolve(pending).then(async value=>{
      if(standalone&&value?.opened){if(value.host?.kind!=='popup'||!Number.isSafeInteger(value.host.lease)||standaloneHost&&standaloneHost!==value.host.lease)throw Error('独立播放器宿主已改变，旧窗口未接管播放');standaloneHost=value.host.lease;}
      if(!closed&&(action==='player.close'||action==='player.back')&&value?.closed)await options.onClosed?.(value);
      return value;
    });
  };
  try{
  if(standalone){
    registry.provideRunLookup(query=>window.__TAURI__.core.invoke('automation_receipt',{query}));
    registry.provideRunTransport(()=>window.__TAURI__.core.invoke('automation_receipt_transport'));
    api.provideState('application',()=>({platform:'windows',window:'window-rhvideo-player',ready}));
  }
  function listen(node,type,handler,settings,site){
    const guarded=event=>closed||!active||options.isTop?.()===false?{ignored:true}:handler(event);
    RHFilesUI.listen(node,type,guarded,settings,site?.replace('rhvideo.player.',actionPrefix));
    remember(()=>RHFilesUI.remove?.(node,type,guarded,settings));
  }
  function subscribe(name,handler){
    const receive=options.listenEvent||((name,fn)=>window.__TAURI__.event.listen(name,fn));
    let pending;try{pending=receive(name,event=>{if(!closed)handler(event);});}catch(value){error(value);return;}
    Promise.resolve(pending).then(remove=>{if(typeof remove!=='function')return;if(closed)return remove();remember(remove);}).catch(value=>{if(closed)recordCleanupError(value);else error(value);});
  }
  function error(value){if(closed)return;delete $('error').dataset.automation;$('error').textContent=String(value?.message||value);}
  // Observe failures for physical UI events without replacing the action's
  // promise: ui.invoke/ui.set must still await and receive the same failure.
  function observeAction(action){action.catch(error);return action;}
  let audibleVolume=100;
  function paused(value){return value.pauseRequested??(value.state===4);}
  function toggleCommand(value){return value.state===6||paused(value)?'resume':'pause';}
  function sourceControls(enabled){for(const node of root.querySelectorAll('button,input,select'))if(node!==$('back')&&node.dataset.playerLifetime!=='true')node.disabled=!enabled;}
  function paint(value){
    if(closed)return;
    const generation=value.generation??state.generation;if(generation&&state.generation&&generation<state.generation)return;
    sourceControls(active&&options.isTop?.()!==false&&value.opened&&value.queue?.id);
    state={...value,generation};ready=true;const presentation=phase.describe(state);$('status').textContent=presentation.label;$('status').dataset.phase=presentation.phase;if(!state.opened)return;
    $('title').textContent=state.title;$('position').textContent=model.clock(state.positionMs/1000);$('duration').textContent=model.clock(state.durationMs/1000);
    if(!dragging)$('seek').value=state.durationMs>0?Math.round(state.positionMs/state.durationMs*1000):0;
    $('toggle').textContent=state.state===6?'重新播放':paused(state)?'继续':'暂停';
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
      $('queue-counter').textContent=`${q.index+1}/${q.total} · ${model.clock(elapsed/1000)} / ${model.clock(q.totalMs/1000)}`;
      $('full-length').checked=q.options.fullLength!==false;
      $('portrait-only').checked=q.options.portraitOnly===true;
      $('portrait-count').textContent=`${q.portraitTotal??0}/${q.sourceTotal??q.total}`;
      if(document.activeElement!==$('segment-length'))$('segment-length').value=String(q.options.segment||3);
      $('segment-length').disabled=q.options.fullLength!==false;
    }
    if(state.presentationError){$('error').dataset.automation='true';$('error').textContent=state.presentationError;}else if(state.seekError){$('error').dataset.automation='true';$('error').textContent='跳转失败：'+state.seekError;}else if(state.automationError){$('error').dataset.automation='true';$('error').textContent='自动播放失败：'+state.automationError.message;}else if($('error').dataset.automation){delete $('error').dataset.automation;$('error').textContent='';}
    if(!active||options.isTop?.()===false)sourceControls(false);
  }
  api.provideState('player',()=>({...state,playback:phase.describe(state)}));
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
  for(const [name,title]of [['mute','静音'],['rotate','旋转'],['loop','循环当前视频'],['favorite','收藏'],['mark','标记暂存']]){const b=document.createElement('button');b.id=idPrefix+'player-'+name;b.dataset.apiAction=actionId('rhvideo.player.'+name);b.textContent=title;if(name==='mark')b.title='关闭预览时将已标记源文件移入 RHVideo 的暂存区（不是永久删除）';listen(b,'click',()=>observeAction(api.invoke('rhvideo.player.'+name)),undefined,'rhvideo.player.'+name);$('playback-actions').append(b);}
  register('fullscreen',object(),()=>native('player.fullscreen'));
  for(const direction of ['next','previous'])register(direction,object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}),async args=>{const result=await native('player.'+direction,args);paint(result);return result;});
  register('preloadState',object(),()=>native('player.preloadState'));
  register('repeatCurrent',object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['expectedId','expectedRevision']),async args=>{const value=await native('player.repeatCurrent',args);paint(value);return value;});
  register('finishSegment',object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},['expectedId','expectedRevision']),async args=>{const value=await native('player.finishSegment',args);paint(value);return value;});
  register('preload',object(),()=>native('player.preload'));
  // The standalone window retires its own JS registry and needs a native
  // receipt. An in-place component leaves the library's registry alive.
  register('close',object(),(_,run)=>native('player.close',run&&standalone?{_automationRun:run}:{}));
  register('back',object(),(_,run)=>native('player.back',run&&standalone?{_automationRun:run}:{}));
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
      else if(intent==='close')return await native('player.close',{expectedInput:inputId,...(run&&standalone?{_automationRun:run}:{})});
      else if(intent==='expand')return await native('player.fullscreen',{expectedInput:inputId});
      else if(intent==='mark')return await native('preview.mark',{expectedInput:inputId,id:current.queue.id,kind:'video',title:current.title});
      if(result?.opened)paint(result);return result;
    }finally{inputBusy=false;}
  });
  subscribe('rhvideo-native-input',({payload})=>{if(active&&options.isTop?.()!==false)void api.invoke('rhvideo.player.input',{inputId:payload.inputId,intent:payload.intent}).catch(error);});
  for(const [id,name]of Object.entries({back:'back',toggle:'control',next:'next',previous:'previous',seek:'control',rate:'control',volume:'control',fullscreen:'fullscreen','queue-seek':'seekQueue','favorite-seek':'seekParent','full-length':'options','segment-length':'options','portrait-only':'options'}))$(id).dataset.apiAction=actionId('rhvideo.player.'+name);
  api.register('rhvideo.ui.contract',()=>{const ids=new Set(api.list().map(v=>v.id)),controls=[...root.querySelectorAll('button,input,select')].map(n=>({label:n.getAttribute('aria-label')||n.id||n.textContent,action:n.dataset.apiAction}));return {controls:controls.length,missing:controls.filter(v=>!ids.has(v.action)),operations:api.list()};},{params:object(),risk:'read',description:'Native player UI/public API coverage'});
  const control=args=>api.invoke('rhvideo.player.control',{...(Number.isSafeInteger(state.inputId)?{expectedInput:state.inputId}:{}),...args});
  function bindSourceRange(id,command,setLocked,preview,scope='input'){
    const node=$(id);let target=null,active=false,keyHeld=false;
    // Source controls belong to one decoder input. Whole-queue progress instead
    // belongs to one immutable time/ordering plan, even across automatic Next.
    const snapshot=()=>scope==='queue'?{planRevision:state.queue?.planRevision}:scope==='parent'?{inputId:state.inputId,id:state.queue?.id,revision:state.queue?.revision}:{inputId:state.inputId,durationMs:state.durationMs};
    const begin=()=>{target=snapshot();active=true;setLocked(true);};
    listen(node,'pointerdown',event=>{if(event.button===0)begin();},undefined,'rhvideo.player.'+id+'.begin');
    listen(node,'keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.code)){if(!event.repeat)begin();keyHeld=true;}},undefined,'rhvideo.player.'+id+'.keyboard.begin');
    listen(node,'keyup',()=>{keyHeld=false;},undefined,'rhvideo.player.'+id+'.keyboard.end');
    listen(node,'input',()=>{if(!active&&!keyHeld)begin();preview?.(target);},undefined,'rhvideo.player.'+id+'.preview');
    listen(node,'change',event=>{
      // A standalone public ui.invoke(change) is a new automation action. A
      // trusted pointer/key commit retains its original source, including ABA.
      const started=(!active&&!keyHeld&&event?.isTrusted===false?snapshot():target)||snapshot();active=false;setLocked(false);
      if(!started||!Number.isSafeInteger(scope==='queue'?started.planRevision:started.inputId))return observeAction(Promise.reject(Error('播放器尚未就绪，拖动未执行')));
      if(started.cancelled)return observeAction(Promise.reject(Error('拖动已取消，未更改播放')));
      if(scope==='queue')return observeAction(api.invoke('rhvideo.player.seekQueue',{...command(Number(node.value),started),expectedPlanRevision:started.planRevision}));
      if(scope==='parent')return observeAction(api.invoke('rhvideo.player.seekParent',{...command(Number(node.value),started),expectedId:started.id,expectedRevision:started.revision,expectedInput:started.inputId}));
      return observeAction(control({...command(Number(node.value),started),expectedInput:started.inputId}));
    },undefined,'rhvideo.player.'+id+'.commit');
    const cancel=()=>{if(target)target.cancelled=true;active=false;setLocked(false);};gestureCancels.push(cancel);
    listen(node,'pointercancel',cancel,undefined,'rhvideo.player.'+id+'.cancel');
  }
  listen($('toggle'),'click',()=>observeAction(control({command:toggleCommand(state)})),undefined,'rhvideo.player.toggle');
  for(const name of ['next','previous'])listen($(name),'click',()=>observeAction(api.invoke('rhvideo.player.'+name)),undefined,'rhvideo.player.'+name);
  bindSourceRange('seek',(value,started)=>({command:'seek',value:Math.round(value/1000*started.durationMs)}),locked=>{dragging=locked;},started=>{$('position').textContent=model.clock(Number($('seek').value)/1000*started.durationMs/1000);});
  listen($('rate'),'change',()=>observeAction(control({command:'rate',value:Number($('rate').value)})),undefined,'rhvideo.player.rate');
  bindSourceRange('volume',value=>({command:'volume',value}),locked=>{volumeDragging=locked;});
  listen($('fullscreen'),'click',()=>observeAction(api.invoke('rhvideo.player.fullscreen')),undefined,'rhvideo.player.fullscreen');
  bindSourceRange('queue-seek',value=>({ratio:value/1000}),locked=>{queueDragging=locked;},undefined,'queue');
  bindSourceRange('favorite-seek',value=>({ratio:value/1000}),locked=>{favoriteDragging=locked;},undefined,'parent');
  listen($('full-length'),'change',()=>observeAction(api.invoke('rhvideo.player.options',{fullLength:$('full-length').checked})),undefined,'rhvideo.player.options.fullLength');
  listen($('segment-length'),'change',()=>observeAction(api.invoke('rhvideo.player.options',{segment:Number($('segment-length').value),fullLength:false})),undefined,'rhvideo.player.options.segment');
  listen($('portrait-only'),'change',()=>{const action=api.invoke('rhvideo.player.options',{portraitOnly:$('portrait-only').checked});action.catch(value=>{paint(state);error(value);});return action;},undefined,'rhvideo.player.options.portrait');
  listen($('back'),'click',()=>observeAction(api.invoke('rhvideo.player.back')),undefined,'rhvideo.player.back');
  listen(document,'keydown',event=>{
    // Like the reference playlist handler, named navigation follows the key's
    // meaning, not its physical location (notably NumLock and OS-generated keys).
    const key=event.key&&event.key!=='Unidentified'?(event.key===' '?'Space':event.key):event.code;
    if(key==='Escape'){event.preventDefault();return observeAction(api.invoke('rhvideo.player.close'));}
    if(event.target.matches('input,select,textarea')||event.target.isContentEditable)return;
    let name,args={};
    if(key==='Space'){name='control';args={command:toggleCommand(state)};}
    else if(key==='Delete'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey)name='mark';
    else if(key==='ArrowLeft')name='previous';
    else if(key==='ArrowRight')name='next';
    else if((state.queue?.options?.reference||state.queue?.options?.origin==='favorite')&&['Home','End'].includes(key)){name=state.queue.options.origin==='favorite'?'seekParent':'seekQueue';args={ratio:key==='Home'?0:1};}
    if(!name)return;event.preventDefault();return observeAction(api.invoke('rhvideo.player.'+name,args));
  },undefined,'rhvideo.player.keyboard');
  let wheelAt=0;listen(document,'wheel',event=>{if((!state.queue?.options?.reference&&!['frame','favorite'].includes(state.queue?.options?.origin))||event.target.closest('input,select,textarea'))return;event.preventDefault();if(performance.now()-wheelAt<180)return;wheelAt=performance.now();return observeAction(api.invoke('rhvideo.player.'+(event.deltaY>0?'next':'previous')));},{passive:false},'rhvideo.player.wheel');
  listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.player.contextmenu');
  async function poll(){
    if(busy||closed||!active||options.isTop?.()===false)return;busy=true;
    const generation=state.generation,epoch=activityEpoch;
    try{
      const value=await native('player.state');if(!closed&&active&&epoch===activityEpoch)paint(value);
      // Display only. Native progression continues when this WebView's timers
      // are throttled, hidden, suspended, or not yet initialized.
    }catch(e){if(!closed&&active&&epoch===activityEpoch&&generation===state.generation)error(e);}finally{busy=false;if(!closed&&active)pollTimer=setTimeout(()=>{pollTimer=null;void poll();},500);}
  }
  // The existing poll owns the sole timer chain. A session event invalidates
  // cached identity, but must not start another recurring loop on every switch.
  subscribe('rhvideo-player-session',({payload})=>{if(Number.isSafeInteger(payload.generation)&&payload.generation>(state.generation||0)){state={opened:false,generation:payload.generation};ready=false;sourceControls(false);$('back').textContent='返回';$('error').textContent='';}});
  // A loaded WebView is not yet an initialized player. Until the first native
  // state arrives, do not offer controls with an unknown source or parent.
  sourceControls(false);
  function suspend({preserveGestures=false}={}){active=false;activityEpoch++;if(pollTimer!==null){clearTimeout(pollTimer);pollTimer=null;}if(!preserveGestures)for(const cancel of gestureCancels)cancel();sourceControls(false);return {active:false};}
  function resume(){if(closed)throw Error('播放器控件已关闭');if(active&&(busy||pollTimer!==null))return {active:true};active=true;void poll();return {active:true};}
  function dispose(){if(closed)return {disposed:true};suspend();closed=true;ready=false;gestureCancels.length=0;releaseBindings();return {disposed:true};}
  window.addEventListener('pagehide',dispose);remember(()=>window.removeEventListener?.('pagehide',dispose));if(active)void poll();
  return Object.freeze({suspend,resume,dispose,refresh:()=>api.invoke('rhvideo.player.state'),snapshot:()=>JSON.parse(JSON.stringify({state,ready,active,closed,busy,timerPending:pollTimer!==null,cleanupErrors}))});
  }catch(error){closed=true;active=false;if(pollTimer!==null)clearTimeout(pollTimer);gestureCancels.length=0;releaseBindings();throw error;}
  }});
})();
