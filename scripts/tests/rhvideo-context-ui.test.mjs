import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';

const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),tree=parse(source,{ecmaVersion:'latest'}),functions=new Map(),actions=new Map();let toolbar;
function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='FunctionDeclaration')functions.set(node.id.name,node);
  if(node.type==='CallExpression'&&node.callee.name==='action'&&typeof node.arguments[0]?.value==='string')actions.set(node.arguments[0].value,node.arguments[2]);
  if(node.type==='CallExpression'&&node.callee.object?.name==='toolbar'&&node.callee.property?.name==='append'&&node.arguments.some(v=>v.arguments?.[1]?.value==='playlist.sequential'))toolbar=node;
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
}
walk(tree);
const text=node=>source.slice(node.start,node.end);
function context(){
  const nodes=[],toggle={dataset:{apiAction:'rhvideo.selection.mode'},setAttribute(key,value){this[key]=value;}},bar={},state={connected:true,view:'catalog',kind:'video'},scope=vm.createContext({state,rulesEditor:null,selectionMode:false,contextualControls:[],sort:{},galleryStatus:{},button:(label,name,args)=>{const node=name==='selection.mode'?toggle:{dataset:{apiAction:'rhvideo.'+name}};Object.assign(node,{label,args});nodes.push(node);return node;},toolbar:{append(){},querySelector:()=>toggle},$:()=>bar});
  assert(toolbar,'Execute the actual toolbar construction, not a duplicate policy fixture');
  for(const name of ['contextButton','syncContext'])vm.runInContext(text(functions.get(name)),scope);
  vm.runInContext(text(toolbar),scope);
  return {scope,state,nodes,toggle,bar,sync:scope.syncContext,visible:()=>nodes.filter(v=>!scope.toolbar.hidden&&!v.hidden).map(v=>v.label)};
}
test('video list exposes whole-list sequential playback and super playback, not a global mode selector',()=>{
  const c=context();c.sync();assert(c.visible().includes('按列表顺序连播'));assert(c.visible().includes('按列表顺序连播（超压）'));assert(!c.visible().includes('连续浏览'));assert(!c.visible().includes('分段连播'));assert(!c.visible().includes('多视频同屏'));
  assert(!toolbar.arguments.some(node=>node.callee?.name==='select'),'The standalone workflow entries must not be folded back into one mode dropdown');
});
test('pictures and favorites each retain their explicit continuous-browse and slideshow entries',()=>{
  const c=context();for(const kind of ['picture','favorite']){c.state.kind=kind;c.sync();assert(c.visible().includes('连续浏览'));assert(c.visible().includes('自动放映'));assert(!c.visible().some(label=>label.includes('连播')));}
  const continuous=c.nodes.find(n=>n.label==='连续浏览');assert.equal(continuous.dataset.apiAction,'rhvideo.browse.mode');assert.equal(continuous.args.mode,'strip');
});
test('novels do not advertise video or image playback and returning to video restores its actual controls',()=>{
  const c=context();c.state.kind='novel';c.sync();assert(!c.visible().some(v=>/连播|放映|连续浏览/.test(v)));c.state.kind='video';c.sync();assert(c.visible().includes('按列表顺序连播'));assert(!c.visible().includes('连续浏览'));
});
test('gallery keeps its independent controls and signed-out pages cannot show active media actions',()=>{
  const c=context();c.state.view='gallery';c.sync();assert.deepEqual(c.visible(),[]);c.state.view='catalog';c.state.connected=false;c.sync();assert.deepEqual(c.visible(),[]);assert.equal(c.bar.hidden,true);
});
test('selection mode is explicit, can start with zero selections, and exiting clears its selections',()=>{
  const c=context();let paints=0;c.scope.selected=new Set(['video:one']);c.scope.paintCards=()=>{paints++;c.sync();};const mode=vm.runInContext('('+text(actions.get('selection.mode'))+')',c.scope);
  assert.equal(mode({enabled:true}).visible,true);assert.equal(c.bar.hidden,false);assert.equal(c.toggle['aria-pressed'],'true');assert.equal(c.toggle.textContent,'退出多选');
  assert.equal(mode({enabled:true}).visible,true,'Explicit enable must not toggle off');assert.equal(mode({enabled:false}).count,0);assert.equal(c.bar.hidden,true);assert.equal(c.toggle['aria-pressed'],'false');assert.equal(paints,3);
  assert.equal(mode({}).visible,true);assert.equal(c.bar.hidden,false,'Entering an empty selection must not disappear on the next paint');
});
test('card clicks in selection mode toggle a selection instead of opening a player or reader',async()=>{
  const calls=[],scope=vm.createContext({selectionMode:false,selected:new Set(),I:{key:m=>m.kind+':'+m.id},invoke:async(name,args)=>{calls.push({name,args});return {count:1};}}),select=vm.runInContext('('+text(functions.get('selectCard'))+')',scope),media={id:'one',kind:'video'};
  assert.equal(select(media),null);scope.selectionMode=true;await select(media);assert.equal(calls[0].name,'selection.toggle');assert.equal(calls[0].args.enabled,true);scope.selected.add('video:one');await select(media);assert.equal(calls[1].args.enabled,false);
  const client=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');assert(client.includes("workbench?.selectCard(media)||invoke('media.open'"),'The real card handlers must use the mode-aware action, not just expose an unused helper');
});
test('programmatic selection and page selection both enter the same visible selection mode',()=>{
  const scope=vm.createContext({selectionMode:false,selected:new Set(),state:{items:[{id:'one',kind:'video'}]},I:{key:m=>m.kind+':'+m.id},paintCards(){}});
  const toggle=vm.runInContext('('+text(actions.get('selection.toggle'))+')',scope),page=vm.runInContext('('+text(actions.get('selection.page'))+')',scope);
  toggle({id:'one',kind:'video',enabled:true});assert.equal(scope.selectionMode,true);scope.selectionMode=false;page();assert.equal(scope.selectionMode,true);assert.equal(scope.selected.size,1);
});
test('registration reports success in the still-open login dialog without resetting a library or logging in',async()=>{
  const message={textContent:'',classList:{add(){},remove(){}}},calls=[],scope=vm.createContext({registrationBusy:false,register:{},ctx:{connectionVersion:()=>5,connectionCurrent:v=>v===5},$:()=>message,native:async(name,args)=>{calls.push({name,args});return {registered:true};}}),register=vm.runInContext('('+text(actions.get('account.register'))+')',scope);
  assert.equal((await register({server:'https://example.invalid',username:'new-user',password:'private-input'})).registered,true);assert.deepEqual(calls.map(v=>v.name),['register']);assert.equal(message.textContent,'注册成功，请登录');assert.equal(scope.register.disabled,false);assert.equal(scope.registrationBusy,false);
});
test('invalid registration is visible in its modal, not only in a notice hidden behind it',async()=>{
  const message={textContent:'',classList:{add(){},remove(){}}},scope=vm.createContext({registrationBusy:false,register:{},ctx:{connectionVersion:()=>5,connectionCurrent:v=>v===5},$:()=>message,native:()=>{throw Error('Invalid input reached the server');}}),register=vm.runInContext('('+text(actions.get('account.register'))+')',scope);
  await assert.rejects(register({server:'https://example.invalid',username:'x',password:'short'}),/用户名至少/);assert.match(message.textContent,/用户名至少/);assert.equal(scope.register.disabled,false);assert.equal(scope.registrationBusy,false);
});
test('a duplicate registration cannot run concurrently, and stale completion cannot overwrite another account dialog',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r),message={textContent:'',classList:{add(){},remove(){}}},scope=vm.createContext({registrationBusy:false,register:{},ctx:{connectionVersion:()=>5,connectionCurrent:v=>v===5},$:()=>message,native:()=>pending}),register=vm.runInContext('('+text(actions.get('account.register'))+')',scope),args={server:'https://example.invalid',username:'new-user',password:'private-input'},first=register(args);
  await assert.rejects(register(args),/正在提交/);scope.ctx.connectionCurrent=()=>false;message.textContent='new account';resolve({registered:true});assert.equal((await first).stale,true);assert.equal(message.textContent,'new account');assert.equal(scope.register.disabled,false);
  const activity=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoActivity.kt',import.meta.url),'utf8');assert(!activity.includes('listOf("connect","register","logout")'),'Registration cannot close Android native playback or revoke pending document export');
});
