// Shared actual-workbench scenario. Fault only delivery of one real native open
// acknowledgement; do not substitute native results or reorder product state.
import assert from 'node:assert/strict';
export const missingNativePlane=error=>/No visible owned player surface is present/.test(String(error));
export async function exercisePresentationModal({page,until,server,receipt,checkHidden,checkVisible}){
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const native=()=>page.evaluate('__qaPresentationNative("presentation.state")');
 await api('connection.connect',{server,username:'preview',password:'fixture-only'});
 await api('category',{kind:'video'});await api('favorite.toggle',{kind:'video',id:'video-0'});
 await api('category',{kind:'picture'});await api('favorite.toggle',{kind:'picture',id:'picture-0'});
 await api('category',{kind:'favorite'});await api('sort',{value:'dateDesc'});
 // Keep supported settings and enough picture time for the guarded operation.
 // This is a visibility scenario, not a performance/animation comparison.
 for(const [key,value]of [['favoriteStay',60],['favoriteFadeMs',100]])await api('preferences.set',{key,value});
 receipt.trials=[];
 for(const running of [false,true]){
  receipt.phase='open-'+(running?'running':'paused');
  await api('viewer.open',{mode:'slideshow',source:'favorite'});if(!running)await api('viewer.toggle');
  const initial=await api('viewer.state');assert.equal(initial.current.kind,'picture');assert.equal(initial.running,running);
  await page.evaluate(`window.__qaHoldPresentationReply=true;window.__qaReleasePresentationReply=null;window.__qaHeldPresentationInput=null;window.__qaModalTransition=RHFilesAPI.invoke('rhvideo.viewer.step',{direction:1});true`);
  const held=await until(()=>page.evaluate('typeof __qaReleasePresentationReply==="function"&&__qaHeldPresentationInput'),'real native open reply held',15000);
  assert(Number.isSafeInteger(held)&&held>0);
  await until(async()=>{const state=await native();return state.opened&&state.inputId===held&&state.renderedFrames>0&&!state.error;},'actual decoder produced a frame before delivering its acknowledgement',15000);
  await api('settings.open');assert.equal(await page.evaluate('document.getElementById("wb-settings")?.open'),true);
  receipt.phase='release-'+(running?'running':'paused');await page.evaluate('__qaReleasePresentationReply();__qaModalTransition');
  const state=await until(async()=>{const value=await native();return value.opened&&value.inputId===held&&!(value.playing===true||value.state===3)?value:null;},'native pause is actually acknowledged underneath settings',15000),trial={running,inputId:held,state};receipt.trials.push(trial);
  assert.equal(state.opened,true);assert.equal(state.inputId,held);assert(state.renderedFrames>0);assert(!state.error);
  assert.equal(await page.evaluate('document.getElementById("wb-settings")?.open'),true,'Late video cannot close the settings panel');
  trial.hidden=await checkHidden((running?'running':'paused')+'-settings',state);
  assert.equal(state.playing===true||state.state===3,false,'Native playback must remain paused underneath settings');
  // Script/keyboard playback intent must obey the same active panel as a
  // visible click. Observe acknowledgement of each REAL control, not a sleep
  // followed by a possibly earlier paused state.
  trial.toggles=[];
  for(let toggle=0;toggle<2;toggle++){
   const start=await page.evaluate('__qaPresentationControls.length');
   const changed=await api('viewer.toggle');
   const controls=await until(()=>page.evaluate(`(()=>{const rows=__qaPresentationControls.slice(${start});return rows.length&&rows.every(r=>r.status!=='pending')?rows:null;})()`),'actual native toggle delivery under settings',15000);
   assert.equal(controls.length,1);assert.equal(controls[0].status,'fulfilled');assert.equal(controls[0].inputId,held);
   const paused=await native();trial.toggles.push({running:changed.running,controls,state:paused});
   assert.equal(paused.playing===true||paused.state===3,false,'Changing playback intent cannot resume the hidden decoder under settings');
   assert.equal(await page.evaluate('document.getElementById("wb-settings")?.open'),true);
  }
  assert.equal((await api('viewer.state')).running,running,'Two intent changes restore the original user choice');
  await api('panel.close',{id:'wb-settings'});
  const restored=await until(async()=>{const s=await native();return s.opened&&s.inputId===held&&(s.playing===true||s.state===3)===running?s:null;},'closing settings restores the original playback intent',15000);
  trial.visible=await checkVisible((running?'running':'paused')+'-restored',restored);
  const ui=await api('viewer.state');assert.equal(ui.current.id,'video-0');assert.equal(ui.running,running);assert.equal(ui.index,1);
  await api('panel.close',{id:'wb-viewer'});assert.equal((await native()).opened,false);
 }
 receipt.passed=true;receipt.phase='passed';
}
