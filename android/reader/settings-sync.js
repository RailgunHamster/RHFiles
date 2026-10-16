let nextId=0;const pending=new Map();
function saveNative(args){
  const bridge=window.RHFilesReader;if(!bridge)return Promise.resolve();
  bridge.onmessage=event=>{let reply;try{reply=JSON.parse(event.data)}catch{return}const task=pending.get(reply.id);if(!task)return;pending.delete(reply.id);clearTimeout(task.timer);reply.error?task.reject(Error(reply.error)):task.resolve();};
  return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('阅读配置保存超时'));},15000);pending.set(id,{resolve,reject,timer});bridge.postMessage(JSON.stringify({action:'settings',id,...args}));});
}
export async function syncReaderSettings(finish=false){
  if(!window.RHFilesReader)return;
  const response=await fetch('/book/settings');if(!response.ok)throw Error('无法读取阅读配置');const state=await response.json();
  const keys=()=>Object.keys(localStorage).filter(k=>k==='rhfiles.reader.options'||/^rhfiles\.reader\.book\.[A-Za-z0-9_-]{1,160}$/.test(k));
  let values=state.values;
  if(state.authoritative){for(const key of keys())localStorage.removeItem(key);for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);}
  else{values={};for(const key of keys()){try{const value=localStorage.getItem(key),parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))values[key]=value;}catch{}}}
  await saveNative({values,finish});
}
export const saveReaderSetting=(key,value)=>saveNative({key,value});
