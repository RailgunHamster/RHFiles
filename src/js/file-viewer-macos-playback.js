/* The macOS file viewer uses the platform's WebKit media decoder. */
const RHFilesMacPlayback=(()=>{
  function create({source,invoke,wake}){
    let active=null;
    function clear(){
      if(!active)return;
      const {node,listeners}=active;
      active=null;
      listeners.abort();
      node.pause();
      node.removeAttribute('src');
      node.load();
      node.remove();
    }
    function open(session,track){
      clear();
      const node=document.createElement('video');
      node.playsInline=true;
      node.preload='auto';
      node.volume=(session.videoVolume??100)/100;
      Object.assign(node.style,{display:'block',width:'100%',height:'100%',objectFit:'contain'});
      const entry=session.entries[session.index];
      const listeners=new AbortController();
      const input=active={node,listeners,entry,session,started:performance.now(),firstFrameMs:null,failed:false};
      const signal=listeners.signal;
      const events=['loadedmetadata','loadeddata','play','playing','pause','ended','seeked','waiting','error'];
      for(const event of events)RHFilesUI.listen(node,event,()=>{
        if(event==='loadeddata')input.firstFrameMs=Math.round(performance.now()-input.started);
        wake();
      },{signal},'desktop.mac-playback.'+event);
      track.append(node);
      void source(entry).then(url=>{
        if(active!==input)return;
        node.src=url;
        // Autoplay policies may require the user to press Play in the viewer.
        return node.play().catch(()=>{});
      }).catch(()=>{if(active===input){input.failed=true;wake();}});
    }
    function snapshot(){
      const {node,session,entry,firstFrameMs,failed}=active;
      const ready=node.readyState>=1;
      const frames=node.getVideoPlaybackQuality?.().totalVideoFrames||0;
      const error=failed||node.error;
      return {opened:ready||!!error,inputId:session.selection,engine:'WebKit',title:entry.name,
        state:error?7:node.ended?6:node.paused?(ready?4:1):3,pauseRequested:node.paused,
        durationMs:Number.isFinite(node.duration)?Math.round(node.duration*1000):0,positionMs:Math.round(node.currentTime*1000),
        rate:node.playbackRate,volume:Math.round(node.volume*100),renderedFrames:frames||Number(firstFrameMs!==null),
        startup:{phase:firstFrameMs!==null?'ready':ready?'firstFrame':'source',elapsedMs:firstFrameMs}};
    }
    async function request(action,args){
      const input=active;
      if(action==='video.state')return input?snapshot():{opened:false};
      if(action==='video.bounds')return {visible:!!input&&input.firstFrameMs!==null};
      if(!input||args.generation!==input.session.generation||args.expectedInput!==input.session.selection)
        throw Error('播放输入已改变 / Player input changed');
      const {node}=input;
      const value=args.value;
      switch(args.command){
        case 'pause':node.pause();break;
        case 'toggle':
          if(!node.paused&&!node.ended){node.pause();break;}
          await node.play();break;
        case 'resume':await node.play();break;
        case 'seek':
          if(!Number.isFinite(value)||!Number.isFinite(node.duration)||value<0||value>Math.round(node.duration*1000))
            throw Error('跳转位置超出范围 / Seek position out of range');
          node.currentTime=Math.min(node.duration,value/1000);break;
        case 'rate':
          if(!Number.isFinite(value)||value<.25||value>4)throw Error('播放倍速超出范围 / Playback rate out of range');
          node.playbackRate=value;break;
        case 'volume':
          if(!Number.isInteger(value)||value<0||value>100)throw Error('音量超出范围 / Volume out of range');
          await invoke('video.volume',{generation:args.generation,selection:args.selection,value});
          if(active===input)node.volume=value/100;
          break;
        default:throw Error('Unknown video control');
      }
      if(active!==input)throw Error('播放输入已改变 / Player input changed');
      return snapshot();
    }
    return {open,clear,request};
  }
  return {create};
})();
