import {createHash} from 'node:crypto';
// Read-only post-failure diagnostics, never a reload, action replay or a new
// readiness budget. Only static module names/hashes and bounded API identifiers.
export async function imageBootstrapDiagnostic(page){
 const state=await page.evaluate(`(()=>{const api=globalThis.RHFilesAPI,ids=api?.list?.().map(row=>row.id)||[];return {ready:document.readyState,visible:document.visibilityState,path:location.pathname,api:typeof api,workbench:typeof globalThis.RHVideoWorkbench,bridge:typeof globalThis.RHVideoNative?.request,back:typeof globalThis.RHVideoBack,apiCount:ids.length,lastAPIs:ids.slice(-24),scripts:[...document.scripts].map(s=>new URL(s.src,location.href).pathname).filter(p=>/^\\/rhvideo\\/js\\/[A-Za-z0-9_.-]+\\.js$/.test(p)).slice(0,32)};})()`);
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
