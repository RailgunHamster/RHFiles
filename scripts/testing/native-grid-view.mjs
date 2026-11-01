// Observe the product's actual GRID host; never synthesize a popup target.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {parse} from 'acorn';import {until} from './app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';
export async function nativeGridView(app){
 const state=await until(async()=>{const s=await app.evaluate('__TAURI__.core.invoke("rhvideo_request",{action:"grid.state",args:{}})');return s.cells.length?s:null;},'selected native GRID host');assert(['popup','library'].includes(state.host?.kind));assert(Number.isSafeInteger(state.host.lease)&&state.host.lease>0);
 const library=state.host.kind==='library',host={kind:state.host.kind,lease:state.host.lease,label:library?'window-rhvideo':'window-rhvideo-grid',idPrefix:library?'library-grid-':'',actionPrefix:library?'rhvideo.inlineGrid.':'rhvideo.grid.'},file=library?'rhvideo.html':'rhvideo-grid.html';
 const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(v=>new URL(v.url).pathname==='/'+file),'actual '+host.kind+' GRID document'),page=await cdpSession(target,30000);page.gridHost=Object.freeze(host);
 try{await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(v=>v.id==='+JSON.stringify(host.actionPrefix+'state')+')'),'selected GRID control actions');if(library)assert.equal(await page.evaluate('document.getElementById("rhvideo-grid-dialog")?.open'),true);
  for(const name of ['rhvideo-grid-controls.js',library?'rhvideo-grid-host.js':'rhvideo-grid.js']){const hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(await page.evaluate('fetch('+JSON.stringify('js/'+name)+').then(r=>r.text())')),hash(fs.readFileSync(new URL('../../src/js/'+name,import.meta.url))),'Use the admitted '+host.kind+' '+name);}const actual=await page.evaluate('RHFilesAPI.invoke('+JSON.stringify(host.actionPrefix+'state')+')');assert.equal(actual.host.lease,host.lease);return page;
 }catch(e){page.close();throw e;}
}
export function gridAction(view,name){if(!view.gridHost)return 'rhvideo.'+name;if(name.startsWith('grid.'))return view.gridHost.actionPrefix+name.slice(5);if(name==='ui.contract')return view.gridHost.kind==='library'?view.gridHost.actionPrefix+'contract':'rhvideo.ui.contract';return 'rhvideo.'+name;}
export function gridElementId(view,id){if(!view.gridHost)throw Error('An observed GRID host is required');return view.gridHost.idPrefix+id;}
export function gridEvaluate(view,source){
 if(!view.gridHost)throw Error('An observed GRID host is required');const program=parse(source,{ecmaVersion:'latest'}),last=program.body.at(-1),body=last?.type==='ExpressionStatement'?source.slice(0,last.start)+'return ('+source.slice(last.expression.start,last.expression.end)+');':source;
 return view.evaluate('((host)=>{const gridElement=id=>document.getElementById(host.idPrefix+id),gridRoot=host.kind==="library"?document.getElementById("rhvideo-grid-dialog"):document;'+body+'})('+JSON.stringify(view.gridHost)+')');
}
