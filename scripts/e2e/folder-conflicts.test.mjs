import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {launchApp, until} from '../testing/app-session.mjs';
import {root} from '../testing/source.mjs';

test('folder conflicts preserve unrelated data across real frontend and backend routes', {timeout:300000}, async t => {
  const app = await launchApp();
  const results = [];
  let clipboardSequence = 0;
  t.after(() => {
    if (process.env.RHFILES_CLIPBOARD_SEQUENCE_FILE) fs.writeFileSync(process.env.RHFILES_CLIPBOARD_SEQUENCE_FILE, String(clipboardSequence));
    fs.writeFileSync(path.join(app.artifactDir, 'folder-conflicts.json'), JSON.stringify(results, null, 2));
    app.close();
  });
  const invoke = (cmd, args = {}) => app.evaluate(`call(${JSON.stringify(cmd)},${JSON.stringify(args)})`);
  const dialog = () => until(() => app.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"), 'conflict dialog');
  const choose = async action => { await dialog(); await app.click(`#conflict-content button[data-action="${action}"]`); };
  async function step(name, run) {
    let failed;
    await t.test(name, async () => {
      try { await run(); results.push({name, status:'PASS'}); }
      catch (error) { failed = error; results.push({name, status:'FAIL', error:String(error)}); await app.screenshot('folder-conflict-failure'); throw error; }
    });
    if (failed) throw failed;
  }
  let serial = 0;
  function fixture(rename = false) {
    const directory = path.join(app.directory, 'case-' + serial++);
    const source = path.join(directory, rename ? 'Incoming' : 'source/Shared');
    const target = path.join(directory, rename ? 'Existing' : 'destination/Shared');
    for (const folder of [source, target]) fs.mkdirSync(path.join(folder, 'common/deep'), {recursive:true});
    fs.mkdirSync(path.join(source, 'new-empty/inner'), {recursive:true});
    fs.writeFileSync(path.join(source, 'common/deep/same.txt'), 'incoming');
    fs.writeFileSync(path.join(source, 'new.txt'), 'new payload');
    fs.writeFileSync(path.join(target, 'common/deep/same.txt'), 'original');
    fs.writeFileSync(path.join(target, 'keep.txt'), 'target only');
    fs.writeFileSync(path.join(target, 'common/deep/keep.txt'), 'nested target only');
    return {directory, source, target, destination:path.dirname(target)};
  }
  const keep = f => {
    assert.equal(fs.readFileSync(path.join(f.target, 'keep.txt'), 'utf8'), 'target only');
    assert.equal(fs.readFileSync(path.join(f.target, 'common/deep/keep.txt'), 'utf8'), 'nested target only');
  };

  for (const command of ['copy_with_progress', 'move_with_progress']) {
    for (const replaceDirectory of [undefined, false]) await step(`${command}: overwrite=true cannot replace an existing directory (${replaceDirectory})`, async () => {
      const f = fixture();
      await assert.rejects(() => invoke(command, {src:f.source, dest:f.destination, overwrite:true, replaceDirectory, operationId:'guard-' + serial}), /FOLDER_REPLACE_REQUIRES_CONFIRMATION/);
      keep(f);
      assert.equal(fs.readFileSync(path.join(f.target, 'common/deep/same.txt'), 'utf8'), 'original');
      assert.equal(fs.readFileSync(path.join(f.source, 'new.txt'), 'utf8'), 'new payload');
      assert.ok(!fs.existsSync(path.join(f.target, 'new.txt')));
    });
    await step(`${command}: whole-directory replacement requires the distinct explicit flag`, async () => {
      const f = fixture();
      await invoke(command, {src:f.source, dest:f.destination, overwrite:true, replaceDirectory:true, operationId:'explicit-' + serial});
      assert.ok(!fs.existsSync(path.join(f.target, 'keep.txt')));
      assert.equal(fs.readFileSync(path.join(f.target, 'new.txt'), 'utf8'), 'new payload');
      assert.equal(fs.existsSync(f.source), command === 'copy_with_progress');
    });
  }
  for (const command of ['copy_path', 'move_path_cmd', 'copy_path_exact', 'move_path_exact', 'rename_file']) {
    await step(`${command}: legacy and exact backend entry points cannot erase a directory`, async () => {
      const f = fixture(command === 'rename_file');
      const args = command === 'rename_file' ? {path:f.source, newName:path.basename(f.target)}
        : {src:f.source, dest:command.endsWith('_exact') ? f.target : f.destination};
      await assert.rejects(() => invoke(command, args));
      keep(f); assert.equal(fs.readFileSync(path.join(f.source, 'new.txt'), 'utf8'), 'new payload');
    });
  }

  const routes = ['paste-copy', 'paste-cut', 'drop-copy', 'drop-move', 'rename'];
  if (process.env.RHFILES_CLIPBOARD_SEQUENCE_FILE) routes.push('native-copy', 'native-cut');
  for (const route of routes) for (const decision of ['skip', 'replace', 'rename', 'cancel']) {
    await step(`${route}: merge with ${decision} preserves destination-only contents`, async () => {
      const f = fixture(route === 'rename');
      const moving = /cut|move|rename/.test(route);
      await app.evaluate(`undoStack=[];redoStack=[];window.__rhfilesSuppressNativeClipboard=true;navigateTo(${JSON.stringify(f.destination)})`);
      if (route === 'rename') {
        await app.evaluate(`window.__folderTask=renameEntry({name:'Incoming',path:${JSON.stringify(f.source)},is_dir:true},'Existing',false);true`);
        await dialog();
        assert.equal(await app.evaluate("!!document.querySelector('#conflict-content [data-action=replace]')"), false);
        await choose('merge');
      } else if (route.startsWith('drop')) {
        await app.evaluate(`window.__folderTask=performDroppedFileOperation([${JSON.stringify(f.source)}],${JSON.stringify(f.destination)},[],${JSON.stringify(moving ? 'move' : 'copy')});true`);
      } else {
        if (route.startsWith('native')) {
          clipboardSequence = await invoke('set_windows_file_clipboard', {paths:[f.source], cut:moving});
          await app.evaluate('G.clipboard=null;window.__rhfilesSuppressNativeClipboard=false;true');
        } else await app.evaluate(`G.clipboard={op:${JSON.stringify(moving ? 'cut' : 'copy')},paths:new Set([${JSON.stringify(f.source)}]),sequence:0};true`);
        await app.evaluate('window.__folderTask=paste(false);true');
      }
      await dialog();
      assert.equal(await app.evaluate("document.querySelector('#conflict-content .conflict-name').textContent"), 'same.txt');
      await choose(decision); await app.evaluate('window.__folderTask');
      if (route.startsWith('native')) clipboardSequence = Number((await invoke('get_windows_file_clipboard_info')).sequence);
      keep(f);
      assert.equal(fs.readFileSync(path.join(f.target, 'common/deep/same.txt'), 'utf8'), decision === 'replace' ? 'incoming' : 'original');
      if (decision === 'cancel') {
        assert.ok(fs.existsSync(path.join(f.source, 'new.txt')));
        assert.ok(!fs.existsSync(path.join(f.target, 'new.txt')));
        return;
      }
      assert.equal(fs.readFileSync(path.join(f.target, 'new.txt'), 'utf8'), 'new payload');
      assert.ok(fs.statSync(path.join(f.target, 'new-empty/inner')).isDirectory());
      if (decision === 'rename') assert.equal(fs.readFileSync(path.join(f.target, 'common/deep/same (1).txt'), 'utf8'), 'incoming');
      if (moving) assert.equal(fs.existsSync(f.source), decision === 'skip');
      else assert.equal(fs.readFileSync(path.join(f.source, 'common/deep/same.txt'), 'utf8'), 'incoming');
      await app.evaluate('undo()'); keep(f);
      assert.ok(!fs.existsSync(path.join(f.target, 'new.txt')));
      assert.equal(fs.readFileSync(path.join(f.source, 'new.txt'), 'utf8'), 'new payload');
      await app.evaluate('redo()'); keep(f);
      assert.equal(fs.readFileSync(path.join(f.target, 'new.txt'), 'utf8'), 'new payload');
    });
  }
  for (const decision of ['cancel', 'skip', 'rename']) await step(`rename folder: ${decision} at the outer merge dialog leaves the existing target intact`, async () => {
    const f = fixture(true);
    await app.evaluate(`window.__folderTask=renameEntry({name:'Incoming',path:${JSON.stringify(f.source)},is_dir:true},'Existing',false);true`);
    await choose(decision); await app.evaluate('window.__folderTask'); keep(f);
    assert.ok(!fs.existsSync(path.join(f.target, 'new.txt')));
    assert.equal(fs.existsSync(f.source), decision !== 'rename');
    if (decision === 'rename') assert.equal(fs.readFileSync(path.join(f.directory, 'Existing (1)/new.txt'), 'utf8'), 'new payload');
  });
  await step('inline rename Enter opens the merge dialog and preserves the target through the real UI', async () => {
    const f = fixture(true);
    await app.evaluate(`navigateTo(${JSON.stringify(f.directory)})`);
    await app.evaluate(`getTab().sel=new Set([getTab().entries.findIndex(e=>e.path===${JSON.stringify(f.source)})]);renamePrompt(false)`);
    await until(() => app.evaluate("!!document.querySelector('.rename-input')"), 'inline rename input');
    await app.send('Input.insertText', {text:'Existing'});
    await app.send('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
    await app.send('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
    await choose('merge'); await choose('rename');
    await until(() => !fs.existsSync(f.source), 'inline rename merge completion');
    keep(f); assert.equal(fs.readFileSync(path.join(f.target, 'common/deep/same (1).txt'), 'utf8'), 'incoming');
  });
  await step('apply-to-all file overwrite still asks separately before replacing a nested directory', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.source, 'z-item'), 'incoming file');
    fs.mkdirSync(path.join(f.target, 'z-item'));
    fs.writeFileSync(path.join(f.target, 'z-item/keep.txt'), 'nested directory must survive');
    await app.evaluate(`window.__folderTask=performDroppedFileOperation([${JSON.stringify(f.source)}],${JSON.stringify(f.destination)},[],'copy');true`);
    await dialog(); await app.click('#conflict-apply-all'); await choose('replace');
    await dialog();
    assert.equal(await app.evaluate("!!document.querySelector('#conflict-content [data-action=replace-directory]')"), true);
    assert.equal(await app.evaluate("!!document.querySelector('#conflict-apply-all')"), false);
    await choose('cancel'); await app.evaluate('window.__folderTask');
    assert.equal(fs.readFileSync(path.join(f.target, 'z-item/keep.txt'), 'utf8'), 'nested directory must survive');
    keep(f);
  });
  await step('failed rename replacement preserves the destination even when the source disappears after confirmation opens', async () => {
    const directory = path.join(app.directory, 'rename-failure'); fs.mkdirSync(directory);
    const source = path.join(directory, 'incoming.txt'), target = path.join(directory, 'existing.txt');
    fs.writeFileSync(source, 'incoming'); fs.writeFileSync(target, 'keep destination');
    await app.evaluate(`window.__folderTask=renameEntry({name:'incoming.txt',path:${JSON.stringify(source)},is_dir:false},'existing.txt',false);window.__folderTask.catch(()=>{});true`);
    await dialog(); fs.unlinkSync(source); await choose('replace');
    await assert.rejects(() => app.evaluate('window.__folderTask'), /Cannot read/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep destination');
  });
  await step('ZIP hierarchy survives an independent 7-Zip extraction, including overlapping selections', async () => {
    const f = fixture();
    const nested = path.join(f.source, 'common/deep');
    fs.mkdirSync(path.join(f.source, '中文 空目录'));
    fs.writeFileSync(path.join(f.source, '.hidden'), 'hidden');
    fs.writeFileSync(path.join(f.source, 'same.txt'), 'root file');
    const zip = path.join(f.directory, 'verify.zip'), output = path.join(f.directory, 'extracted');
    await invoke('create_archive', {sources:[f.source, nested, path.join(nested, 'same.txt')], dest:zip});
    const extracted = spawnSync(path.join(root, 'src-tauri/thirdparty/7z.exe'), ['x', zip, '-o' + output, '-y'], {windowsHide:true, encoding:'utf8'});
    assert.equal(extracted.status, 0, extracted.stdout + extracted.stderr);
    assert.deepEqual(fs.readdirSync(output), ['Shared']);
    assert.equal(fs.readFileSync(path.join(output, 'Shared/common/deep/same.txt'), 'utf8'), 'incoming');
    assert.equal(fs.readFileSync(path.join(output, 'Shared/same.txt'), 'utf8'), 'root file');
    assert.equal(fs.readFileSync(path.join(output, 'Shared/.hidden'), 'utf8'), 'hidden');
    assert.ok(fs.statSync(path.join(output, 'Shared/中文 空目录')).isDirectory());
  });
  t.diagnostic(`Evidence: ${app.artifactDir}; fixtures: ${app.directory}; native clipboard tested: ${routes.includes('native-copy')}`);
});
