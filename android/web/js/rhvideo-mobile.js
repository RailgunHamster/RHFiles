/* Only the packaged RHVideo Activity installs this origin-restricted bridge. */
(() => {
  'use strict';
  let sequence=0;
  const pending=new Map();
  const listeners=new Map(),events=new Set(['rhvideo-favorite','rhvideo-preview-mark','rhvideo-preview-result','rhvideo-parent-preview','rhvideo-playback-error','rhvideo-media-action']);
  window.RHVideoBridge.onmessage=event=>{
    let response;try{response=JSON.parse(event.data);}catch{return;}
    const job=pending.get(response.id);if(!job)return;
    pending.delete(response.id);clearTimeout(job.timer);
    response.error?job.reject(Error(response.error)):job.resolve(response.result);
  };
  window.RHVideoNative={
    async listen(name,callback){if(!events.has(name)||typeof callback!=='function')throw Error('未知媒体事件');let group=listeners.get(name);if(!group)listeners.set(name,group=new Set());group.add(callback);return ()=>group.delete(callback);},
    dispatch(name,payload){if(!events.has(name)||!payload||typeof payload!=='object')return;for(const callback of listeners.get(name)||[])callback({payload});},
    request(action,args={}){
    return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('RHVideo 请求超时，请检查连接'));},55000);
      pending.set(id,{resolve,reject,timer});
      try{window.RHVideoBridge.postMessage(JSON.stringify({id,action,args}));}
      catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
    });
  }};
})();
