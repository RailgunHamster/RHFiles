// Fault only one real native reply's delivery. The shipped workbench handlers,
// native operations, HTTP and decoder inputs remain the actual implementation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export const holdPresentationReplyScript=`(()=>{
 Object.defineProperty(window,'RHVideoWorkbench',{configurable:true,enumerable:true,set(value){
  const install=value.install;
  value.install=function(ctx){
   const original=ctx.native;window.__qaPresentationNative=original;
   window.__qaPresentationControls=[];
   ctx.native=(action,args)=>{
    const controls=window.__qaPresentationControls;
    const observation=action==='presentation.control'&&controls.length<64?{command:args.command,expectedInput:args.expectedInput,status:'pending'}:null;
    if(observation)controls.push(observation);
    const hold=action==='presentation.open'&&window.__qaHoldPresentationReply===true;
    if(hold)window.__qaHoldPresentationReply=false;
    return original(action,args).then(result=>{
     if(observation){observation.status='fulfilled';observation.inputId=result.inputId;}
     if(!hold)return result;
     window.__qaHeldPresentationInput=result.inputId;
     return new Promise(resolve=>{window.__qaReleasePresentationReply=()=>resolve(result);});
    },error=>{if(observation)observation.status='rejected';throw error;});
   };
   return install.call(this,ctx);
  };
  Object.defineProperty(window,'RHVideoWorkbench',{value,writable:true,configurable:true,enumerable:true});
 }});
})()`;

export function makePresentationMarkers(file){
 execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','color=c=black:size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf','drawbox=x=0:y=0:w=320:h=180:color=0xff0000:t=fill,drawbox=x=320:y=0:w=320:h=180:color=0x00ff00:t=fill,drawbox=x=0:y=180:w=320:h=180:color=0x0000ff:t=fill,drawbox=x=320:y=180:w=320:h=180:color=0xffff00:t=fill','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
}
export function fourPresentationMarkers(colors){return colors.length===4&&colors.every(([r,g,b],i)=>i===0?r>160&&g<90&&b<90:i===1?g>160&&r<90&&b<90:i===2?b>160&&r<90&&g<90:r>160&&g>160&&b<90);}

export async function exercisePresentationInputs({page,until,server,receipt,checkFrame,onPhase=()=>{}}){
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const native=(name,args={})=>page.evaluate('__qaPresentationNative('+JSON.stringify('presentation.'+name)+','+JSON.stringify(args)+')');
 const phase=name=>{receipt.phase=name;onPhase(name);};
 const summary=s=>Object.fromEntries(['opened','inputId','nativeSurface','renderedFrames','volume','positionMs','state','renderer'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
 phase('connect');await api('connection.connect',{server,username:'preview',password:'fixture-only'});
 await api('category',{kind:'video'});for(const id of ['video-1','video-0'])await api('favorite.toggle',{id,kind:'video'});
 await api('category',{kind:'picture'});await api('favorite.toggle',{id:'picture-0',kind:'picture'});await api('category',{kind:'favorite'});await api('sort',{value:'dateDesc'});
 const open=async()=>{await api('viewer.open',{mode:'slideshow',source:'favorite'});await api('viewer.toggle');const s=await api('viewer.state');assert.equal(s.current.kind,'picture');assert.equal(s.running,false);assert.equal(s.total,3);return s;};
 await open();receipt.trials=[];
 for(const variant of ['closed-viewer','same-viewer']){
  phase(variant+'.hold');
  await page.evaluate(`window.__qaReleasePresentationReply=null;window.__qaHeldPresentationInput=null;window.__qaOldPresentationOutcome=null;window.__qaHoldPresentationReply=true;window.__qaOldPresentationTransition=RHFilesAPI.invoke('rhvideo.viewer.step',{direction:1}).then(value=>window.__qaOldPresentationOutcome={value},error=>window.__qaOldPresentationOutcome={error:String(error)});true`);
  const held=await until(()=>page.evaluate('(()=>{if(__qaOldPresentationOutcome?.error)throw Error(__qaOldPresentationOutcome.error);return typeof __qaReleasePresentationReply==="function"?__qaHeldPresentationInput:null;})()'),variant+' real native open acknowledged but not delivered',15000);
  assert(Number.isSafeInteger(held)&&held>0,'Use the real decoder identity, not a file ID');
  if(variant==='closed-viewer'){await api('panel.close',{id:'wb-viewer'});await open();}
  else{const picture=await api('viewer.step',{direction:1});assert.equal(picture.index,0,'Fast Next reaches the real picture before the next video');}
  phase(variant+'.replace');await api('viewer.step',{direction:1});
  const before=await until(async()=>{const s=await native('state');return s.opened&&s.nativeSurface&&s.renderedFrames>0&&!s.error?s:null;},'replacement native input actually rendered',15000);
  assert(Number.isSafeInteger(before.inputId)&&before.inputId>0);assert.notEqual(before.inputId,held);
  const ui=await api('viewer.state');assert.equal(ui.current.id,'video-0');assert.equal(ui.running,false);assert.equal(ui.loading,false);
  phase(variant+'.release');await page.evaluate('__qaReleasePresentationReply();__qaOldPresentationTransition');
  const after=await native('state'),trial={variant,held,newInput:before.inputId,before:summary(before),after:summary(after)};receipt.trials.push(trial);
  assert.equal(after.opened,true,'A late original reply must not globally close the replacement');assert.equal(after.inputId,before.inputId);assert(!after.error);
  const outcome=await page.evaluate('__qaOldPresentationOutcome');assert.equal(outcome.error,undefined);assert.equal(outcome.value?.stale,true);
  const unchanged=await api('viewer.state');assert.equal(unchanged.token,ui.token);assert.equal(unchanged.index,ui.index);assert.equal(unchanged.current.id,ui.current.id);
  trial.frame=await checkFrame(variant+'-after-late-reply',after);
  phase(variant+'.stale-native-operations');
  trial.stale=[];
  for(const [action,args]of [['state',{}],['control',{command:'volume',value:100}],['bounds',{x:0,y:0,width:1,height:1,viewportWidth:800,opacity:0,visible:false}],['close',{}]]){
   const result=await native(action,{...args,expectedInput:held});trial.stale.push({action,stale:result.stale===true});assert.equal(result.stale,true,'Retired input cannot '+action+' the current presentation');
  }
  const final=await native('state');trial.final=summary(final);assert.equal(final.opened,true);assert.equal(final.inputId,before.inputId);assert.equal(final.volume,before.volume,'Stale gain cannot unmute another video');
  trial.finalFrame=await checkFrame(variant+'-after-stale-operations',final);
 }
 phase('close-current');await api('panel.close',{id:'wb-viewer'});assert.equal((await native('state')).opened,false);receipt.passed=true;phase('passed');
}
