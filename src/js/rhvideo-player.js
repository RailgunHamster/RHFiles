(() => {
  'use strict';
  const api=window.RHFilesAPI,$=id=>document.getElementById(id),object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const native=(action,args={})=>window.__TAURI__.core.invoke('rhvideo_request',{action,args});
  api.provideState('application',()=>({platform:'windows',window:'window-rhvideo-player',ready:true}));
  let state={opened:false},busy=false,dragging=false,closed=false,endedId='';
  function error(value){$('error').textContent=String(value?.message||value);}
  let audibleVolume=100;
  function paint(value){
    state=value;if(!state.opened){$('status').textContent='播放已停止';return;}
    $('title').textContent=state.title;$('position').textContent=RHVideoModel.clock(state.positionMs/1000);$('duration').textContent=RHVideoModel.clock(state.durationMs/1000);
    if(!dragging)$('seek').value=state.durationMs>0?Math.round(state.positionMs/state.durationMs*1000):0;
    $('toggle').textContent=state.state===4?'继续':'暂停';
    $('status').textContent=state.state===7?'播放失败，请检查服务器或媒体编码':state.state===6?'播放结束':state.state===1||state.state===2?'正在缓冲…':'libVLC · 原生渲染';
    if(state.volume>0)audibleVolume=state.volume;
    $('volume').value=String(state.volume);$('rate').value=String(state.rate);
    $('previous').disabled=!state.queue?.hasPrevious;$('next').disabled=!state.queue?.hasNext;
  }
  api.provideState('player',()=>state);
  const register=(name,params,handler)=>api.register('rhvideo.player.'+name,handler,{params,risk:['state','preloadState'].includes(name)?'read':'ui',description:'Native RHVideo player '+name});
  register('state',object(),async()=>{const value=await native('player.state');paint(value);return value;});
  register('control',object({command:{type:'string',enum:['pause','resume','seek','rate','volume','rotate']},value:{type:'number'}},['command']),async args=>{const value=await native('player.control',args);paint(value);return value;});
  register('options',object({loop:{type:'boolean'},fullLength:{type:'boolean'},segment:{type:'number',minimum:.1,maximum:3600},super:{type:'boolean'}}),args=>native('player.options',{options:args}));
  register('mute',object(),()=>control({command:'volume',value:state.volume?0:audibleVolume}));
  register('rotate',object(),()=>control({command:'rotate',value:((state.rotation||0)+90)%360}));
  register('loop',object(),()=>api.invoke('rhvideo.player.options',{loop:!state.queue?.options?.loop}));
  for(const [name,title]of [['mute','静音'],['rotate','旋转'],['loop','循环队列']]){const b=document.createElement('button');b.dataset.apiAction='rhvideo.player.'+name;b.textContent=title;RHFilesUI.listen(b,'click',()=>api.invoke('rhvideo.player.'+name).catch(error),undefined,'rhvideo.player.'+name);document.querySelector('.control-row').append(b);}
  register('fullscreen',object(),()=>native('player.fullscreen'));
  for(const direction of ['next','previous'])register(direction,object({expectedId:{type:'string',maxLength:128},expectedRevision:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}),async args=>{const result=await native('player.'+direction,args);paint(result);return result;});
  register('preloadState',object(),()=>native('player.preloadState'));
  register('preload',object(),()=>native('player.preload'));
  register('close',object(),()=>native('player.close'));
  for(const [id,name]of Object.entries({toggle:'control',next:'next',previous:'previous',seek:'control',rate:'control',volume:'control',fullscreen:'fullscreen'}))$(id).dataset.apiAction='rhvideo.player.'+name;
  api.register('rhvideo.ui.contract',()=>{const ids=new Set(api.list().map(v=>v.id)),controls=[...document.querySelectorAll('button,input,select')].map(n=>({label:n.getAttribute('aria-label')||n.id||n.textContent,action:n.dataset.apiAction}));return {controls:controls.length,missing:controls.filter(v=>!ids.has(v.action)),operations:api.list()};},{params:object(),risk:'read',description:'Native player UI/public API coverage'});
  const control=args=>api.invoke('rhvideo.player.control',args).catch(error);
  RHFilesUI.listen($('toggle'),'click',()=>control({command:state.state===4?'resume':'pause'}),undefined,'rhvideo.player.toggle');
  for(const name of ['next','previous'])RHFilesUI.listen($(name),'click',()=>api.invoke('rhvideo.player.'+name).catch(error),undefined,'rhvideo.player.'+name);
  RHFilesUI.listen($('seek'),'input',()=>{dragging=true;$('position').textContent=RHVideoModel.clock(Number($('seek').value)/1000*state.durationMs/1000);},undefined,'rhvideo.player.seek.preview');
  RHFilesUI.listen($('seek'),'change',()=>{dragging=false;control({command:'seek',value:Math.round(Number($('seek').value)/1000*state.durationMs)});},undefined,'rhvideo.player.seek.commit');
  RHFilesUI.listen($('rate'),'change',()=>control({command:'rate',value:Number($('rate').value)}),undefined,'rhvideo.player.rate');
  RHFilesUI.listen($('volume'),'change',()=>control({command:'volume',value:Number($('volume').value)}),undefined,'rhvideo.player.volume');
  RHFilesUI.listen($('fullscreen'),'click',()=>api.invoke('rhvideo.player.fullscreen').catch(error),undefined,'rhvideo.player.fullscreen');
  RHFilesUI.listen(document,'keydown',event=>{if(event.code!=='Space'||event.target.matches('input,select'))return;event.preventDefault();control({command:state.state===4?'resume':'pause'});},undefined,'rhvideo.player.keyboard');
  RHFilesUI.listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.player.contextmenu');
  async function poll(){if(busy||closed)return;busy=true;try{paint(await native('player.state'));const q=state.queue,segmentEnd=q&&q.options?.fullLength===false&&state.positionMs>=(q.segmentStartMs||0)+Math.min(Number(q.options.segment)||15,Number(q.segmentDuration)||Infinity)*1000;if((state.state===6||segmentEnd)&&q?.hasNext&&endedId!==q.id){endedId=q.id;await api.invoke('rhvideo.player.next',{expectedId:q.id,expectedRevision:q.revision});}else if(segmentEnd&&!q?.hasNext&&endedId!==q?.id){endedId=q?.id;await api.invoke('rhvideo.player.control',{command:'pause'});}else if(state.state===3&&!segmentEnd)endedId='';}catch(e){error(e);}finally{busy=false;if(!closed)setTimeout(poll,500);}}
  window.addEventListener('pagehide',()=>{closed=true;});void poll();
})();
