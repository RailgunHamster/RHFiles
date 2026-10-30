import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('physical modifier transitions never turn multi-selection shortcuts into double-Ctrl search', {timeout:180000}, async t=>{
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  t.diagnostic('Modifier/focus evidence: '+app.artifactDir);
  const folder=path.join(app.directory,'modifier-selection');fs.mkdirSync(folder);
  for(let i=0;i<5;i++)fs.writeFileSync(path.join(folder,`file${i}.txt`),'isolated fixture');
  await app.evaluate(`navigateTo(${JSON.stringify(folder)})`);
  await app.evaluate("G.settings.confirmRecycleDelete=true;window.__copiedPaths=null;copyPathsFromMenu=async paths=>{window.__copiedPaths=[...paths];return true};setLayout('details');true");
  const key=(type,key,code,vk,modifiers=0)=>app.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,modifiers,location:code==='ControlLeft'||code==='ShiftLeft'?1:0});
  const ctrl=(type)=>key(type,'Control','ControlLeft',17,type==='keyDown'?2:0);
  const selectTwo=async (list,layout)=>{
    const row=index=>`#${list} [data-index="${index}"]${layout==='details'?' .row-name':''}`;
    const reveal=index=>app.evaluate(`document.querySelector(${JSON.stringify(row(index))}).scrollIntoView({block:'nearest',inline:'nearest'});true`);
    await reveal(1);
    await app.click(row(1));
    await reveal(3);
    const point=await app.hover(row(3));
    await ctrl('keyDown');
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1,modifiers:2});
    await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1,modifiers:2});
    await ctrl('keyUp');
  };
  for(const right of [false,true]){
    if(right){await app.evaluate('toggleDualPane(true)');await until(()=>app.evaluate('G.rp.entries.length===5'),'right pane listing');}
    const list=right?'right-file-list':'file-list';
    const expected=[1,3].map(i=>path.join(folder,`file${i}.txt`));
    for(const layout of ['details','cards','thumbnails','columns']) {
      await app.evaluate(`setLayout(${JSON.stringify(layout)})`);
      await t.test(`${right?'right':'left'} ${layout}: Ctrl+click → Ctrl+Shift+C`,async()=>{
        await selectTwo(list,layout);
        await ctrl('keyDown'); await key('keyDown','Shift','ShiftLeft',16,10);
        await key('keyDown','C','KeyC',67,10);await key('keyUp','C','KeyC',67,10);
        await key('keyUp','Shift','ShiftLeft',16,2);await ctrl('keyUp');
        const state=await app.evaluate(`({copied:window.__copiedPaths,selected:getSelectedPaths(${right}).map(e=>e.path),focus:document.activeElement?.id})`);
        fs.writeFileSync(path.join(app.artifactDir,`${list}-${layout}-copy.json`),JSON.stringify(state,null,2));
        assert.deepEqual(state.selected,expected);
        assert.deepEqual(state.copied,expected,`Shortcut lost; focus=${state.focus}`);
        assert.equal(state.focus,list);
        await app.evaluate('window.__copiedPaths=null;true');
      });
      await t.test(`${right?'right':'left'} ${layout}: Ctrl+click → Ctrl+Delete`,async()=>{
        await selectTwo(list,layout);await ctrl('keyDown');
        await key('keyDown','Delete','Delete',46,2);await key('keyUp','Delete','Delete',46,2);await ctrl('keyUp');
        await until(()=>app.evaluate("!!document.querySelector('.app-confirm-message')"),'Delete confirmation',3000);
        assert.equal(await app.evaluate("document.querySelector('.app-confirm-message').textContent"),await app.evaluate("t('confirm.deleteItems',{count:2})"));
        await app.screenshot(`${list}-${layout}-delete-confirmation`);
        await app.click('.app-confirm-overlay .dialog-btn:not(.danger)');
        assert.deepEqual(await app.evaluate(`getSelectedPaths(${right}).map(e=>e.path)`),expected);
      });
    }
  }
  await t.test('two clean Ctrl taps still open search, only on release',async()=>{
    await app.evaluate("setLayout('details')");
    await app.click('#file-list [data-index="1"] .row-name');
    await ctrl('keyDown');await ctrl('keyUp');await ctrl('keyDown');
    assert.equal(await app.evaluate('document.activeElement.id'),'file-list');
    await ctrl('keyUp');assert.equal(await app.evaluate('document.activeElement.id'),'filter-input');
  });
  assert.equal(fs.readdirSync(folder).length,5,'Confirmation-only test must not delete any fixture files');
});
