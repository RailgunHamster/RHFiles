// A newly advertised WebView2 target can still be the initial empty document.
// Do not attach the inspector to it and start the application's ready deadline
// until the shipped HTML title has arrived. No reload or relaunch is performed.
export function isLoadedMainTarget(target){
  if(target?.type!=='page'||target.title!=='RHFiles')return false;
  try{const url=new URL(target.url);return ['http:','https:','tauri:'].includes(url.protocol)&&['tauri.localhost','localhost'].includes(url.hostname)&&['/','/index.html'].includes(url.pathname)&&!url.username&&!url.password;}catch{return false;}
}
