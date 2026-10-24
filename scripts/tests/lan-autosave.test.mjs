import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {context,load,plain,deferred,root} from '../testing/source.mjs';

class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.listeners={};this.checked=false;this.hidden=false;this.classList={add(){}};}
  get isConnected(){return this.connected||!!this.parent?.isConnected;}
  get textContent(){return (this.text||'')+this.children.map(node=>node.textContent).join('');}
  set textContent(value){this.replaceChildren();this.text=String(value);}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.text='';this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async fire(type){for(const fn of this.listeners[type]||[])await fn({currentTarget:this});}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
}
const all=node=>[node,...node.children.flatMap(all)];
const labeled=(node,label)=>all(node).find(n=>n.tagName==='label'&&n.children[0]?.textContent===label)?.children[1];
const change=(field,value)=>{assert.ok(field,'checkbox exists');field.checked=value;return field.fire('change');};
function sandbox(extra={}){
  const host=new Element('div');host.connected=true;
  const ctx=context({document:{createElement:tag=>new Element(tag)},...extra});load(ctx,'settings-autosave.js');
  return {host,ctx,autosave:vm.runInContext('settingsAutoSave',ctx)};
}
test('rapid checkbox changes are saved in order, including both grants',async()=>{
  const {host,autosave}=sandbox(),write=new Element('input'),remove=new Element('input'),first=deferred(),second=deferred(),seen=[],states=[];
  autosave.bind({root:host,fields:{write,delete:remove},id:'test',status:state=>states.push(state),save:value=>{seen.push(plain(value));return seen.length===1?first.promise:second.promise;}});
  const a=change(write,true);await Promise.resolve();const b=change(remove,true);await Promise.resolve();
  assert.deepEqual(seen,[{write:true,delete:false}]);first.resolve();await a;
  assert.deepEqual(seen,[{write:true,delete:false},{write:true,delete:true}]);assert.equal(states.at(-1),'saving');
  second.resolve();await b;await autosave.flush(host);assert.equal(states.at(-1),'saved');assert.ok(write.checked&&remove.checked);
});
test('a failed last autosave restores the last successful value and reports the error',async()=>{
  const {host,autosave}=sandbox(),field=new Element('input'),states=[];let calls=0;
  autosave.bind({root:host,fields:{write:field},id:'test',status:(...state)=>states.push(state),save:async()=>{if(++calls===2)throw Error('disk is read-only');}});
  await change(field,true);await change(field,false);assert.equal(field.checked,true);assert.deepEqual(states.at(-1),['error','disk is read-only']);
});
test('an old failed request never clears a newer selection or its saved status',async()=>{
  const {host,autosave}=sandbox(),write=new Element('input'),remove=new Element('input'),first=deferred(),seen=[],states=[];
  autosave.bind({root:host,fields:{write,delete:remove},id:'test',status:state=>states.push(state),save:value=>{seen.push(plain(value));return seen.length===1?first.promise:Promise.resolve();}});
  const a=change(write,true);await Promise.resolve();const b=change(remove,true);first.reject(Error('transient failure'));await a;await b;
  assert.ok(write.checked&&remove.checked);assert.equal(states.at(-1),'saved');assert.ok(!states.includes('error'));
});
test('refresh waits for descendant settings writes, including newly queued changes',async()=>{
  const {host,autosave}=sandbox(),child=new Element('div'),field=new Element('input'),first=deferred(),second=deferred();host.append(child);let calls=0,flushed=false;
  autosave.bind({root:child,fields:{write:field},id:'test',save:()=>++calls===1?first.promise:second.promise});
  const a=change(field,true),flush=autosave.flush(host).then(()=>flushed=true);const b=change(field,false);
  first.resolve();await a;assert.equal(flushed,false);second.resolve();await b;await flush;assert.equal(flushed,true);
});
function lanFixture({intercept=()=>{},shares=true}={}){
  const model={config:{shares:shares?[{name:'Files',path:'C:/fixture'}]:[],port:39128,autoStart:false,newDevicePermissions:{write:false,delete:false}},startup:{supported:true,loginEnabled:false},status:{running:true,endpoints:[],fingerprint:'0123456789ab',certificatePem:'',devices:[{id:'phone',name:'Existing phone',permissions:{write:false,delete:false}}]}};
  const calls=[],fixture=sandbox({_lang:'zh',getTab:()=>({path:''}),deviceGroupView:{mount:async()=>{}},btoa:value=>Buffer.from(value).toString('base64'),writeTextClipboard:async()=>true,call:async(command,args)=>{
    calls.push({command,args:plain(args)});await intercept(command,args);
    if(command==='lan_service_state')return plain(model);
    if(command==='lan_service_defaults'){model.config.newDevicePermissions=plain(args.permissions);return null;}
    if(command==='lan_service_startup'){if(args.autoStart&&!model.config.shares.length)throw Error('Configure and start shared folders first');model.config.autoStart=args.autoStart;model.startup.loginEnabled=args.login;return null;}
    if(command==='lan_service_permissions'){model.status.devices.find(d=>d.id===args.id).permissions=plain(args.permissions);return null;}
    if(command==='lan_service_pair')return {qrSvg:'<svg/>',code:'0123456789',fingerprint:'0123456789ab',connectionUri:'test-only'};
    throw Error(command);
  }});
  load(fixture.ctx,'lan-service.js');return {...fixture,model,calls,service:vm.runInContext('lanService',fixture.ctx)};
}
const defaultsWrite='允许新设备写入、重命名',defaultsDelete='允许新设备永久删除文件',restore='启动 RHFiles 时恢复文件服务',login='Windows 登录后在托盘自动启动';
test('new-device defaults survive refresh without modifying existing-device grants',async()=>{
  const {host,service,model,calls}=lanFixture();await service.mount(host);
  await change(labeled(host,defaultsWrite),true);await change(labeled(host,defaultsDelete),true);await service.mount(host);
  assert.equal(labeled(host,defaultsWrite).checked,true);assert.equal(labeled(host,defaultsDelete).checked,true);
  assert.deepEqual(model.status.devices[0].permissions,{write:false,delete:false});assert.equal(calls.filter(c=>c.command==='lan_service_permissions').length,0);
  assert.ok(!all(host).some(n=>n.tagName==='button'&&n.textContent.startsWith('保存')));
});
test('refresh during an in-flight autosave reads the saved value, not a stale snapshot',async()=>{
  const pending=deferred();const {host,service}=lanFixture({intercept:command=>command==='lan_service_defaults'?pending.promise:undefined});await service.mount(host);
  const save=change(labeled(host,defaultsWrite),true),refresh=service.mount(host);pending.resolve();await save;await refresh;
  assert.equal(labeled(host,defaultsWrite).checked,true);
});
test('reopening settings with a replacement host waits for detached-form saves too',async()=>{
  const pending=deferred(),{host,service,calls}=lanFixture({intercept:command=>command==='lan_service_defaults'?pending.promise:undefined});await service.mount(host);
  const save=change(labeled(host,defaultsWrite),true);host.connected=false;const replacement=new Element('div');replacement.connected=true;
  const reopen=service.mount(replacement);await Promise.resolve();assert.equal(calls.filter(c=>c.command==='lan_service_state').length,1);
  pending.resolve();await save;await reopen;assert.equal(labeled(replacement,defaultsWrite).checked,true);
});
test('saving existing-device grants does not recreate the form or clear other drafts',async()=>{
  const {host,service,model}=lanFixture();await service.mount(host);const card=host.children[0],draft=labeled(host,'WebDAV 账号备注');draft.value='Unfinished label';
  const device=all(host).find(n=>n.tagName==='h3'&&n.textContent==='Existing phone').parent;
  await change(labeled(device,'允许写入、重命名'),true);await change(labeled(device,'允许永久删除'),true);
  assert.equal(host.children[0],card);assert.equal(draft.value,'Unfinished label');assert.deepEqual(model.status.devices[0].permissions,{write:true,delete:true});
});
test('startup toggles autosave their linked state and persist after refresh',async()=>{
  const {host,service,model}=lanFixture();await service.mount(host);
  await change(labeled(host,login),true);assert.equal(labeled(host,restore).checked,true);assert.equal(model.config.autoStart,true);assert.equal(model.startup.loginEnabled,true);
  await service.mount(host);assert.equal(labeled(host,login).checked,true);await change(labeled(host,restore),false);
  assert.equal(labeled(host,login).checked,false);assert.equal(model.config.autoStart,false);assert.equal(model.startup.loginEnabled,false);
});
test('startup save failure restores both linked checkboxes with a visible error',async()=>{
  const {host,service,model}=lanFixture({shares:false});await service.mount(host);await change(labeled(host,login),true);
  assert.equal(labeled(host,login).checked,false);assert.equal(labeled(host,restore).checked,false);assert.equal(model.config.autoStart,false);assert.match(host.textContent,/保存失败.*Configure and start/);
});
test('pairing waits for defaults autosave and receives the committed grants',async()=>{
  const pending=deferred(),{host,service,calls}=lanFixture({intercept:command=>command==='lan_service_defaults'?pending.promise:undefined});await service.mount(host);
  const save=change(labeled(host,defaultsWrite),true),pair=all(host).find(n=>n.tagName==='button'&&n.textContent==='生成手机配对码').fire('click');
  assert.ok(!calls.some(c=>c.command==='lan_service_pair'));pending.resolve();await save;await pair;
  assert.deepEqual(calls.find(c=>c.command==='lan_service_pair').args.permissions,{write:true,delete:false});
});
test('device-group local grants autosave without a separate button or member-list repaint',async()=>{
  const {host,ctx}=sandbox(),group={id:'group',name:'Home',enabled:false,permissions:{write:false,delete:false},members:[]},calls=[];let fail=false;
  load(ctx,'device-groups-ui.js');const view=vm.runInContext('deviceGroupView',ctx);
  await view.mount(host,{zh:true,deviceName:'Fixture',call:async(command,args)=>{
    if(command==='state')return {deviceId:'self',groups:[plain(group)]};
    if(command==='configure'){calls.push(plain(args));if(fail)throw Error('cannot save');group.enabled=args.enabled;group.permissions=plain(args.permissions);return true;}
    throw Error(command);
  }});
  const card=all(host).find(n=>n.tagName==='section');await change(labeled(card,'向此组开放本机文件服务'),true);await change(labeled(card,'允许写入、重命名'),true);
  assert.deepEqual(calls.at(-1),{id:'group',enabled:true,permissions:{write:true,delete:false}});assert.ok(host.contains(card));
  fail=true;await change(labeled(card,'允许永久删除'),true);assert.equal(labeled(card,'允许永久删除').checked,false);assert.match(host.textContent,/保存失败.*cannot save/);
  assert.ok(!all(host).some(n=>n.tagName==='button'&&n.textContent==='保存本机组权限'));
});
for(const [label,systemName,fallback]of [['computer','WINSERVER','我的电脑'],['phone','Moto 工作手机','我的手机'],['old backend',null,'Fixture']]){
  test('device-group form uses the local '+label+' name without overwriting manual input',async()=>{
    const {host,ctx}=sandbox(),calls=[],state={deviceId:'self',defaultDeviceName:systemName,groups:[]};
    load(ctx,'device-groups-ui.js');const view=vm.runInContext('deviceGroupView',ctx);
    await view.mount(host,{zh:true,deviceName:fallback,call:async(command,args)=>{
      calls.push({command,args:plain(args)});
      if(command==='state')return plain(state);
      if(command==='request')return {uri:'test-public-request'};
      if(command==='create')return 'group';
      throw Error(command);
    }});
    const name=labeled(host,'设备名称');assert.equal(name.value,systemName||fallback);
    await all(host).find(n=>n.tagName==='button'&&n.textContent==='创建新设备组').fire('click');
    assert.equal(calls.find(c=>c.command==='create').args.deviceName,systemName||fallback);
    name.value='用户自定义的名字';
    await all(host).find(n=>n.tagName==='button'&&n.textContent==='生成本机入组请求').fire('click');
    assert.equal(calls.find(c=>c.command==='request').args.deviceName,'用户自定义的名字');
    assert.equal(name.value,'用户自定义的名字');
  });
}

test('scanning group approval preserves the local phone name, including an edited name',async()=>{
  const {host,ctx}=sandbox(),calls=[];
  load(ctx,'device-groups-ui.js');const view=vm.runInContext('deviceGroupView',ctx);
  await view.mount(host,{mobile:true,deviceName:'我的手机',scan:async()=>({uri:'public-group-approval',deviceName:'CLAW'}),call:async(command,args)=>{
    calls.push({command,args:plain(args)});
    if(command==='state')return {deviceId:'self',defaultDeviceName:'Moto 工作手机',groups:[]};
    if(command==='request')return {uri:'public-phone-request'};
    throw Error(command);
  }});
  const scan=all(host).find(n=>n.tagName==='button'&&n.textContent==='扫码填写');
  await scan.fire('click');assert.equal(labeled(host,'设备名称').value,'Moto 工作手机');
  assert.equal(labeled(host,'粘贴入组请求或批准信息').value,'public-group-approval');
  labeled(host,'设备名称').value='我的自定义手机';await scan.fire('click');
  await all(host).find(n=>n.tagName==='button'&&n.textContent==='生成本机入组请求').fire('click');
  assert.equal(calls.find(c=>c.command==='request').args.deviceName,'我的自定义手机');
});
test('desktop and Android share identical autosave/group implementations loaded in dependency order',()=>{
  for(const name of ['settings-autosave.js','device-groups-ui.js'])assert.ok(fs.readFileSync(path.join(root,'src/js',name)).equals(fs.readFileSync(path.join(root,'android/web/js',name))),name);
  for(const page of ['src/index.html','android/web/index.html']){const source=fs.readFileSync(path.join(root,page),'utf8');assert.ok(source.indexOf('js/settings-autosave.js')<source.indexOf('js/device-groups-ui.js'));}
});

for(const outcome of ['confirmed','cancelled','failed']){
  test('forget-group UI '+outcome+' only removes the selected local group after confirmation',async()=>{
    const {host,ctx}=sandbox(),calls=[],other={id:'other',name:'Other group',enabled:true,permissions:{},members:[]};
    let groups=[{id:'group',name:'Home group',enabled:true,permissions:{},members:[{id:'self',name:'Self',self:true,blocked:true}]},other],cleaned;
    load(ctx,'device-groups-ui.js');const view=vm.runInContext('deviceGroupView',ctx);
    await view.mount(host,{zh:true,confirm:async message=>{assert.match(message,/Home group/);assert.match(message,/不会删除实际文件/);return outcome!=='cancelled';},forgotten:result=>{cleaned=plain(result);},call:async(command,args)=>{
      if(command==='state')return {deviceId:'self',groups:plain(groups)};
      calls.push({command,args:plain(args)});
      if(command==='forget'){if(outcome==='failed')throw Error('disk full');groups=groups.filter(g=>g.id!==args.id);return {removedLocations:['generated-location']};}
      throw Error(command);
    }});
    const card=all(host).find(n=>n.tagName==='section'&&n.textContent.includes('Home group'));
    await all(card).find(n=>n.tagName==='button'&&n.textContent==='删除本机设备组').fire('click');
    if(outcome==='confirmed'){
      assert.deepEqual(calls,[{command:'forget',args:{id:'group',confirmed:true}}]);assert.ok(!host.textContent.includes('Home group'));assert.ok(!all(host).some(n=>n.tagName==='button'&&n.textContent==='手动恢复'));assert.deepEqual(cleaned,{removedLocations:['generated-location']});
    }else{assert.ok(host.textContent.includes('Home group'));assert.equal(cleaned,undefined);if(outcome==='failed')assert.match(host.textContent,/disk full/);else assert.deepEqual(calls,[]);}
    assert.ok(host.textContent.includes('Other group'));
  });
}

test('forget-group is a destructive semantic operation with explicit id and confirmation',async()=>{
  const {ctx}=sandbox(),operations=new Map(),calls=[];load(ctx,'device-groups-ui.js');
  vm.runInContext('deviceGroupView',ctx).register({register:(id,fn,schema)=>operations.set(id,{fn,schema})},(name,args)=>calls.push({name,args:plain(args)}),true);
  const op=operations.get('groups.forget');assert.ok(op);assert.equal(op.schema.risk,'destructive');assert.deepEqual(plain(op.schema.params.required),['id','confirmed']);assert.equal(op.schema.params.additionalProperties,false);
  await op.fn({id:'group',confirmed:true});assert.deepEqual(calls,[{name:'forget',args:{id:'group',confirmed:true}}]);
});
