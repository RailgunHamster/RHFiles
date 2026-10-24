import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {context,deferred,plain,sourceRoot} from '../testing/source.mjs';

class Element {
  constructor(tag,text=''){this.tagName=tag;this.text=text;this.children=[];this.listeners={};this.value='';}
  get isConnected(){return this.connected||!!this.parent?.isConnected;}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  set textContent(value){this.replaceChildren();this.text=String(value);}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.text='';this.append(...nodes);}
  closest(tag){return this.tagName===tag?this:this.parent?.closest(tag);}
  after(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async fire(type){for(const fn of this.listeners[type]||[])await fn({currentTarget:this});}
}
const all=node=>[node,...node.children.flatMap(all)];
const click=(root,text)=>{const button=all(root).find(n=>n.tagName==='button'&&n.textContent===text);assert.ok(button,text);return button.fire('click');};
function fixture({name='',scan=()=>({uri:'qr'}),describe=uri=>({uri,deviceName:'RAILGUNHAMSTER',endpoints:['https://192.168.0.10:39128'],fingerprint:'ab'.repeat(32)}),devices=[]}={}){
  const root=new Element('form');root.connected=true;root.elements={};const calls=[];
  for(const key of ['name','pairing','type']){const label=new Element('label'),input=new Element('input');root.elements[key]=input;label.append(input);root.append(label);}
  root.elements.name.value=name;root.elements.type.value='rhfiles';
  const ctx=context({document:{body:root,createTextNode:value=>new Element('text',value)},MutationObserver:class{observe(){}disconnect(){}},
    ui:{el:(tag,cls,text)=>new Element(tag,text)},api:{native:async(command,args)=>{
      calls.push({command,args:args===undefined?null:plain(args)});
      if(command==='connection.scan')return scan();
      if(command==='connection.describe')return describe(args.uri);
      if(command==='lan.start')return 'scan-id';
      if(command==='lan.stop')return true;
      if(command==='lan.state')return {running:false,devices};
      if(command==='connection.compose')return 'legacy-composed';
      throw Error(command);
    }}});
  vm.runInContext(fs.readFileSync(path.join(sourceRoot,'android/web/js/rhfiles-connect.js'),'utf8'),ctx);
  vm.runInContext('rhFilesConnect',ctx).mount(root);return {root,calls};
}

test('computer QR fills its device name without using a generic RHFiles label',async()=>{
  const {root}=fixture();await click(root,'扫码连接电脑');
  assert.equal(root.elements.name.value,'RAILGUNHAMSTER');assert.equal(root.elements.pairing.value,'qr');
});
test('old QR falls back to its address rather than inventing a device name',async()=>{
  const {root}=fixture({describe:uri=>({uri,endpoints:['https://100.100.10.2:39128'],fingerprint:'ab'.repeat(32)})});
  await click(root,'扫码连接电脑');assert.equal(root.elements.name.value,'100.100.10.2');
});
test('rescanning updates an automatic name but never overwrites an edited label',async()=>{
  let number=0;const {root}=fixture({describe:uri=>({uri,deviceName:'PC-'+ ++number,endpoints:['https://192.168.0.10:39128'],fingerprint:'ab'.repeat(32)})});
  await click(root,'扫码连接电脑');await click(root,'扫码连接电脑');assert.equal(root.elements.name.value,'PC-2');
  // Even typing the same value explicitly makes it a user-owned label.
  await root.elements.name.fire('input');await click(root,'扫码连接电脑');assert.equal(root.elements.name.value,'PC-2');
  root.elements.name.value='书房电脑';await root.elements.name.fire('input');await click(root,'扫码连接电脑');
  assert.equal(root.elements.name.value,'书房电脑');
});
test('pasted pairing data uses the same name suggestions and preserves prefilled labels',async()=>{
  const first=fixture();first.root.elements.pairing.value='pasted-qr';await first.root.elements.pairing.fire('change');
  assert.equal(first.root.elements.name.value,'RAILGUNHAMSTER');
  const second=fixture({name:'我的备注'});second.root.elements.pairing.value='pasted-qr';await second.root.elements.pairing.fire('change');
  assert.equal(second.root.elements.name.value,'我的备注');
});
test('discovery retains the computer name when composing legacy pairing data',async()=>{
  const device={name:'CLAW',host:'192.168.0.11',port:39128,fingerprint:'ab'.repeat(32)};
  const {root,calls}=fixture({devices:[device],describe:uri=>({uri,endpoints:['https://192.168.0.11:39128'],fingerprint:device.fingerprint})});
  await click(root,'发现局域网电脑');await click(root,'选择这台电脑');await click(root,'填入配对信息');
  assert.equal(root.elements.name.value,'CLAW');assert.ok(calls.some(c=>c.command==='connection.compose'));
});
test('cancelled scans and closed forms do not change the label or pairing data',async()=>{
  const cancelled=fixture({name:'我的电脑',scan:()=>null});await click(cancelled.root,'扫码连接电脑');
  assert.equal(cancelled.root.elements.name.value,'我的电脑');assert.equal(cancelled.root.elements.pairing.value,'');
  const pending=deferred(),closed=fixture({scan:()=>pending.promise});const scan=click(closed.root,'扫码连接电脑');
  closed.root.connected=false;pending.resolve({uri:'qr'});await scan;assert.equal(closed.root.elements.name.value,'');
});
test('invalid QR data cannot overwrite a saved label or pairing value',async()=>{
  const {root}=fixture({name:'已写好的备注',describe:()=>{throw Error('无效配对信息');}});root.elements.pairing.value='original';
  await click(root,'扫码连接电脑');assert.equal(root.elements.name.value,'已写好的备注');assert.equal(root.elements.pairing.value,'original');
  assert.match(root.textContent,/无效配对信息/);
});
