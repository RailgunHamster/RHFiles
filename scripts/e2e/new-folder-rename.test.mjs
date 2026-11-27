import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('New folder translates default name, scrolls into view in a long list, and keeps inline rename focused across layouts', {timeout:90000}, async t => {
  const app = await launchApp({emulateFocus:true});
  t.after(() => app.close());

  // Populate 60 A..Z folders so a Chinese or "New Folder" directory sorts far
  // below the initial virtualized viewport.
  for (let i = 0; i < 60; i++) {
    fs.mkdirSync(path.join(app.directory, `a-dir-${String(i).padStart(2, '0')}`));
  }

  await app.evaluate(`(async()=>{
    setLang('zh');
    setLayout('details');
    await RHFilesAPI.invoke('navigation.open',{path:${JSON.stringify(app.directory)}});
    document.getElementById('file-list').scrollTop = 0;
  })()`);

  // Trigger New Folder via the toolbar button in Chinese mode.
  await app.click('#btn-new');

  const zhState = await until(() => app.evaluate(`(()=>{
    const input = document.querySelector('#file-list input.rename-input');
    if (!input) return null;
    const list = document.getElementById('file-list');
    const listRect = list.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return {
      value: input.value,
      focused: document.activeElement === input,
      selectedAll: input.selectionStart === 0 && input.selectionEnd === input.value.length,
      scrollTop: list.scrollTop,
      visible: inputRect.top >= listRect.top - 2 && inputRect.bottom <= listRect.bottom + 2,
    };
  })()`), 'zh new folder reveals row and focuses inline rename input');

  assert.equal(zhState.value, '新建文件夹');
  assert.equal(zhState.focused, true);
  assert.equal(zhState.selectedAll, true);
  assert.ok(zhState.scrollTop > 0, 'virtual list should scroll down to the newly created folder');
  assert.equal(zhState.visible, true, 'rename input should be inside the visible viewport');
  assert.ok(fs.existsSync(path.join(app.directory, '新建文件夹')));

  // Clicking inside the rename input must not blur/cancel rename.
  await app.click('#file-list input.rename-input');
  const stillFocused = await app.evaluate(`document.activeElement === document.querySelector('#file-list input.rename-input')`);
  assert.equal(stillFocused, true, 'clicking inside rename input must keep it focused');

  // Rename it to a custom name via Enter.
  await app.evaluate(`(()=>{
    const input = document.querySelector('#file-list input.rename-input');
    input.value = '我的项目';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
  await until(() => fs.existsSync(path.join(app.directory, '我的项目')), 'commit inline rename to 我的项目');
  assert.equal(fs.existsSync(path.join(app.directory, '新建文件夹')), false);

  // Switch to English and Cards layout, then create another folder via newFolder().
  await app.evaluate(`(async()=>{
    setLang('en');
    setLayout('cards');
    await newFolder(false);
  })()`);

  const enCardState = await until(() => app.evaluate(`(()=>{
    const input = document.querySelector('#file-list input.rename-input');
    if (!input) return null;
    return {
      value: input.value,
      focused: document.activeElement === input,
    };
  })()`), 'en new folder in cards layout opens focused inline rename input');
  assert.equal(enCardState.value, 'New Folder');
  assert.equal(enCardState.focused, true);
  assert.ok(fs.existsSync(path.join(app.directory, 'New Folder')));

  // Switch to Columns layout and verify inline rename opens there too.
  await app.evaluate(`(async()=>{
    const input = document.querySelector('#file-list input.rename-input');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    setLayout('columns');
    await newFolder(false);
  })()`);

  const colState = await until(() => app.evaluate(`(()=>{
    const input = document.querySelector('#file-list .column-item input.rename-input');
    if (!input) return null;
    return {
      value: input.value,
      focused: document.activeElement === input,
    };
  })()`), 'columns layout opens focused inline rename input');
  assert.equal(colState.value, 'New Folder (1)');
  assert.equal(colState.focused, true);
});
