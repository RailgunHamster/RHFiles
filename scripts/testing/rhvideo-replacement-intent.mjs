// Shared real-HTTP / packaged-UI scenario. Delays generated metadata on the
// server; never replaces the product's actions, query or dialog functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './source.mjs';
import {until} from './app-session.mjs';

export function replacementIntentControl(){
  let active=null;
  const finish=current=>{if(active===current)active=null;current?.resolve();};
  return {
    async beforeCatalog(kind){const current=active;if(kind==='video'&&current){current.reads++;await current.promise;}return null;},
    arm(){assert.equal(active,null,'Only one explicit metadata gate may be active');let resolve;const promise=new Promise(done=>resolve=done),current={promise,resolve,reads:0};active=current;return {get reads(){return current.reads;},release:()=>finish(current)};},
    release:()=>finish(active),
  };
}

export async function checkPackagedReplacementIntent(view,server,fixture,control){
  assert.equal(new URL(server).port,new URL(fixture.url).port);
  for(const name of ['rhvideo-client.js','rhvideo-workbench.js']){
    const text=await view.evaluate('fetch('+JSON.stringify('js/'+name)+').then(r=>r.text())'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(text),hash(fs.readFileSync(path.join(root,'src/js',name))),'Use the actual current '+name);
  }
  const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
  await invoke('category',{kind:'video'});await invoke('connection.connect',{server,username:'preview',password:'fixture-only'});
  for(const id of ['video-0','video-1'])await invoke('selection.toggle',{kind:'video',id,enabled:true});
  const cases=[];
  for(const scenario of ['reused-info','new-confirmation','client-connection','closed-settings','closed-connection','stage-closed-info']){
    await invoke('media.actions',{id:'video-0',kind:'video'});
    if(scenario==='closed-settings')await invoke('settings.open');
    if(scenario==='closed-connection')await invoke('connection.open');
    const gate=control.arm();
    try{
      await view.evaluate("window.__intentRefresh=RHFilesAPI.invoke('rhvideo.refresh').then(value=>({value}),error=>({error:String(error)}));true");
      await until(()=>gate.reads===1,'exactly one real held video metadata response');
      const name=scenario==='stage-closed-info'?'selection.stage':'replacement.selected',args=name==='selection.stage'?{}:{resolution:'1280x720',crf:30};
      await view.evaluate("window.__intentResult=null;window.__intentSelected=RHFilesAPI.invoke("+JSON.stringify('rhvideo.'+name)+","+JSON.stringify(args)+").then(value=>(window.__intentResult={value}),error=>(window.__intentResult={error:String(error)}));true");
      assert.equal(await view.evaluate('window.__intentResult'),null,'Metadata must remain held while the new user panel opens');
      let ticket;
      if(scenario==='reused-info')await invoke('playback.history');
      else if(scenario==='new-confirmation')ticket=(await invoke('replacement.submit',{ids:['video-2'],resolution:'1280x720',crf:30})).ticket;
      else if(scenario==='client-connection')await invoke('connection.open');
      else if(scenario==='closed-connection')await invoke('connection.close');
      else await invoke('panel.close',{id:scenario==='closed-settings'?'wb-settings':'wb-info'});
      assert.equal(await view.evaluate('window.__intentResult'),null,'The real held response must not have completed early');
      const closing=scenario.startsWith('closed-')||scenario==='stage-closed-info',target=['reused-info','stage-closed-info'].includes(scenario)?'wb-info':scenario==='new-confirmation'?'wb-confirm':scenario==='closed-settings'?'wb-settings':'connection-dialog';
      const before=await view.evaluate('({open:document.getElementById('+JSON.stringify(target)+').open,text:document.getElementById('+JSON.stringify(target)+').textContent})');assert.equal(before.open,!closing);
      gate.release();
      const old=await view.evaluate('window.__intentSelected'),refresh=await view.evaluate('window.__intentRefresh');
      console.log(JSON.stringify({checkpoint:'delayed-confirmation-result',scenario,result:old,confirmationOpen:await view.evaluate("!!document.querySelector('#wb-confirm[open]')")}));
      assert.equal(old.error,undefined);assert.equal(old.value.stale,true,'A late metadata read must not create/replace the newer confirmation');assert.equal(refresh.error,undefined);assert.equal(refresh.value.error,'');assert.equal(refresh.value.total,fixture.videos.length);
      assert.deepEqual(await view.evaluate('({open:document.getElementById('+JSON.stringify(target)+').open,text:document.getElementById('+JSON.stringify(target)+').textContent})'),before,'The new user panel must survive actual response completion unchanged');
      assert.equal(fixture.batches.length,0);
      if(ticket){await invoke('confirm.advance',{ticket});assert.equal(fixture.batches.length,0);await invoke('panel.close',{id:'wb-confirm'});await assert.rejects(invoke('confirm.advance',{ticket}),/失效/);}
      else {assert.equal(await view.evaluate("!!document.querySelector('#wb-confirm[open]')"),false);if(!closing)await invoke(scenario==='client-connection'?'connection.close':'panel.close',scenario==='client-connection'?{}:{id:'wb-info'});}
      assert.equal(fixture.trash.length,0,'Superseded selection-stage preparation cannot stage files');
      cases.push({scenario,heldReads:gate.reads,stale:true,writes:fixture.batches.length});console.log('Verified real delayed replacement intent: '+scenario);
    }finally{gate.release();}
  }
  // The normal flow must not invalidate itself when it opens/advances its own
  // dialog. Once accepted, a later modal must not cancel or replay the batch.
  const own=await invoke('replacement.selected',{resolution:'1280x720',crf:30});assert(own.ticket);assert.equal(fixture.batches.length,0);
  await invoke('confirm.advance',{ticket:own.ticket});assert.equal(fixture.batches.length,0);
  await invoke('confirm.advance',{ticket:own.ticket});assert.equal(fixture.batches.length,1);assert.deepEqual(fixture.batches[0].video_ids,['video-0','video-1']);
  await invoke('settings.open');await invoke('panel.close',{id:'wb-settings'});assert.equal(fixture.batches.length,1);await assert.rejects(invoke('confirm.advance',{ticket:own.ticket}),/失效/);
  assert.deepEqual((await invoke('ui.contract')).missing,[]);const state=await invoke('state');assert.equal(state.connected,true);assert.equal(new URL(state.server).href,new URL(server).href);
  return {cases,submittedBatches:fixture.batches.length,normalSelection:fixture.batches[0].video_ids};
}
