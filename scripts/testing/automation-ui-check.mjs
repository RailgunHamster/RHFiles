// Real Chromium DOM and callbacks. No synthetic mouse/keyboard is used by the API.
import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {browserFixture} from '../../android/web/tests/browser-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../src');
const fixture=await browserFixture(root,(req,res)=>{
  if(req.url!=='/fixture')return false;
  res.writeHead(200,{'Content-Type':'text/html'}).end(`<!doctype html><script src="/js/automation-core.js"></script>
    <div id="parent"><button id="child">callback</button></div><button id="inline" onclick="window.inlineCalls=(window.inlineCalls||0)+1">inline</button>
    <input id="name" required><input id="password" type="password" value="must-not-leak"><input id="check" type="checkbox"><select id="choice"><option value="a">A</option><option disabled value="b">B</option></select>
    <button id="disabled" disabled>disabled</button><button id="hidden" hidden>hidden</button><button id="remove" class="danger">Delete permanently</button>
    <details id="details"><summary id="summary">expand</summary><button id="inside">inside</button></details><input type="file" id="file"><video id="video"></video>`);return true;
});
const errors=[];let checks=0;
try{
  const page=await fixture.browser.newPage();page.on('pageerror',error=>errors.push(String(error)));await page.goto(fixture.url+'/fixture');
  const data=await page.evaluate(async()=>{
    const a=RHFilesAPI,u=RHFilesUI,$=id=>document.getElementById(id),out={};
    const id=name=>u.list({includeHidden:true}).find(e=>e.id===name).controlId;
    const call=(action,p)=>a.invoke(action,p);
    const error=async fn=>{try{await fn();return null;}catch(e){return e.code;}};
    const hits=[];
    u.listen($('parent'),'click',()=>hits.push('capture1'),true,'parent-capture1');
    u.listen($('parent'),'click',()=>hits.push('capture2'),true,'parent-capture2');
    u.listen($('child'),'click',function(){hits.push(this.id);},undefined,'child');
    u.listen($('parent'),'click',()=>hits.push('bubble'),false,'parent-bubble');
    await call('ui.invoke',{controlId:id('child')});out.order=hits.slice();
    hits.length=0;$('child').click();out.physical=hits.slice();
    await call('ui.invoke',{controlId:id('inline')});out.inline=window.inlineCalls;
    let replaced=0;u.assign($('inline'),'click',()=>replaced++,'replacement');await call('ui.invoke',{controlId:id('inline')});out.replaced=[replaced,window.inlineCalls];
    const temporary=()=>hits.push('once');u.listen($('child'),'contextmenu',temporary,{once:true},'once');
    await call('ui.invoke',{controlId:id('child'),event:'contextmenu'});await call('ui.invoke',{controlId:id('child'),event:'contextmenu'});out.once=hits.filter(h=>h==='once').length;
    let aborts=0;const controller=new AbortController();u.listen($('child'),'dblclick',()=>aborts++,{signal:controller.signal},'abort');controller.abort();await call('ui.invoke',{controlId:id('child'),event:'dblclick'});out.aborts=aborts;
    let removed=0;const f=()=>removed++;u.listen($('child'),'mouseup',f);u.remove($('child'),'mouseup',f);await call('ui.invoke',{controlId:id('child'),event:'mouseup'});out.removed=removed;
    const edits=[];u.listen($('name'),'input',()=>edits.push('input'));u.assign($('name'),'change',()=>edits.push('change'));
    await call('ui.set',{controlId:id('name'),value:'中文'});out.edits=edits;out.value=$('name').value;
    out.invalid=await error(()=>call('ui.set',{controlId:id('name'),value:''}));out.rollback=$('name').value;
    let checkbox=0;u.listen($('check'),'change',()=>checkbox++);await call('ui.set',{controlId:id('check'),checked:true});out.checkbox=[$('check').checked,checkbox];
    out.select=await error(()=>call('ui.set',{controlId:id('choice'),value:'b'}));out.selectValue=$('choice').value;
    out.disabled=await error(()=>call('ui.invoke',{controlId:id('disabled')}));out.hidden=await error(()=>call('ui.invoke',{controlId:id('hidden')}));
    out.password=u.list().find(e=>e.id==='password');out.file=await error(()=>call('ui.set',{controlId:id('file'),value:'anything'}));
    let deletes=0;u.assign($('remove'),'click',()=>deletes++,'destructive');const danger=u.list().find(e=>e.id==='remove');
    out.unconfirmed=await error(()=>call('ui.invoke',{controlId:danger.controlId}));await call('ui.invoke',{controlId:danger.controlId,acknowledge:true,confirmationToken:danger.confirmationToken});
    out.replay=await error(()=>call('ui.invoke',{controlId:danger.controlId,acknowledge:true,confirmationToken:danger.confirmationToken}));out.deletes=deletes;
    await call('ui.invoke',{controlId:id('summary')});out.expanded=$('details').open;
    const stale=id('inside');$('inside').remove();out.stale=await error(()=>call('ui.invoke',{controlId:stale}));
    $('child').dataset.path='/old-file';const originalId=id('child');$('child').dataset.path='/different-file';out.recycled=await error(()=>call('ui.invoke',{controlId:originalId}));out.newIdentity=id('child')!==originalId;
    await call('ui.media',{controlId:id('video'),command:'rate',value:1.5});out.rate=$('video').playbackRate;out.invalidRate=await error(()=>call('ui.media',{controlId:id('video'),command:'rate',value:99}));
    return out;
  });
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  equal(data.order,['capture1','capture2','child','bubble']);equal(data.physical,data.order);equal(data.inline,1);equal(data.replaced,[1,1]);equal(data.once,1);equal(data.aborts,0);equal(data.removed,0);
  equal(data.edits,['input','change']);equal(data.value,'中文');equal(data.invalid,'INVALID_PARAMS');equal(data.rollback,'中文');equal(data.checkbox,[true,1]);equal(data.select,'INVALID_PARAMS');equal(data.selectValue,'a');
  equal(data.disabled,'CONTROL_DISABLED');equal(data.hidden,'CONTROL_HIDDEN');equal(data.password.sensitive,true);equal('value'in data.password,false);equal(data.file,'INTERACTION_REQUIRED');
  equal(data.unconfirmed,'CONFIRMATION_REQUIRED');equal(data.replay,'CONFIRMATION_REQUIRED');equal(data.deletes,1);equal(data.expanded,true);equal(data.stale,'STALE_CONTROL');equal(data.recycled,'STALE_CONTROL');equal(data.newIdentity,true);equal(data.rate,1.5);equal(data.invalidRate,'INVALID_PARAMS');equal(errors,[]);
  console.log(JSON.stringify({pass:true,checks}));
}finally{await fixture.close();}
