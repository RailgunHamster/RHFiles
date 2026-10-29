import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp, until} from '../testing/app-session.mjs';

test('physical multi-selection and shortcuts use the complete active-pane selection', {timeout:180000}, async t=>{
  const app=await launchApp({emulateFocus:true});t.after(()=>app.close());
  t.diagnostic('Multi-selection evidence: '+app.artifactDir);
  const folder=path.join(app.directory,'files');fs.mkdirSync(folder);
  for(let i=0;i<12;i++)fs.writeFileSync(path.join(folder,`file${String(i).padStart(2,'0')}.txt`),'test');
  await app.evaluate(`navigateTo(${JSON.stringify(folder)})`);
  // Capture only the clipboard boundary, not the selection/action handlers.
  // Do not overwrite the user's clipboard while testing actual key dispatch.
  await app.evaluate('window.__rhfilesSuppressNativeClipboard=true;window.__copiedPaths=null;copyPathsFromMenu=async paths=>{window.__copiedPaths=[...paths];return true};true');
  const press=async(key,code,vk,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await app.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,modifiers});
  };
  const click=async(selector,modifiers=0)=>{
    await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'});true`);
    const point=await app.hover(selector);
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1,modifiers});
    await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1,modifiers});
  };
  const selection=isRight=>app.evaluate(`getSelectedPaths(${isRight}).map(entry=>entry.path).sort()`);
  for(const isRight of [false,true]){
    if(isRight){await app.evaluate('toggleDualPane(true)');await until(()=>app.evaluate('G.rp.entries.length===12'),'right pane listing');}
    const listId=isRight?'right-file-list':'file-list';
    for(const layout of ['details','cards','thumbnails','columns'])await t.test(`${isRight?'right':'left'} ${layout}: Ctrl+click, copy paths, Delete`,async()=>{
      await app.evaluate(`(()=>{const pane=${isRight?'G.rp':'getTab()'};sortStateEntries(pane,'name',true);pane.sortF='name';pane.sortAsc=true;setLayout(${JSON.stringify(layout)});return true})()`);
      const row=index=>`#${listId} [data-index="${index}"]`;
      await until(()=>app.evaluate(`!!document.querySelector(${JSON.stringify(row(1))})`),'rendered row');
      await click(row(1));await click(row(3),2);
      const expected=[path.join(folder,'file01.txt'),path.join(folder,'file03.txt')].sort();
      assert.deepEqual(await selection(isRight),expected,'Ctrl+click must keep both selected files');
      await press('C','KeyC',67,2|8);
      await until(()=>app.evaluate('window.__copiedPaths!==null'),'copy paths dispatched');
      assert.deepEqual((await app.evaluate('window.__copiedPaths')).sort(),expected);
      await app.evaluate('window.__copiedPaths=null;true');
      await press('Delete','Delete',46,2); // Ctrl may remain down after Ctrl+click.
      await until(()=>app.evaluate("!!document.querySelector('.app-confirm-message')"),'Delete confirmation');
      assert.equal(await app.evaluate("document.querySelector('.app-confirm-message').textContent"),await app.evaluate("t('confirm.deleteItems',{count:2})"));
      await app.screenshot(`${isRight?'right':'left'}-${layout}-delete-multiple`);
      await app.click('.app-confirm-overlay .dialog-btn:not(.danger)');
      assert.deepEqual(await selection(isRight),expected,'Cancelling must preserve the selection');
      for(const [key,op]of [['c','copy'],['x','cut']]){
        await press(key,'Key'+key.toUpperCase(),key.toUpperCase().charCodeAt(0),2);
        await until(()=>app.evaluate(`G.clipboard?.op===${JSON.stringify(op)}`),'clipboard operation');
        assert.deepEqual((await app.evaluate('[...G.clipboard.paths]')).sort(),expected);
        assert.deepEqual(await selection(isRight),expected);
      }
      const otherBefore=await selection(!isRight);
      await click(row(1));await click(row(3),8);
      assert.equal((await selection(isRight)).length,3,'Shift+click must select the visible range');
      await press('a','KeyA',65,2);assert.equal((await selection(isRight)).length,12);
      await press('C','KeyC',67,2|8);
      assert.equal((await app.evaluate('window.__copiedPaths')).length,12);
      await app.evaluate('window.__copiedPaths=null;true');
      assert.deepEqual(await selection(!isRight),otherBefore,'Shortcuts must not alter the other pane');
      await app.evaluate(isRight?"paneSortBy('right','name')":"sortBy('name')");
      await press('C','KeyC',67,2|8);
      assert.equal((await app.evaluate('window.__copiedPaths')).length,12,'Sorting must preserve the complete selection');
      await app.evaluate('window.__copiedPaths=null;true');
    });
  }
  for(const isRight of [false,true])await t.test(`${isRight?'right':'left'}: quick marquee release followed immediately by copy paths and Delete`,async()=>{
    const listId=isRight?'right-file-list':'file-list';
    await app.evaluate(`setLayout('details');document.getElementById(${JSON.stringify(listId)}).scrollTop=0;true`);
    await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const points=await app.evaluate(`(()=>{const list=document.getElementById(${JSON.stringify(listId)}),bounds=list.getBoundingClientRect(),a=list.querySelector('[data-index="0"]').getBoundingClientRect(),b=list.querySelector('[data-index="3"]').getBoundingClientRect();return {from:{x:bounds.right-3,y:a.top+2},to:{x:bounds.right-90,y:b.bottom-2}}})()`);
    const expected=await app.evaluate(`${isRight?'G.rp':'getTab()'}.entries.slice(0,4).map(entry=>entry.path).sort()`);
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1});
    await Promise.all([
      app.send('Input.dispatchMouseEvent',{type:'mouseMoved',...points.to,button:'left',buttons:1}),
      app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',clickCount:1}),
    ]);
    await press('C','KeyC',67,2|8);
    assert.deepEqual((await app.evaluate('window.__copiedPaths')).sort(),expected);
    assert.deepEqual(await selection(isRight),expected);
    await app.evaluate('window.__copiedPaths=null;true');
    await press('Delete','Delete',46);
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-message')"),'marquee Delete confirmation');
    assert.equal(await app.evaluate("document.querySelector('.app-confirm-message').textContent"),await app.evaluate("t('confirm.deleteItems',{count:4})"));
    await app.click('.app-confirm-overlay .dialog-btn:not(.danger)');
  });
  await t.test('nested Columns keep their own multi-selection through copy, cut, arrows and Delete',async nestedTest=>{
    const nested=path.join(folder,'nested');fs.mkdirSync(nested);
    for(let i=0;i<4;i++)fs.writeFileSync(path.join(nested,`child${i}.txt`),'test');
    await app.evaluate(`toggleDualPane(false);navigateTo(${JSON.stringify(folder)})`);
    await app.evaluate("getTab().sortF='name';getTab().sortAsc=false;sortBy('name');setLayout('columns');true");
    await app.evaluate("window.__selectionRenders=[];window.__originalRenderFiles=renderFiles;renderFiles=(...args)=>{if(window.__selectionRenders.length<20)window.__selectionRenders.push(new Error().stack);return window.__originalRenderFiles(...args)};true");
    nestedTest.after(async()=>{
      fs.writeFileSync(path.join(app.artifactDir,'nested-selection.json'),JSON.stringify(await app.evaluate("({renders:window.__selectionRenders,layout:G.layout,active:G.lastActivePane,nested:!!activeColumnSelection(getTab()),selection:getSelectedPaths(false).map(e=>e.path),arrowUsesColumn:moveFileSelectionByArrow.toString().includes('activeColumnSelection')})"),null,2));
      await app.evaluate('renderFiles=window.__originalRenderFiles;true');
    });
    const root='#file-list .column-col:first-child .column-item[data-is-dir="true"]';
    await click(root);
    const row=index=>`#file-list .column-col:nth-child(2) .column-item[data-column-index="${index}"]`;
    await until(()=>app.evaluate(`!!document.querySelector(${JSON.stringify(row(3))})`),'child column');
    await click(row(0));await click(row(2),2);
    const expected=[path.join(nested,'child0.txt'),path.join(nested,'child2.txt')].sort();
    assert.deepEqual(await selection(false),expected);
    fs.writeFileSync(path.join(folder,'arrived-after-selection.txt'),'background refresh');
    await app.evaluate('_refreshTabInBackground(getTab())');
    assert.deepEqual(await selection(false),expected,'Background root refresh must preserve child selection');
    assert.equal(await app.evaluate("document.querySelectorAll('#file-list .column-col').length"),2);
    await press('C','KeyC',67,2|8);assert.deepEqual((await app.evaluate('window.__copiedPaths')).sort(),expected);
    await app.evaluate('window.__copiedPaths=null;true');
    for(const [key,op]of [['c','copy'],['x','cut']]){
      await press(key,'Key'+key.toUpperCase(),key.toUpperCase().charCodeAt(0),2);
      assert.equal(await app.evaluate('G.clipboard.op'),op);
      assert.deepEqual((await app.evaluate('[...G.clipboard.paths]')).sort(),expected);
      assert.deepEqual(await selection(false),expected);
      assert.equal(await app.evaluate("document.querySelectorAll('#file-list .column-col').length"),2);
    }
    await press('Delete','Delete',46);
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-message')"),'nested Delete confirmation');
    assert.equal(await app.evaluate("document.querySelector('.app-confirm-message').textContent"),await app.evaluate("t('confirm.deleteItems',{count:2})"));
    await app.click('.app-confirm-overlay .dialog-btn:not(.danger)');
    assert.deepEqual(await selection(false),expected,'Cancel must retain the nested column selection');
    await press('ArrowDown','ArrowDown',40,8);
    assert.deepEqual((await selection(false)).map(p=>path.basename(p)),['child2.txt','child3.txt']);
    await press('a','KeyA',65,2);assert.equal((await selection(false)).length,4);
    await press('i','KeyI',73,2);assert.deepEqual(await selection(false),[]);
    fs.renameSync(nested,nested+'-moved');
    await app.evaluate('_refreshTabInBackground(getTab())');
    assert.equal(await app.evaluate("document.querySelectorAll('#file-list .column-col').length"),1,'A removed ancestor must close stale child columns');
    assert.deepEqual(await selection(false),[],'Removed children must not select an unrelated root item');
  });
  await t.test('physical Shift+Delete removes both selected fixture files only after both confirmations',async()=>{
    const directory=path.join(app.directory,'delete-fixture');fs.mkdirSync(directory);
    const files=Array.from({length:3},(_,index)=>path.join(directory,`delete${index}.txt`));
    files.forEach(file=>fs.writeFileSync(file,'isolated fixture'));
    await app.evaluate(`navigateTo(${JSON.stringify(directory)})`);await app.evaluate("setLayout('details')");
    await click('#file-list [data-index="0"]');await click('#file-list [data-index="2"]',2);
    await press('Delete','Delete',46,8);
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-message')"),'first permanent-delete confirmation');
    assert.equal(await app.evaluate("document.querySelector('.app-confirm-message').textContent"),await app.evaluate("t('confirm.permanentDeleteItems',{count:2})"));
    assert.ok(files.every(file=>fs.existsSync(file)));
    await app.click('.app-confirm-overlay .dialog-btn.danger');
    await until(()=>app.evaluate("document.querySelector('.app-confirm-title')?.textContent===t('confirm.permanentDeleteFinalTitle')"),'second permanent-delete confirmation');
    assert.ok(files.every(file=>fs.existsSync(file)));
    await app.click('.app-confirm-overlay .dialog-btn.danger');
    await until(()=>!fs.existsSync(files[0])&&!fs.existsSync(files[2]),'both selected files actually removed');
    assert.equal(fs.readFileSync(files[1],'utf8'),'isolated fixture');
  });
  await t.test('late pinyin completion cannot replace a newer mouse multi-selection',async()=>{
    fs.writeFileSync(path.join(folder,'中文.txt'),'test');
    await app.evaluate(`navigateTo(${JSON.stringify(folder)})`);
    await app.evaluate("setLayout('details');window.__originalCall=call;call=(cmd,args)=>cmd==='pinyin_aliases'?new Promise(resolve=>window.__resolvePinyin=resolve):window.__originalCall(cmd,args);true");
    await app.click('#file-list [data-index="1"]');
    await press('z','KeyZ',90);
    await until(()=>app.evaluate('typeof window.__resolvePinyin==="function"'),'pinyin lookup in flight');
    await click('#file-list [data-index="1"]');await click('#file-list [data-index="3"]',2);
    const before=await selection(false);assert.equal(before.length,2);
    await app.evaluate("window.__resolvePinyin(getTab().entries.map(entry=>entry.name==='中文.txt'?['zhongwen','zw']:[]));true");
    await app.evaluate('new Promise(resolve=>setTimeout(resolve,50))');
    assert.deepEqual(await selection(false),before,'A stale type-search must not collapse multi-selection');
    await press('C','KeyC',67,2|8);
    assert.deepEqual((await app.evaluate('window.__copiedPaths')).sort(),before);
    await app.evaluate('call=window.__originalCall;resetTypeSearch();true');
  });
});
