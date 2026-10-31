/* Library-owned native PLAYER host. The decoder/queue remain authoritative. */
(() => {
 'use strict';
 window.RHVideoPlayerHost=Object.freeze({install(ctx){
  const {api,rawNative,modalTop,openDialog,notice,intent,canInline}=ctx;
  const dialogId='rhvideo-player-dialog';let current=null,template=null,creating=null,lifecycle=0;
  const object=properties=>({type:'object',properties:properties||{},additionalProperties:false});
  const live=owner=>current===owner&&!owner.closed;
  const top=owner=>live(owner)&&owner.dialog.open&&modalTop()===dialogId&&!document.hidden;
  function fail(owner,stage,error){owner.error=stage+'：'+String(error?.message||error);if(live(owner))notice(owner.error);return error;}
  const scopeArgs=owner=>({...owner.reservation,reason:'close'});
  const guard=owner=>({_hostLease:owner.lease});
  function rect(owner){const r=owner.stage.getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.max(1,r.width),height:Math.max(1,r.height)};}
  function remove(owner){if(owner.closed)return;owner.closed=true;owner.controller?.dispose();owner.observer?.disconnect();owner.dialog.close();owner.dialog.remove();if(current===owner)current=null;}
  async function close(reason='close',expectedPanel){
   const owner=current;if(expectedPanel&&owner?.panel!==expectedPanel)return {closed:false,stale:true};
   if(owner?.closing)return owner.completion;
   lifecycle++;if(!owner)return {closed:!!creating,pending:!!creating};
   owner.closing=true;owner.controller?.suspend();
   if(!owner.reservation){remove(owner);return {closed:true,pending:true};}
   owner.completion=(async()=>{try{const result=await rawNative('player.closeHost',{...scopeArgs(owner),reason});if(live(owner))remove(owner);return result;}
   catch(error){owner.closing=false;if(top(owner))owner.controller?.resume();throw fail(owner,'关闭播放面板失败',error);}})();return owner.completion;
  }
  async function markup(){if(!template)template=fetch('rhvideo-player.html').then(async response=>{if(!response.ok)throw Error('播放器控件读取失败');const root=new DOMParser().parseFromString(await response.text(),'text/html').getElementById('controls');if(!root)throw Error('播放器控件不完整');return root;}).catch(error=>{template=null;throw error;});return template;}
  function create(){
   if(creating?.version===lifecycle)return creating.promise;
   const version=lifecycle,pending={version,promise:null};
   pending.promise=createOwner(version).finally(()=>{if(creating===pending)creating=null;});creating=pending;return pending.promise;
  }
  async function createOwner(version){
   const templateRoot=await markup();if(version!==lifecycle)return null;if(current&&!current.closed)return current;
   const footer=document.importNode(templateRoot,true),panel=crypto.randomUUID(),dialog=document.createElement('dialog'),stage=document.createElement('div'),prefix='library-player-';
   dialog.id=dialogId;dialog.className='rhvideo-native-player';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','视频播放器');stage.className='rhvideo-native-stage';stage.tabIndex=-1;stage.setAttribute('aria-label','原生视频画面');
   for(const node of [footer,...footer.querySelectorAll('[id]')])node.id=prefix+node.id;footer.classList.add('rhvideo-native-controls');dialog.append(stage,footer);document.body.append(dialog);
   const owner={panel,dialog,stage,footer,closed:false,closing:false,lease:null,reservation:null,preparing:null,request:0,covered:false,userRunning:true,latest:null,layoutKey:'',serial:Promise.resolve(),error:'',intent:intent()};current=owner;
   const dismiss=document.createElement('button');dismiss.type='button';dismiss.id=prefix+'close';dismiss.textContent='关闭';dismiss.dataset.apiAction='rhvideo.player.panelClose';dismiss.dataset.playerLifetime='true';footer.querySelector('.player-title').append(dismiss);
   RHFilesUI.listen(dismiss,'click',()=>{if(!live(owner))return {stale:true};const value=api.invoke('rhvideo.player.panelClose',{expectedPanel:panel});void value.catch(notice);return value;},undefined,'rhvideo.nativeHost.close');
   dialog.addEventListener('cancel',event=>{event.preventDefault();if(live(owner))void close('close',panel).catch(notice);});
   owner.controller=RHVideoPlayerControls.install({api,root:dialog,idPrefix:prefix,actionPrefix:'rhvideo.inlinePlayer.',standalone:false,active:false,isTop:()=>top(owner),nativeRequest:(action,args)=>request(action,args,owner),onClosed:()=>remove(owner),listenEvent:(name,handler)=>window.__TAURI__.event.listen(name,event=>{if(name==='rhvideo-native-input'&&event.payload.hostLease!==owner.lease)return;if(live(owner))handler(event);})});
   owner.observer=new ResizeObserver(()=>{owner.layoutKey='';if(live(owner))void sync().catch(error=>fail(owner,'播放区域调整失败',error));});owner.observer.observe(stage);
   openDialog(dialogId);stage.focus({preventScroll:true});return owner;
  }
  async function bounds(owner,state,visible){
   if(!live(owner)||!owner.lease||!state?.inputId)return;
   const region=rect(owner),opacity=state.restoringPausedFrame||(!state.renderedFrames&&state.freshSurfaceInput!==true)?0:1,key=JSON.stringify([state.inputId,region,visible,opacity]);if(owner.layoutKey===key)return;
   await rawNative('player.bounds',{...guard(owner),expectedInput:state.inputId,...region,visible,opacity});if(live(owner)&&owner.latest?.inputId===state.inputId)owner.layoutKey=key;
  }
  async function synchronize(owner){
   if(!live(owner)||owner.closing||!owner.lease||!owner.latest?.opened)return;
   const showing=top(owner);if(!showing){
    if(!owner.covered){owner.covered=true;owner.userRunning=!(owner.latest.pauseRequested??owner.latest.state===4)&&owner.latest.state!==6;owner.controller.suspend();await bounds(owner,owner.latest,false);if(!live(owner))return;owner.latest=await rawNative('player.control',{...guard(owner),expectedInput:owner.latest.inputId,command:'pause'});}
    return;
   }
   if(owner.covered){owner.covered=false;if(owner.userRunning)owner.latest=await rawNative('player.control',{...guard(owner),expectedInput:owner.latest.inputId,command:'resume'});if(!live(owner)||!top(owner))return;owner.controller.resume();}
   // A natively certified unused canvas has no stale input to hide; do not
   // delay its first picture until coarse VLC statistics update. Reused
   // surfaces and paused restoration still keep the alpha-zero protection.
   await bounds(owner,owner.latest,true);
  }
  function sync(){const owner=current;if(!owner)return Promise.resolve({opened:false});const previous=owner.serial.catch(()=>{});const result=previous.then(()=>synchronize(owner));owner.serial=result;return result;}
  function ordered(owner,run,stale={stale:true}){
   // This serializes new requests, not retries: a later source or parent
   // cleanup cannot overtake an earlier native acknowledgement in this scope.
   const result=(owner.commands||Promise.resolve()).catch(()=>{}).then(()=>live(owner)&&!owner.closing?run():stale);owner.commands=result;return result;
  }
  function prepare(owner){
   if(owner.reservation)return Promise.resolve(owner.reservation);if(owner.preparing)return owner.preparing;
   owner.preparing=(async()=>{const [context,fullscreen]=await Promise.all([rawNative('player.hostContext'),window.__TAURI__.window.getCurrentWindow().isFullscreen()]);if(!live(owner)||owner.closing)return null;
    owner.dialog.classList.toggle('is-fullscreen',fullscreen);owner.layoutKey='';
    const reservation=await rawNative('player.hostPrepare',{window:context.window,panel:owner.panel});owner.reservation=reservation;
    if(!live(owner)||owner.closing){await rawNative('player.closeHost',{...reservation,reason:'close'});return null;}return reservation;
   })().finally(()=>{owner.preparing=null;});return owner.preparing;
  }
  async function play(args){
   if(!canInline())return rawNative('play',args);
   const requested=intent();if(current?.closing)await current.completion;if(requested!==intent())return {stale:true};
   const owner=current||await create();if(!owner||!live(owner)||requested!==intent())return {stale:true};
   const ticket=++owner.request;owner.intent=requested;owner.controller.suspend({preserveGestures:true});owner.layoutKey='';
   try{
    // Reserve ordering before preparation awaits; old-parent cleanup must not
    // slip between acceptance of a replacement and its native admission.
    const value=await ordered(owner,async()=>{
     if(!await prepare(owner)||ticket!==owner.request||!live(owner)||requested!==intent())return {stale:true};
     return rawNative('play',{...args,host:{kind:'library',...owner.reservation,bounds:rect(owner)}});
    });
    if(value?.stale){if(live(owner)&&ticket===owner.request&&requested!==intent()&&!owner.closing)await close('back',owner.panel);return value;}
    if(!live(owner)||ticket!==owner.request)return {...value,stale:true};
    if(requested!==intent()){await close('back',owner.panel);return {...value,stale:true};}
    if(value.host?.kind!=='library'||value.host.owner!==owner.reservation.owner||value.host.panel!==owner.panel)throw Error('原生播放返回了不同的面板身份');
    owner.lease=value.host.lease;owner.latest=value;owner.userRunning=!(value.pauseRequested??value.state===4);owner.covered=false;
    if(top(owner))owner.controller.resume();await sync();return value;
   }catch(error){if(live(owner)&&ticket===owner.request){fail(owner,'打开视频失败',error);try{await close('close',owner.panel);}catch{}}throw error;}
  }
  async function request(action,args={},expectedOwner){
   if(action==='play')return play(args);
   const owner=expectedOwner||current;
   if(!owner||!live(owner))return expectedOwner?Promise.reject(Error('播放面板已关闭')):rawNative(action,args);
   if(['player.close','player.back'].includes(action))return close(action==='player.back'?'back':'close',owner.panel);
   const scoped=action.startsWith('player.')||action==='preview.mark';if(!scoped)return rawNative(action,args);
   // Parent cleanup has exact native preview/playback IDs. Keep it ordered
   // behind an accepted replacement even before its input lease is known.
   if(action==='player.closeParent')return ordered(owner,()=>rawNative(action,owner.lease?{...args,...guard(owner)}:args),{closed:false,stale:true});
   if(!owner.lease){if(action==='player.state')return {opened:false};throw Error('原生播放正在准备');}
   if((owner.covered||!top(owner))&&action==='player.control'&&args.command==='resume')throw Error('播放面板被覆盖，尚未恢复播放');
   if(action==='player.fullscreen')return ordered(owner,async()=>{
    const value=await rawNative(action,{...args,...guard(owner)});
    if(live(owner)&&typeof value?.fullscreen==='boolean'){owner.dialog.classList.toggle('is-fullscreen',value.fullscreen);owner.layoutKey='';await sync();}
    return value;
   });
   const value=await rawNative(action,{...args,...guard(owner)});
   if(value?.opened&&value.host?.lease!==owner.lease)throw Error('原生播放面板已改变，旧回复未接管界面');
   if(live(owner)&&value?.opened){owner.latest=value;if(!owner.covered)owner.userRunning=!(value.pauseRequested??value.state===4)&&value.state!==6;await sync();}
   return value;
  }
  api.register('rhvideo.player.hostState',()=>({opened:!!current,panel:current?.panel??null,host:current?.latest?.host??null,pending:!!current&&!current.lease,covered:current?.covered??false,error:current?.error||''}),{params:object(),risk:'read'});
  api.register('rhvideo.player.panelClose',({expectedPanel}={})=>close('close',expectedPanel),{params:object({expectedPanel:{type:'string',maxLength:128}}),risk:'ui'});
  window.__TAURI__.event.listen('rhvideo-player-closed',({payload})=>{const owner=current;if(owner&&payload.host?.owner===owner.reservation?.owner&&(!owner.lease||payload.host.lease===owner.lease))remove(owner);}).catch(notice);
  document.addEventListener('visibilitychange',()=>{void sync().catch(notice);});
  window.addEventListener('pagehide',()=>{if(current)remove(current);});
  return Object.freeze({request,sync,close,opened:()=>!!current,isTop:()=>!!current&&top(current),reset:()=>{lifecycle++;if(current)remove(current);}});
 }});
})();
