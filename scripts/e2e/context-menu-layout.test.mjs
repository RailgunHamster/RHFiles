import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('real pointer follows a submenu row while the context menu animates and clamps', {timeout:60000}, async t=>{
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  try {
    for(const side of ['left','right']) {
      await app.evaluate(`(()=>{window.__layoutPicked=false;showMenuAt(${side==='left'?'100':'innerWidth-10'},innerHeight-10,[{label:'Generate as',icon:'document',submenu:[{label:'PDF',icon:'document',action:()=>window.__layoutPicked=true}]}]);contextMenu.animate([{transform:'translateY(100px)'},{transform:'none'}],{duration:350});})()`);
      await app.hover('.context-menu > .ctx-item');
      assert.equal(await app.evaluate("(()=>{const r=document.querySelector('.ctx-submenu').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),true,'submenu must flip/clamp inside the viewport');
      await app.click('.ctx-submenu > .ctx-item');
      await until(()=>app.evaluate('window.__layoutPicked'),'real submenu action after moving layout');
      assert.equal(await app.evaluate('document.querySelectorAll(".context-menu").length'),0);
    }
  } catch(error) {await app.screenshot('context-menu-layout-failure');throw error;}
});

test('PDF submenu remains reachable in a short viewport with a scrolling file menu', {timeout:60000}, async t=>{
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  try {
    const input=path.join(app.directory,'menu.md');fs.writeFileSync(input,'# Menu test');
    await app.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
    await app.evaluate(`navigateAddressInput(${JSON.stringify(input)},false)`);
    await app.evaluate(`(()=>{window.__menuTrace=[];const original=removeContextMenu;removeContextMenu=function(){__menuTrace.push(new Error('menu close').stack);return original()};})()`);
    await app.evaluate('showContextMenu(120,120,false)');
    await app.hover('.context-menu > .ctx-item:has(> .ctx-item-main > .ctx-icon-document)');
    assert.equal(await app.evaluate("(()=>{const menu=document.querySelector('.context-menu');return menu.scrollHeight>menu.clientHeight&&getComputedStyle(menu).overflowY==='auto'})()"),true,'fixture must exercise a real scrolling menu');
    await app.screenshot('context-menu-short-viewport-submenu');
    await app.click('.ctx-submenu .ctx-item:has(.ctx-icon-document)');
    await until(()=>app.evaluate("!!document.getElementById('markdown-pdf-start')"),'PDF dialog through the real clipped-menu pointer path');
  } catch(error) {
    await app.screenshot('context-menu-short-viewport-failure');
    fs.writeFileSync(path.join(app.artifactDir,'context-menu-state.json'),JSON.stringify(await app.evaluate(`({trace:window.__menuTrace,focus:document.hasFocus(),menus:[...document.querySelectorAll('.context-menu,.ctx-submenu')].map(el=>({rect:el.getBoundingClientRect().toJSON(),parent:el.parentElement.getBoundingClientRect().toJSON(),hover:el.matches(':hover'),styles:['position','backdropFilter','transform','overflowY'].map(p=>[p,getComputedStyle(el)[p]]),html:el.outerHTML}))})`),null,2));
    throw error;
  }
});
