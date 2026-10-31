// Observe the actual selected PLAYER host. Never fabricate a popup target or
// rewrite the product's host choice to satisfy old window-specific tests.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {parse} from 'acorn';
import {until} from './app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';
export async function nativePlayerView(app){
 const state=await until(async()=>{const value=await app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"player.state",args:{}})');return value.opened?value:null;},'selected native PLAYER host');
 assert(['library','popup'].includes(state.host?.kind));assert(Number.isSafeInteger(state.host.lease)&&state.host.lease>0);
 const library=state.host.kind==='library',file=library?'rhvideo.html':'rhvideo-player.html',host={kind:state.host.kind,lease:state.host.lease,label:library?'window-rhvideo':'window-rhvideo-player',idPrefix:library?'library-player-':'',stateName:library?'rhvideo.inlinePlayer':'player',actionPrefix:library?'rhvideo.inlinePlayer.':'rhvideo.player.'};
 const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/'+file),'actual '+host.kind+' PLAYER document');
 const page=await cdpSession(target,30000);page.playerHost=Object.freeze(host);
 try{
  await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().find(row=>row.id==='+JSON.stringify(host.actionPrefix+'state')+')'),'selected host control actions');
  if(library)assert.equal(await page.evaluate('document.getElementById("rhvideo-player-dialog")?.open'),true);else await until(()=>page.evaluate('RHFilesAPI.snapshot().state.application?.ready===true'),'authoritative popup controls');
  for(const file of ['rhvideo-player-controls.js',library?'rhvideo-player-host.js':'rhvideo-player.js']){const hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(hash(await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(row=>row.text())')),hash(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url))),'Execute the admitted '+host.kind+' '+file);}
  const actual=await page.evaluate('RHFilesAPI.invoke('+JSON.stringify(host.actionPrefix+'state')+')');assert.equal(actual.host?.kind,host.kind);assert.equal(actual.host?.lease,host.lease);return page;
 }catch(error){page.close();throw error;}
}
export function playerAction(page,name){if(!page.playerHost)return 'rhvideo.'+name;if(name.startsWith('player.'))return page.playerHost.actionPrefix+name.slice(7);if(name==='ui.contract')return page.playerHost.actionPrefix+'contract';return 'rhvideo.'+name;}
export function playerElementId(page,name){if(!page.playerHost)throw Error('An observed PLAYER host is required');return page.playerHost.idPrefix+name;}
export function playerEvaluate(page,source){
 if(!page.playerHost)throw Error('An observed PLAYER host is required');
 const program=parse(source,{ecmaVersion:'latest'}),last=program.body.at(-1);
 const body=last?.type==='ExpressionStatement'?source.slice(0,last.start)+'return ('+source.slice(last.expression.start,last.expression.end)+');':source;
 return page.evaluate('((host)=>{const playerElement=id=>document.getElementById(host.idPrefix+id),playerSnapshot=()=>RHFilesAPI.snapshot().state[host.stateName],playerInvoke=(name,args={})=>RHFilesAPI.invoke(host.actionPrefix+name,args);'+body+'})('+JSON.stringify(page.playerHost)+')');
}
