import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {createRequire} from 'node:module';
import {context,load,plain,propertyOptions} from '../testing/source.mjs';
const require=createRequire(import.meta.url),Core=require('../../src/js/automation-core.js');
function fixture(extra={}){
  const writes=[],renders=[];
  const ctx=context({G:{settings:{}},document:{getElementById:()=>null},t:key=>key,RHFilesAutomationCore:Core,
    saveSettings:()=>writes.push(plain(ctx.G.settings)),...extra});
  load(ctx,'sidebar-order.js');
  ctx.applySidebarOrder=()=>renders.push('sidebar');ctx.renderSidebarOrderSettings=()=>renders.push('settings');
  return {ctx,writes,renders,defaults:plain(ctx.normalizeSidebarOrder())};
}
test('saved/imported partial orders append missing groups once and tolerate corrupt or obsolete IDs',()=>{
  const {ctx,defaults}=fixture();
  for(const value of [null,{},'recycle',42])assert.deepEqual(plain(ctx.normalizeSidebarOrder(value)),defaults);
  assert.deepEqual(plain(ctx.normalizeSidebarOrder(['recycle','unknown','recycle','devices'])),['recycle','devices',...defaults.filter(id=>!['recycle','devices'].includes(id))]);
  fc.assert(fc.property(fc.array(fc.oneof(fc.constantFrom(...defaults,'old-plugin'),fc.integer())),value=>{
    const result=plain(ctx.normalizeSidebarOrder(value));
    assert.deepEqual([...result].sort(),[...defaults].sort());
    assert.deepEqual(result.slice(0,new Set(value.filter(id=>defaults.includes(id))).size),[...new Set(value.filter(id=>defaults.includes(id)))]);
  }),propertyOptions());
});
test('whole-group changes persist in the backed-up settings, and reset restores defaults',()=>{
  const {ctx,writes,renders,defaults}=fixture();ctx.G.settings.otherSetting='kept';
  const result=plain(ctx.setSidebarOrder(['recycle','devices','quickAccess']));
  assert.deepEqual(result.order.slice(0,3),['recycle','devices','quickAccess']);
  assert.deepEqual(writes[0].sidebarSectionOrder,result.order);assert.equal(writes[0].otherSetting,'kept');
  assert.deepEqual(renders,['sidebar','settings']);assert.deepEqual(plain(ctx.resetSidebarOrder().order),defaults);
});
test('unknown and duplicate API IDs fail before changing storage or the UI',()=>{
  const {ctx,writes,renders}=fixture();
  for(const value of [null,{},['recycle','recycle'],['missing'],['__proto__']])assert.throws(()=>ctx.setSidebarOrder(value),error=>error.code==='INVALID_PARAMS');
  assert.throws(()=>ctx.moveSidebarGroup('recycle','missing'),error=>error.code==='INVALID_PARAMS');
  assert.equal(writes.length,0);assert.equal(renders.length,0);assert.equal(ctx.G.settings.sidebarSectionOrder,undefined);
});
test('storage errors retain the previously committed order and never move visible groups',()=>{
  const {ctx,renders}=fixture({saveSettings:()=>{throw Error('storage full');}});
  assert.throws(()=>ctx.setSidebarOrder(['recycle']),/storage full/);assert.equal('sidebarSectionOrder' in ctx.G.settings,false);
  ctx.G.settings.sidebarSectionOrder=['devices','favorites'];
  assert.throws(()=>ctx.setSidebarOrder(['recycle']),/storage full/);assert.deepEqual(ctx.G.settings.sidebarSectionOrder,['devices','favorites']);assert.equal(renders.length,0);
});
test('before/after movement retains hidden sections and all unrelated relative order',()=>{
  const {ctx,defaults,writes}=fixture();
  fc.assert(fc.property(fc.constantFrom(...defaults),fc.constantFrom(...defaults),fc.boolean(),(id,target,after)=>{
    ctx.G.settings.sidebarSectionOrder=[...defaults];const beforeWrites=writes.length;
    const result=plain(ctx.moveSidebarGroup(id,target,after).order);
    assert.deepEqual(result.filter(value=>value!==id),defaults.filter(value=>value!==id));
    if(id===target){assert.deepEqual(result,defaults);assert.equal(writes.length,beforeWrites);}
    else assert.equal(result.indexOf(id),result.indexOf(target)+(after?1:-1));
  }),propertyOptions());
});
test('applying an order moves existing group nodes with their children, focus and scroll intact',()=>{
  const {ctx}=fixture(),settings={sidebarSectionOrder:['recycle','devices','quickAccess']};
  const ids=[['tree','sidebar-tree-section'],['devices','device-group-section'],['quickAccess','quick-access-section'],['recycle','recycle-sidebar-section']];
  const nodes=new Map(ids.map(([id,elementId])=>[elementId,{id,children:[{originalListener:true}]}]));
  const fixed={id:'mode-controls'},sidebar={scrollTop:73,children:[fixed,...nodes.values()],contains:element=>element===focused,
    appendChild(node){this.children=this.children.filter(child=>child!==node);this.children.push(node);}};
  let refocused=false;const focused={focus:options=>{assert.equal(options.preventScroll,true);refocused=true;}};
  for(const node of nodes.values())node.parentElement=sidebar;
  const original=nodes.get('device-group-section').children[0];ctx.G.settings=settings;
  ctx.document={activeElement:focused,getElementById:id=>id==='sidebar'?sidebar:nodes.get(id)};
  load(ctx,'sidebar-order.js',['applySidebarOrder']);ctx.applySidebarOrder();
  assert.deepEqual(sidebar.children.map(node=>node.id),['mode-controls','recycle','devices','quickAccess','tree']);
  assert.equal(nodes.get('device-group-section').children[0],original);assert.equal(sidebar.scrollTop,73);assert(refocused);
});
