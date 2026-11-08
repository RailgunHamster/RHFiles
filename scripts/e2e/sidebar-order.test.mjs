import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until,sleep} from '../testing/app-session.mjs';

test('sidebar groups drag as units, cancel safely, persist on reload and share settings/API controls',{timeout:120000},async t=>{
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  await app.send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await app.evaluate("setLang('zh');setInspectorMode('closed',false);true");
  const defaults=await app.evaluate("RHFilesAPI.invoke('sidebar.order.get')");
  assert.equal(defaults.sections.length,14);assert(defaults.sections.find(section=>section.id==='rhvideo').available);
  await app.evaluate("window.__sidebarDeviceNode=document.getElementById('device-group-settings');window.__sidebarQuickNode=document.querySelector('[data-nav=Downloads]');true");
  const before=await app.evaluate('({path:getTab().path,tab:G.activeTab,count:G.tabs.length})');
  async function startDrag(id,x,y){
    const from=await app.hover('[data-sidebar-grip="'+id+'"]');
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=10;i++)await app.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(x-from.x)*i/10,y:from.y+(y-from.y)*i/10,button:'left',buttons:1});
    await until(()=>app.evaluate("!!document.querySelector('.sidebar-group-drop-line')"),'group drag indication');
  }
  const destination=await app.evaluate("(()=>{const r=document.getElementById('device-group-section').getBoundingClientRect();return {x:r.right-12,y:r.top+2};})()");
  await startDrag('recycle',destination.x,destination.y);
  await app.screenshot('sidebar-group-drag');
  await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...destination,button:'left',clickCount:1});
  await until(()=>app.evaluate("sidebarOrderState().order.indexOf('recycle')+1===sidebarOrderState().order.indexOf('devices')"),'recycle moved as a group');
  assert.deepEqual(await app.evaluate('({path:getTab().path,tab:G.activeTab,count:G.tabs.length})'),before);
  assert.equal(await app.evaluate("__sidebarDeviceNode===document.getElementById('device-group-settings')&&__sidebarQuickNode===document.querySelector('[data-nav=Downloads]')"),true);
  assert.equal(await app.evaluate("document.getElementById('sidebar').children[0].id"),'sidebar-mode-bar');
  assert.equal(await app.evaluate("!!document.querySelector('.sidebar-group-ghost')||!!document.querySelector('.sidebar-group-drop-line')"),false);
  const moved=await app.evaluate('sidebarOrderState().order');
  // Escape and dropping outside the sidebar both cancel without writing.
  await startDrag('devices',destination.x,destination.y+100);
  await app.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await app.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...destination,button:'left',clickCount:1});
  assert.deepEqual(await app.evaluate('sidebarOrderState().order'),moved);
  await startDrag('devices',700,300);
  await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:700,y:300,button:'left',clickCount:1});
  assert.deepEqual(await app.evaluate('sidebarOrderState().order'),moved);
  // Near-edge scrolling stops when the gesture is canceled.
  await app.evaluate("document.getElementById('sidebar').scrollTop=0;true");
  const edge=await app.evaluate("(()=>{const r=document.getElementById('sidebar').getBoundingClientRect();return {x:r.right-12,y:r.bottom-4};})()");
  await startDrag('tree',edge.x,edge.y);await sleep(180);
  assert(await app.evaluate("document.getElementById('sidebar').scrollTop>0"));
  await app.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await app.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...edge,button:'left',clickCount:1});
  const scroll=await app.evaluate("document.getElementById('sidebar').scrollTop");await sleep(100);
  assert.equal(await app.evaluate("document.getElementById('sidebar').scrollTop"),scroll);
  assert.deepEqual(await app.evaluate('sidebarOrderState().order'),moved);
  await app.send('Page.reload');await until(()=>app.evaluate("G.startupReady===true&&!!document.querySelector('[data-sidebar-grip=recycle]')"),'restored sidebar configuration',45000);
  assert.deepEqual(await app.evaluate('sidebarOrderState().order'),moved);
  // Clicking the grip opens the configuration UI; arrow buttons save immediately.
  await app.click('[data-sidebar-grip="recycle"]');
  await until(()=>app.evaluate("document.getElementById('settings-page-appearance').classList.contains('active')"),'appearance settings');
  await app.click('[data-sidebar-order-id="recycle"] [data-order-step="-1"]');
  const adjusted=await app.evaluate('sidebarOrderState().order');assert.notDeepEqual(adjusted,moved);
  assert.deepEqual(await app.evaluate("JSON.parse(localStorage.getItem('rhfiles-settings')).sidebarSectionOrder"),adjusted);
  await app.screenshot('sidebar-order-settings');
  await app.click('#sidebar-order-reset');assert.deepEqual(await app.evaluate('sidebarOrderState().order'),defaults.order);
  await app.evaluate("RHFilesAPI.invoke('settings.close')");
  // Keyboard moves keep the handle focused, enabling repeated moves.
  await app.evaluate("const handle=document.querySelector('[data-sidebar-grip=recycle]');handle.scrollIntoView({block:'nearest'});handle.focus();true");
  for(let n=0;n<2;n++){await app.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp'});await app.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp'});}
  const keyboard=await app.evaluate('sidebarOrderState().order');assert.equal(keyboard.indexOf('recycle'),defaults.order.indexOf('recycle')-2);
  assert.equal(await app.evaluate('document.activeElement.dataset.sidebarGrip'),'recycle');
  await app.evaluate("RHFilesAPI.invoke('sidebar.order.reset')");
  await app.click('[data-nav="Downloads"]');await until(()=>app.evaluate("getTab().path===homeDir('Downloads')"),'quick access remains clickable');
  await app.screenshot('sidebar-group-restored');
  console.log('Sidebar ordering UI artifacts:',app.artifactDir);
});
