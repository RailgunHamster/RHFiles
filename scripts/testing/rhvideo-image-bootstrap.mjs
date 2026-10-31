import {createHash} from 'node:crypto';
export function imageStaticTimings(){
 const fields=entry=>Object.fromEntries(['startTime','duration','fetchStart','responseStart','responseEnd','domContentLoadedEventEnd','loadEventEnd','transferSize','encodedBodySize','decodedBodySize'].map(key=>[key,Number.isFinite(entry[key])&&entry[key]>=0?entry[key]:null]));
 const resources=[];for(const entry of performance.getEntriesByType('resource')){let url;try{url=new URL(entry.name);}catch{continue;}if(url.origin!==location.origin||url.search||url.hash||!/^\/rhvideo\/(?:js\/(?:automation-core|rhvideo-[a-z-]+)|css\/rhvideo(?:-[a-z-]+)?|vendor\/pinyin-pro\/pinyin-pro)\.(?:js|css)$/.test(url.pathname))continue;resources.push({path:url.pathname,...fields(entry)});if(resources.length===32)break;}
 const navigation=performance.getEntriesByType('navigation')[0];return {clock:'web-performance',scope:'completed same-origin packaged static resources only; excludes in-flight reads',observedAt:performance.now(),navigation:navigation?fields(navigation):null,resources};
}
// Read-only post-failure diagnostics, never a reload, action replay or a new
// readiness budget. Only static module names/hashes and bounded API identifiers.
export async function imageBootstrapDiagnostic(page){
 const state=await page.evaluate(`(()=>{const api=globalThis.RHFilesAPI,ids=api?.list?.().map(row=>row.id)||[];return {ready:document.readyState,visible:document.visibilityState,path:location.pathname,api:typeof api,workbench:typeof globalThis.RHVideoWorkbench,bridge:typeof globalThis.RHVideoNative?.request,back:typeof globalThis.RHVideoBack,apiCount:ids.length,lastAPIs:ids.slice(-24),scripts:[...document.scripts].map(s=>new URL(s.src,location.href).pathname).filter(p=>/^\\/rhvideo\\/js\\/[A-Za-z0-9_.-]+\\.js$/.test(p)).slice(0,32),timings:(${imageStaticTimings.toString()})()};})()`);
 const sources=[];
 for(const file of ['rhvideo-client.js','rhvideo-workbench.js']){
  try{const text=await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>{if(!r.ok)throw Error("Static module unavailable");return r.text();})');sources.push({file,length:text.length,sha256:createHash('sha256').update(text).digest('hex')});}
  catch{sources.push({file,available:false});}
 }
 return {scope:'read-only initialization observation after failure; not a startup or image pass',state,sources};
}
export function imageLibraryTargets(rows,selected){
 return rows.filter(row=>row.url==='https://appassets.androidplatform.net/rhvideo/rhvideo.html').slice(0,16).map(row=>{let description;try{description=JSON.parse(row.description);}catch{}return {id:row.id,selected:row.id===selected,visible:description?.visible===true,attached:description?.attached===true};});
}
