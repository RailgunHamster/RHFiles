(() => {
  'use strict';
  const api=window.RHFilesAPI,$=id=>document.getElementById(id),object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const native=(action,args={})=>window.__TAURI__.core.invoke('rhvideo_request',{action,args});
  api.provideState('application',()=>({platform:'windows',window:'window-rhvideo-player',ready:true}));
  let state={opened:false},busy=false,dragging=false,closed=false,endedId='';
  function error(value){$('error').textContent=String(value?.message||value);}
  function paint(value){
    state=value;if(!state.opened){$('status').textContent='播放已停止';return;}
    $('title').textContent=state.title;$('position').textContent=RHVideoModel.clock(state.positionMs/1000);$('duration').textContent=RHVideoModel.clock(state.durationMs/1000);
    if(!dragging)$('seek').value=state.durationMs>0?Math.round(state.positionMs/state.durationMs*1000):0;
    $('toggle').textContent=state.state===4?'继续':'暂停';
    $('status').textContent=state.state===7?'播放失败，请检查服务器或媒体编码':state.state===6?'播放结束':state.state===1||state.state===2?'正在缓冲…':'libVLC · 原生渲染';
    $('volume').value=String(state.volume);$('rate').value=String(state.rate);
    $('previous').disabled=!state.queue?.hasPrevious;$('next').disabled=!state.queue?.hasNext;
  }
  api.provideState('player',()=>state);
  const register=(name,params,handler)=>api.register('rhvideo.player.'+name,handler,{params,description:'Native RHVideo player '+name});
  register('state',object(),async()=>{const value=await native('player.state');paint(value);return value;});
  register('control',object({command:{type:'string',enum:['pause','resume','seek','rate','volume']},value:{type:'number'}},['command']),async args=>{const value=await native('player.control',args);paint(value);return value;});
  register('fullscreen',object(),()=>native('player.fullscreen'));
  register('next',object(),()=>native('player.next'));
  register('previous',object(),()=>native('player.previous'));
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
  async function poll(){if(busy||closed)return;busy=true;try{paint(await native('player.state'));if(state.state===6&&state.queue?.hasNext&&endedId!==state.queue.id){endedId=state.queue.id;await api.invoke('rhvideo.player.next');}else if(state.state===3)endedId='';}catch(e){error(e);}finally{busy=false;if(!closed)setTimeout(poll,750);}}
  window.addEventListener('pagehide',()=>{closed=true;});void poll();
})();
