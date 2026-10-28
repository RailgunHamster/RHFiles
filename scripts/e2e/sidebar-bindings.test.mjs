import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';

test('real sidebar clicks retain Ctrl/middle behavior and registered UI actions without opening user data',async()=>{
  const app=await launchApp({emulateFocus:true});
  try{
    await app.evaluate("window.__sidebarCalls=[];window.__sidebarEvents=[];for(const type of ['mousedown','mouseup','click','auxclick'])document.addEventListener(type,event=>__sidebarEvents.push({type,button:event.button,target:event.target.closest('[id]')?.id}),true);window.openRecycleBin=(pane,newTab)=>{__sidebarCalls.push({kind:'recycle',pane:pane??null,newTab:!!newTab});return Promise.resolve({opened:true});};window.__sidebarInvoke=RHFilesAPI.invoke;RHFilesAPI.invoke=(name,args)=>name==='devices.settings'?(__sidebarCalls.push({kind:'groups'}),Promise.resolve({opened:true})):__sidebarInvoke(name,args);true");
    const point=async id=>{
      await app.evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
      await app.evaluate(`(()=>{const n=document.getElementById(${JSON.stringify(id)});if(n.hasAttribute('onclick')||n.hasAttribute('onauxclick'))throw Error('Legacy inline callback retained');})()`);
      return app.hover('#'+id);
    };
    for(const [button,modifiers,newTab]of [['left',0,false],['left',2,true],['middle',0,true]]){
      const xy=await point('sidebar-recycle'),before=await app.evaluate('__sidebarCalls.length');
      await app.send('Input.dispatchMouseEvent',{type:'mousePressed',button,buttons:button==='middle'?4:1,modifiers,clickCount:1,...xy});await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',button,modifiers,clickCount:1,...xy});
      let calls;try{calls=await until(async()=>{const value=await app.evaluate('__sidebarCalls');return value.length>before?value:null;},'real '+button+' sidebar callback');}catch(error){throw Error(error.message+' '+JSON.stringify(await app.evaluate('__sidebarEvents')),{cause:error});}assert.equal(calls.length,before+1);assert.deepEqual(calls.at(-1),{kind:'recycle',pane:null,newTab});
    }
    const group=await point('device-group-settings');await app.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...group});await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...group});
    await until(()=>app.evaluate("__sidebarCalls.at(-1)?.kind==='groups'"),'real group sidebar click');
    const controls=await app.evaluate("RHFilesAPI.invoke('ui.list').then(rows=>rows.filter(row=>['sidebar-recycle','device-group-settings'].includes(row.id)))");assert.equal(controls.length,2);for(const control of controls)assert(control.events.includes('click'));
    await app.evaluate(`RHFilesAPI.invoke('ui.invoke',{controlId:${JSON.stringify(controls.find(row=>row.id==='device-group-settings').controlId)}})`);assert.equal(await app.evaluate("__sidebarCalls.filter(v=>v.kind==='groups').length"),2);
  }finally{await app.close();}
});
