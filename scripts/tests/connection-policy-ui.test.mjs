import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {context,load,root} from '../testing/source.mjs';
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.classList={add(){}};this.attributes={};}
  get isConnected(){return this.connected||!!this.parent?.isConnected;}
  get textContent(){return (this.text||'')+this.children.map(n=>n.textContent).join('');}
  set textContent(v){this.replaceChildren();this.text=String(v);}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.text='';this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  async fire(k){for(const fn of this.listeners[k]||[])await fn({currentTarget:this});}
}
const all=n=>[n,...n.children.flatMap(all)];
test('both platforms ship the same diagnostic UI',()=>assert.equal(fs.readFileSync(path.join(root,'src/js/device-groups-ui.js'),'utf8'),fs.readFileSync(path.join(root,'android/web/js/device-groups-ui.js'),'utf8')));
for(const zh of [true,false])test(`diagnostics explain retry budgets and routes without starting probes (${zh?'Chinese':'English'})`,async()=>{
  const host=new Element('div');host.connected=true;
  const ctx=context({document:{createElement:tag=>new Element(tag)},settingsAutoSave:{flush:async()=>{},bind(){}}});load(ctx,'device-groups-ui.js');
  const calls=[];
  const call=async(command)=>{calls.push(command);if(command==='state')return {defaultDeviceName:'QA',groups:[]};if(command==='diagnostics')return [{outcome:'cooldown',startedAt:1,durationMs:4000,attempts:2,remainingMs:11000,retryAfterMs:2000,routeType:'tailscale_address',steps:[{method:'warm_retry',code:'bounded_transport_retry',durationMs:250}]}];throw Error(command);};
  await vm.runInContext('deviceGroupView',ctx).mount(host,{call,zh});
  const details=all(host).find(n=>n.tagName==='details');details.open=true;await details.fire('toggle');await new Promise(r=>setImmediate(r));
  assert.ok(host.textContent.includes('2/6'));assert.ok(host.textContent.includes('11000'));assert.ok(host.textContent.includes(zh?'不代表已确认直连或中继':'direct/relay path not determined'));assert.ok(host.textContent.includes(zh?'原预算':'same budget'));
  const refresh=all(host).find(n=>n.tagName==='button'&&n.textContent===(zh?'刷新记录（不重试）':'Refresh records (no retry)'));await refresh.fire('click');
  assert.deepEqual(calls,['state','diagnostics','diagnostics']);
});
