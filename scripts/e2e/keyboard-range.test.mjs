import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp, until} from '../testing/app-session.mjs';

test('real Shift+arrow keys extend and shrink selections in both file panes', {timeout:120000}, async t=>{
  const app=await launchApp();t.after(()=>app.close());
  t.diagnostic('Keyboard selection evidence: '+app.artifactDir);
  const folder=path.join(app.directory,'files');fs.mkdirSync(folder);
  for(let i=0;i<18;i++)fs.writeFileSync(path.join(folder,`file${String(i).padStart(2,'0')}.txt`),'test');
  await app.evaluate(`navigateTo(${JSON.stringify(folder)})`);
  const press=async(key,shift=true)=>{
    const code={ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39}[key];
    await app.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code,modifiers:shift?8:0});
    await app.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code,modifiers:shift?8:0});
  };
  const state=isRight=>app.evaluate(`(()=>{const pane=${isRight?'G.rp':'getTab()'};return {selection:[...pane.sel].sort((a,b)=>a-b),focus:pane.lastIdx};})()`);
  const range=(a,b)=>Array.from({length:Math.abs(b-a)+1},(_,i)=>Math.min(a,b)+i);
  for(const isRight of [false,true]) {
    if(isRight){await app.evaluate('toggleDualPane(true)');await until(()=>app.evaluate('G.rp.entries.length===18'),'right pane loaded');}
    for(const layout of ['details','cards','thumbnails']) await t.test(`${isRight?'right':'left'} ${layout}: repeated keys, reverse and plain arrow`,async()=>{
      const listId=isRight?'right-file-list':'file-list';
      await app.evaluate(`setLayout(${JSON.stringify(layout)});document.querySelector('#${listId} .file-row[data-index="1"]').scrollIntoView({block:'nearest'});true`);
      await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await app.click(`#${listId} .file-row[data-index="1"]`);
      assert.deepEqual((await state(isRight)).selection,[1]);
      const columns=await app.evaluate(`visibleGridColumnCount(document.getElementById(${JSON.stringify(listId)}))`);
      const step=layout==='details'?1:columns;
      const next=1+step<18?1+step:1, second=next+step<18?next+step:next;
      await press('ArrowDown');assert.deepEqual((await state(isRight)).selection,range(1,next));
      await press('ArrowDown');assert.deepEqual((await state(isRight)).selection,range(1,second));
      await press('ArrowUp');assert.deepEqual((await state(isRight)).selection,range(1,Math.max(1,second-step)));
      await press('ArrowUp');assert.deepEqual((await state(isRight)).selection,[1]);
      await press('ArrowDown',false);assert.deepEqual((await state(isRight)).selection,[next]);
      await press('ArrowDown');assert.deepEqual((await state(isRight)).selection,range(next,second));
      if(layout!=='details'){
        await press('ArrowRight');assert.deepEqual((await state(isRight)).selection,range(next,Math.min(second+1,17)));
        await press('ArrowLeft');assert.deepEqual((await state(isRight)).selection,range(next,second));
      }
      await app.screenshot(`${isRight?'right':'left'}-${layout}-range`);
    });
  }
  await t.test('switching panes preserves the other pane selection',async()=>{
    const rightBefore=await state(true);
    await app.evaluate("setLayout('details')");
    await app.click('#file-list .file-row[data-index="1"]');await press('ArrowDown');
    assert.deepEqual((await state(false)).selection,[1,2]);assert.deepEqual(await state(true),rightBefore);
  });
});
