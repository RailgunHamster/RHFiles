(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoPlaybackPhase=value;})(globalThis,()=>{
  'use strict';
  // VLC 3 PLAYING means an input is running, not that a video frame has been
  // presented. Do not use decoded packets, elapsed time or an open reply as
  // evidence of a visible frame. Both native control windows share this rule.
  const phases={
    stopped:['播放已停止','已停止'],failed:['播放失败，请检查服务器或媒体编码','加载失败'],
    displayFailed:['画面显示失败','画面显示失败'],ended:['播放结束','播放结束'],
    restoring:['正在恢复暂停画面…','正在恢复暂停画面'],seeking:['正在定位…','正在定位'],
    paused:['已暂停','已暂停'],pausing:['正在暂停…','正在暂停'],resuming:['正在继续…','正在继续'],
    buffering:['正在缓冲…','缓冲中'],preparing:['正在准备首帧…','等待首帧'],playing:['播放中','播放中'],
  };
  function describe(value={}){
    let phase;
    if(value.presentationError)phase='displayFailed';
    else if(value.state===7||(value.state===6&&!value.durationMs&&!value.renderedFrames))phase='failed';
    else if(value.opened===false||value.state===5)phase='stopped';
    else if(value.state===6)phase='ended';
    else if(value.restoringPausedFrame)phase='restoring';
    else if(value.pendingSeekMs!=null)phase='seeking';
    else if(value.pauseRequested??(value.state===4))phase=value.state===4?'paused':'pausing';
    else if(value.state===4)phase='resuming';
    else if(value.state===0||value.state===1||value.state===2||value.buffering===true)phase='buffering';
    else if(value.state!==3||!Number.isSafeInteger(value.renderedFrames)||value.renderedFrames<1)phase='preparing';
    else phase='playing';
    const [label,shortLabel]=phases[phase];return {phase,label,shortLabel};
  }
  return {describe};
});
