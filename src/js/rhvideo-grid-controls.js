(() => {
  'use strict';
  window.RHVideoGridControls=Object.freeze({install(options={}){
    const registry=options.api||window.RHFilesAPI,root=options.root||document,idPrefix=options.idPrefix||'',actionPrefix=options.actionPrefix||'rhvideo.grid.',standalone=options.standalone??actionPrefix==='rhvideo.grid.';
    if(!/^[A-Za-z0-9_-]{0,64}$/.test(idPrefix)||!/^[A-Za-z][A-Za-z0-9_.-]{0,150}\.$/.test(actionPrefix))throw Error('同屏控件作用域无效');
    if(standalone&&actionPrefix!=='rhvideo.grid.')throw Error('独立同屏窗口必须使用标准接口作用域');
    const phase=options.playbackPhase||globalThis.RHVideoPlaybackPhase;
    if(typeof phase?.describe!=='function')throw Error('同屏播放器依赖尚未载入');
    const $=options.lookup||(id=>root===document?document.getElementById(idPrefix+id):root.querySelector('[id="'+idPrefix+id+'"]'));
    for(const id of ['controls','error','target','previous','next','pause','resume','mute','expand','restore','favorite','mark','seek','volume','rate','group-seek','group-position','summary'])if(!$(id))throw Error('同屏控件尚未载入：'+id);
    const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false}),disposers=[],gestures=new Map(),cleanupErrors=[];
    let state={cells:[]},closed=false,active=options.active!==false,busy=false,pollTimer=null,activityEpoch=0,standaloneLease=null,mutationBusy=false,inputBusy=false;
    const actionId=id=>id.startsWith('rhvideo.grid.')?actionPrefix+id.slice('rhvideo.grid.'.length):id==='rhvideo.ui.contract'&&actionPrefix!=='rhvideo.grid.'?actionPrefix+'contract':id;
    const remember=remove=>{if(typeof remove==='function')disposers.push(remove);return remove;},recordCleanupError=e=>{if(cleanupErrors.length<16)cleanupErrors.push(String(e?.message||e).slice(0,512));};
    const allowedInactive=new Set(['rhvideo.grid.state','rhvideo.grid.close','rhvideo.ui.contract']);
    const api={register:(id,handler,spec)=>remember(registry.register(actionId(id),(args,run)=>{
      if(closed)throw Error('同屏控件已关闭，旧操作未执行');
      if((!active||options.isTop?.()===false)&&!allowedInactive.has(id))throw Error('同屏控件当前未激活，操作未执行');
      return handler(args,run);
    },spec)),invoke:(id,args)=>registry.invoke(actionId(id),args),list:()=>registry.list(),provideState:(name,read)=>remember(registry.provideState(name==='grid'?(options.stateName||(actionPrefix==='rhvideo.grid.'?'grid':actionPrefix.slice(0,-1))):name,read))};
    const rawNative=options.nativeRequest||((action,args)=>window.__TAURI__.core.invoke('rhvideo_request',{action,args}));
    const native=(action,args={})=>{
      if(closed)return Promise.reject(Error('同屏控件已关闭，旧操作未执行'));
      if((!active||options.isTop?.()===false)&&!['grid.state','grid.close'].includes(action))return Promise.reject(Error('同屏控件当前未激活，操作未执行'));
      if(standalone&&!standaloneLease&&action!=='grid.state')return Promise.reject(Error('同屏宿主尚未就绪'));
      let pending;try{pending=rawNative(action,state.generation?{...args,_sessionGeneration:state.generation}:args);}catch(error){return Promise.reject(error);}
      return Promise.resolve(pending).then(async value=>{
        if(standalone&&Number.isSafeInteger(value?.windowLease)&&value.windowLease>0){if(standaloneLease&&standaloneLease!==value.windowLease)throw Error('同屏宿主已改变，旧窗口未接管播放');standaloneLease=value.windowLease;}
        if(!closed&&action==='grid.close'&&value?.closed)await options.onClosed?.(value);
        return value;
      });
    };
    function releaseBindings(){for(const remove of disposers.splice(0).reverse())try{remove()?.catch?.(recordCleanupError);}catch(e){recordCleanupError(e);}}
    function error(value){if(!closed)$('error').textContent=String(value?.message||value);}
    function observeAction(pending){pending.catch(error);return pending;}
    function listen(node,type,handler,settings,site){const guarded=event=>closed||!active||options.isTop?.()===false?{ignored:true}:handler(event);RHFilesUI.listen(node,type,guarded,settings,site?.replace('rhvideo.grid.',actionPrefix));remember(()=>RHFilesUI.remove?.(node,type,guarded,settings));}
    function subscribe(name,handler){const receive=options.listenEvent||((name,fn)=>window.__TAURI__.event.listen(name,fn));let pending;try{pending=receive(name,event=>{if(!closed)return handler(event);});}catch(e){error(e);return;}Promise.resolve(pending).then(remove=>{if(typeof remove!=='function')return;if(closed)return remove();remember(remove);}).catch(e=>closed?recordCleanupError(e):error(e));}
    const register=(name,params,handler)=>api.register('rhvideo.grid.'+name,handler,{params,description:'RHVideo native multi-video '+name});
    const guardSchema={expectedInput:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},inputTarget:{type:'integer',minimum:0,maximum:8},expectedInputs:{type:'array',minItems:1,maxItems:9,items:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}};
    function capture(target=Number($('target').value)){
      if(!state.cells.length||state.cells.some(v=>!Number.isSafeInteger(v.inputId)||v.inputId<=0)||!Number.isInteger(target)||target< -1||target>=state.cells.length)throw Error('同屏播放器尚未就绪');
      return {target,cells:state.cells.map((v,index)=>({index,inputId:v.inputId,durationMs:v.durationMs})),...(target<0?{expectedInputs:state.cells.map(v=>v.inputId)}:{expectedInput:state.cells[target].inputId,inputTarget:target})};
    }
    function guard(snapshot){return snapshot.expectedInputs?{expectedInputs:[...snapshot.expectedInputs]}:{expectedInput:snapshot.expectedInput,inputTarget:snapshot.inputTarget};}
    function guardArgs(args,target=args.target??-1){return args.expectedInput!==undefined||args.expectedInputs!==undefined?args:{...guard(capture(target)),...args};}
    function checkSeen(args){
      if(args.expectedInputs&&(args.expectedInputs.length!==state.cells.length||args.expectedInputs.some((v,i)=>v!==state.cells[i]?.inputId)))throw Error('同屏输入已改变，旧操作未执行');
      if(args.expectedInput!==undefined&&state.cells[args.inputTarget]?.inputId!==args.expectedInput)throw Error('同屏输入已改变，旧操作未执行');
    }
    function paused(value){return value.pauseRequested??value.state===4;}
    function toggleCommand(value){return value.cells.every(v=>!paused(v)&&![5,6,7].includes(v.state))?'pause':'resume';}
    function locked(id){const g=gestures.get(id);return !!g&&(g.active||g.keyHeld);}
    function sourceControls(enabled){for(const node of root.querySelectorAll('button,input,select'))node.disabled=!enabled;}
    function paint(value){
      if(closed)return;
      const generation=value.generation??state.generation;if(generation&&state.generation&&generation<state.generation)return;
      const latest=cells=>Math.max(0,...cells.map(v=>v.inputId||0));if(generation===state.generation&&latest(value.cells||[])>0&&latest(value.cells||[])<latest(state.cells))return;
      state={...value,generation,cells:Array.isArray(value.cells)?value.cells:[]};const enabled=active&&options.isTop?.()!==false&&state.cells.length>0;sourceControls(enabled);
      const count=Math.max(1,state.count||1),groups=state.groupTotal??Math.max(1,Math.ceil((state.total||0)/count)),group=state.groupIndex??Math.floor((state.offset||0)/count);
      if(!locked('group-seek'))$('group-seek').value=String(groups>1?Math.round(group/(groups-1)*1000):0);$('group-seek').disabled=!enabled||groups<=1;$('group-position').textContent='第 '+(group+1)+'/'+groups+' 组';
      const selected=$('target').value,signature=JSON.stringify(state.cells.map(v=>[v.id,v.title]));if($('target').dataset.ids!==signature){$('target').replaceChildren(new Option('全部视频','-1'));state.cells.forEach((v,i)=>$('target').append(new Option(i+1+' · '+v.title,String(i))));$('target').value=Number(selected)>= -1&&Number(selected)<state.cells.length?selected:'-1';$('target').dataset.ids=signature;}
      const target=Number($('target').value),cells=target<0?state.cells:state.cells.slice(target,target+1);$('mute').setAttribute('aria-pressed',String(cells.length>0&&cells.every(v=>v.muted||v.volume===0)));
      for(const [name,field,yes,no]of [['favorite','favorite','取消收藏','收藏'],['mark','marked','取消暂存标记','标记暂存']]){const button=$(name);button.disabled=!active||options.isTop?.()===false||target<0||cells.length!==1;button.setAttribute('aria-pressed',String(cells.length===1&&!!cells[0][field]));button.textContent=cells.length===1&&cells[0][field]?yes:no;}
      if(cells.length===1){if(!locked('volume'))$('volume').value=String(cells[0].volume);if(!locked('rate'))$('rate').value=String(cells[0].rate);if(!locked('seek'))$('seek').value=String(Math.round(cells[0].positionMs/Math.max(1,cells[0].durationMs)*1000));}
      $('previous').disabled=!enabled||!state.hasPrevious;$('next').disabled=!enabled||!state.hasNext;
      $('summary').textContent=(state.total?(state.offset+1)+'–'+Math.min(state.offset+state.cells.length,state.total)+' / '+state.total+'　':'')+state.cells.map((v,i)=>(i+1)+': '+Math.floor(v.positionMs/1000)+'s · '+v.renderedFrames+' 帧 · '+(v.seekError&&![5,6,7].includes(v.state)?'定位失败：'+v.seekError:phase.describe(v).shortLabel)).join('　');
    }
    async function readPaint(action,args){const epoch=activityEpoch,value=await native(action,args);if(!closed&&epoch===activityEpoch)paint(value);return value;}
    function bindValue(id,name,makeArgs,group=false){
      const node=$(id),gesture={active:false,keyHeld:false,target:null};gestures.set(id,gesture);
      function begin(){gesture.target=capture(group?-1:undefined);gesture.active=true;}
      listen(node,'pointerdown',()=>begin(),undefined,'rhvideo.grid.'+id+'.begin');
      listen(node,'keydown',event=>{if(!event.ctrlKey&&!event.altKey&&!event.metaKey){if(!gesture.keyHeld)begin();gesture.keyHeld=true;}},undefined,'rhvideo.grid.'+id+'.key.begin');
      listen(node,'keyup',()=>{gesture.keyHeld=false;gesture.active=false;paint(state);},undefined,'rhvideo.grid.'+id+'.key.end');
      listen(node,'input',()=>{if(!gesture.active&&!gesture.keyHeld)begin();},undefined,'rhvideo.grid.'+id+'.preview');
      listen(node,'change',event=>{
        let started;try{started=(!gesture.active&&!gesture.keyHeld&&event?.isTrusted===false?capture(group?-1:undefined):gesture.target)||capture(group?-1:undefined);}catch(e){return observeAction(Promise.reject(e));}gesture.active=false;
        if(started.cancelled)return observeAction(Promise.reject(Error('拖动已取消，旧操作未执行')));
        return observeAction(api.invoke('rhvideo.grid.'+name,{...makeArgs(Number(node.value),started),...guard(started)}).finally(()=>{if(!gesture.keyHeld)paint(state);}));
      },undefined,'rhvideo.grid.'+id);
      const cancel=()=>{if(gesture.target)gesture.target.cancelled=true;gesture.active=false;gesture.keyHeld=false;};gesture.cancel=cancel;listen(node,'pointercancel',cancel,undefined,'rhvideo.grid.'+id+'.cancel');
    }
    try{
      if(standalone){registry.provideRunLookup(query=>window.__TAURI__.core.invoke('automation_receipt',{query}));registry.provideRunTransport(()=>window.__TAURI__.core.invoke('automation_receipt_transport'));api.provideState('application',()=>({platform:'windows',window:'window-rhvideo-grid',ready:state.cells.length>0}));}
      api.provideState('grid',()=>({...state,cells:state.cells.map(v=>({...v,playback:phase.describe(v)}))}));
      register('state',object(),()=>readPaint('grid.state'));
      register('target',object({index:{type:'integer',minimum:-1,maximum:8}},['index']),({index})=>{if(index>=state.cells.length)throw Error('目标视频不存在');$('target').value=String(index);paint(state);return {index};});
      register('control',object({...guardSchema,target:{type:'integer',minimum:-1,maximum:8},command:{type:'string',enum:['pause','resume','seek','volume','mute','rate','rotate']},value:{type:'number'}},['target','command']),args=>readPaint('grid.control',guardArgs(args)));
      register('expand',object({...guardSchema,target:{type:'integer',minimum:-1,maximum:8}},['target']),args=>readPaint('grid.expand',guardArgs(args)));
      register('close',object(guardSchema),(args,run)=>native('grid.close',{...guardArgs(args),...(standalone&&run?{_automationRun:run}:{})}));
      for(const name of ['favorite','mark'])register(name,object({...guardSchema,target:{type:'integer',minimum:0,maximum:8}},['target']),async args=>{if(mutationBusy)throw Error('视频标记正在处理');mutationBusy=true;try{await native('grid.'+name,guardArgs(args));return await readPaint('grid.state');}finally{mutationBusy=false;}});
      register('seekGroup',object({...guardSchema,ratio:{type:'number',minimum:0,maximum:1}},['ratio']),args=>readPaint('grid.seekGroup',guardArgs(args)));
      register('page',object({...guardSchema,direction:{type:'integer',enum:[-1,1]}},['direction']),args=>readPaint('grid.page',guardArgs(args)));
      register('seekRatio',object({...guardSchema,target:{type:'integer',minimum:-1,maximum:8},ratio:{type:'number',minimum:0,maximum:1}},['target','ratio']),async args=>{
        const bound=guardArgs(args);checkSeen(bound);const cells=state.cells.map((v,index)=>({index,inputId:v.inputId,durationMs:v.durationMs}));let value=state;
        for(const cell of cells)if(args.target===-1||args.target===cell.index)value=await readPaint('grid.control',{...guard(bound),target:cell.index,command:'seek',value:Math.floor(cell.durationMs*args.ratio)});return value;
      });
      register('input',object({inputId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},target:{type:'integer',minimum:0,maximum:8},intent:{type:'string',enum:['next','previous','first','last','toggle','close','expand','mark']}},['inputId','target','intent']),async({inputId,target,intent})=>{
        if(inputBusy)return {ignored:true};inputBusy=true;try{const current=await readPaint('grid.state');if(current.cells[target]?.inputId!==inputId)return {stale:true};const bound={expectedInput:inputId,inputTarget:target};let value;
          if(intent==='expand')value=await native('grid.expand',{...bound,target,toggle:true});else if(intent==='close'){if(current.expanded!=null)value=await native('grid.expand',{...bound,target:-1});else return await native('grid.close',bound);}
          else if(intent==='next'||intent==='previous')value=await native('grid.page',{...bound,direction:intent==='next'?1:-1});else if(intent==='first'||intent==='last')value=await native('grid.seekGroup',{...bound,ratio:intent==='first'?0:1});
          else if(intent==='toggle')value=await native('grid.control',{...bound,expectedInputs:current.cells.map(v=>v.inputId),target:-1,command:toggleCommand(current)});else if(intent==='mark'){await native('grid.mark',{...bound,target});value=await native('grid.state');}else return {ignored:true};paint(value);return value;
        }finally{inputBusy=false;}
      });
      subscribe(options.nativeInputEvent||'rhvideo-native-input',({payload})=>{
        if(!active||options.isTop?.()===false||!Number.isSafeInteger(payload?.target)||payload.target<0||payload.target>8||standalone&&payload.hostLease!=null||options.acceptNativeInput?.(payload)===false)return;
        return observeAction(api.invoke('rhvideo.grid.input',{inputId:payload.inputId,target:payload.target,intent:payload.intent}));
      });
      subscribe('rhvideo-grid-session',({payload})=>{if(!Number.isSafeInteger(payload?.generation)||payload.generation<(state.generation||0))return;if(payload.generation>(state.generation||0)){state={generation:payload.generation,cells:[]};sourceControls(false);}void observeAction(api.invoke('rhvideo.grid.state'));});
      for(const [id,name]of Object.entries({previous:'page',next:'page',target:'target',pause:'control',resume:'control',mute:'control',favorite:'favorite',mark:'mark',expand:'expand',restore:'expand',seek:'seekRatio',volume:'control',rate:'control','group-seek':'seekGroup'}))$(id).dataset.apiAction=actionId('rhvideo.grid.'+name);
      api.register('rhvideo.ui.contract',()=>{const ids=new Set(api.list().map(v=>v.id)),controls=[...root.querySelectorAll('button,input,select')].map(n=>({label:n.getAttribute('aria-label')||n.id||n.textContent,action:n.dataset.apiAction}));return {controls:controls.length,missing:controls.filter(v=>!ids.has(v.action)),operations:api.list()};},{params:object(),risk:'read',description:'Native grid UI/public API coverage'});
      for(const name of ['favorite','mark'])listen($(name),'click',()=>observeAction(api.invoke('rhvideo.grid.'+name,{target:Number($('target').value)})),undefined,'rhvideo.grid.'+name);
      for(const command of ['pause','resume','mute'])listen($(command),'click',()=>observeAction(api.invoke('rhvideo.grid.control',{target:Number($('target').value),command})),undefined,'rhvideo.grid.'+command);
      for(const [id,direction]of [['previous',-1],['next',1]])listen($(id),'click',()=>observeAction(api.invoke('rhvideo.grid.page',{direction})),undefined,'rhvideo.grid.'+id);
      listen($('target'),'change',()=>observeAction(api.invoke('rhvideo.grid.target',{index:Number($('target').value)})),undefined,'rhvideo.grid.target');
      for(const command of ['volume','rate'])bindValue(command,'control',(value,started)=>({target:started.target,command,value}));
      bindValue('seek','seekRatio',(value,started)=>({target:started.target,ratio:value/1000}));bindValue('group-seek','seekGroup',value=>({ratio:value/1000}),true);
      listen(document,'keydown',event=>{
        if(event.target.closest('input,select,textarea')||event.ctrlKey||event.altKey||event.metaKey)return;
        const key=event.key&&event.key!=='Unidentified'?(event.key===' '?'Space':event.key):event.code,intent={Escape:'close',Space:'toggle',ArrowLeft:'previous',ArrowRight:'next',Home:'first',End:'last'}[key];
        if(!intent||event.repeat||!state.cells.length)return;event.preventDefault();return call('input',{inputId:state.cells[0].inputId,target:0,intent});
      },undefined,'rhvideo.grid.keyboard');
      function call(name,args){return observeAction(api.invoke('rhvideo.grid.'+name,args));}
      listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.grid.contextmenu');
      for(const [id,target]of [['expand',()=>Math.max(0,Number($('target').value))],['restore',()=>-1]])listen($(id),'click',()=>call('expand',{target:target()}),undefined,'rhvideo.grid.'+id);
      async function poll(){if(busy||closed||!active||options.isTop?.()===false)return;busy=true;const epoch=activityEpoch;try{const value=await native('grid.state');if(!closed&&active&&epoch===activityEpoch)paint(value);}catch(e){if(!closed&&active&&epoch===activityEpoch)error(e);}finally{busy=false;if(!closed&&active)pollTimer=setTimeout(()=>{pollTimer=null;void poll();},1000);}}
      function suspend({preserveGestures=false}={}){active=false;activityEpoch++;if(pollTimer!==null){clearTimeout(pollTimer);pollTimer=null;}if(!preserveGestures)for(const g of gestures.values())g.cancel();sourceControls(false);return {active:false};}
      function resume(){if(closed)throw Error('同屏控件已关闭');if(active&&(busy||pollTimer!==null))return {active:true};active=true;void poll();return {active:true};}
      function dispose(){if(closed)return {disposed:true};suspend();closed=true;releaseBindings();return {disposed:true};}
      sourceControls(false);window.addEventListener('pagehide',dispose);remember(()=>window.removeEventListener?.('pagehide',dispose));if(active)void poll();
      return Object.freeze({suspend,resume,dispose,refresh:()=>api.invoke('rhvideo.grid.state'),snapshot:()=>JSON.parse(JSON.stringify({state,active,closed,busy,timerPending:pollTimer!==null,cleanupErrors}))});
    }catch(e){closed=true;active=false;if(pollTimer!==null)clearTimeout(pollTimer);releaseBindings();throw e;}
  }});
})();
