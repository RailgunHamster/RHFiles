import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp, until} from '../testing/app-session.mjs';

// Opt in on a Windows desktop with both Tortoise clients and Git for Windows.
// Each commit dialog is opened on a private working copy and dismissed without committing.
test('Tortoise menus and native commit dialogs preserve the originating selection', {
  skip: process.env.RHFILES_TEST_TORTOISE !== '1', timeout:120000,
}, async t => {
  const app = await launchApp({emulateFocus:true});
  t.after(() => app.close());
  const api = (id, args) => app.evaluate('RHFilesAPI.invoke(' + JSON.stringify(id) + ',' + JSON.stringify(args) + ')');
  const run = (exe, args, cwd) => execFileSync(exe, args, {cwd, windowsHide:true, encoding:'utf8', timeout:15000});
  const git = path.join(app.directory, 'git 工作区');
  const svn = path.join(app.directory, 'svn working copy');
  fs.mkdirSync(git);
  run('git', ['init', '--quiet'], git);
  // Use the SVN bindings shipped with Git for Windows. TortoiseSVN itself can
  // be installed without svn.exe or svnadmin.exe.
  const perl = path.join(process.env.ProgramFiles, 'Git/usr/bin/perl.exe');
  run(perl, ['-MSVN::Repos', '-MSVN::Client', '-MCwd', '-e',
    'my $p=Cwd::getcwd(); SVN::Repos::create("$p/repository",undef,undef,undef,undef); SVN::Client->new()->checkout("file://$p/repository","$p/svn working copy","HEAD",1);'], app.directory);
  const powershell = body => run('powershell.exe',['-NoProfile','-NonInteractive','-Command',body],app.directory).trim();
  for (const [client, folder] of [['git',git],['svn',svn]]) {
    const names = ['a & b.txt',client === 'git' ? '文件 two.txt' : 'file two.txt','unselected.txt'];
    for (const name of names) fs.writeFileSync(path.join(folder, name), 'fixture\n');
    if (folder === git) {
      run('git', ['add','--',...names], folder);
      run('git', ['-c','user.name=RHFiles Test','-c','user.email=qa@localhost','-c','commit.gpgSign=false','commit','--quiet','--no-verify','-m','fixture'], folder);
    } else {
      run(perl, ['-MSVN::Client','-e','my $c=SVN::Client->new(); $c->add($_,0) for glob("*.txt");'], folder);
    }
    for (const name of names) fs.appendFileSync(path.join(folder, name), 'changed\n');
    const paths = names.slice(0,2).map(name=>path.join(folder,name));
    await api('navigation.open',{path:folder});
    await app.evaluate('showBlankListContextMenu(12,12,false)');
    const brand = client === 'git' ? 'TortoiseGit' : 'TortoiseSVN';
    const labels = 'Array.from(document.querySelectorAll(".context-menu .ctx-label"), e=>e.textContent)';
    await until(async ()=>(await app.evaluate(labels)).includes(brand),brand+' on background');
    await app.evaluate('removeContextMenu()');
    await api('selection.set',{paths});
    await app.evaluate('showContextMenu(12,12,false)');
    await until(async ()=>(await app.evaluate(labels)).includes(brand),brand+' on multiselect');
    const actions = await api('vcs.tortoise.actions',{paths});
    assert.deepEqual(actions.map(menu=>menu.client),[client]);
    assert.ok(actions[0].actions.includes('commit'));
    assert.ok(!actions[0].actions.includes('blame'));
    let pid;
    if (client === 'git') {
      // Observe the PID returned by the real IPC so teardown closes only our dialog.
      await app.evaluate(`window.__tortoisePid = 0;
        const originalTortoiseCall = call;
        call = async (...args) => {
          const result = await originalTortoiseCall(...args);
          if (args[0] === 'tortoise_open') window.__tortoisePid = result;
          return result;
        };`);
      const submenu = '.context-menu > .ctx-item:has(> .ctx-item-main > .ctx-icon-vcs)';
      await app.hover(submenu);
      await app.click(submenu+' > .ctx-submenu > .ctx-item:first-child');
      pid = await until(()=>app.evaluate('window.__tortoisePid'),'commit click launches native dialog');
    } else {
      pid = await api('vcs.tortoise.open',{client, action:'commit', paths});
    }
    assert.ok(Number.isInteger(pid) && pid>0);
    const processById = '$p=Get-Process -Id '+pid+' -ErrorAction Stop; ';
    try {
      await until(() => powershell(processById+'$p.MainWindowTitle').includes(brand),brand+' native dialog');
      // Some Tortoise versions owner-draw the list. Its accessible count still
      // distinguishes our two selected paths from all three modified files.
      const readItems = processById + [
        'Add-Type -AssemblyName UIAutomationClient','Add-Type -AssemblyName UIAutomationTypes',
        '$root=[Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)',
        '$items=$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)',
        '[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)',
        '$items | ForEach-Object {$_.Current.Name}',
      ].join('; ');
      const items = await until(()=>{
        const rows = powershell(readItems);
        const counts = rows.split(/\r?\n/).filter(row=>/\b2\b.*\b2\b/.test(row) && /select|选|2\s*\/\s*2/i.test(row));
        return (names.slice(0,2).every(n=>rows.includes(n)) || counts.length) && rows;
      },brand+' selected files',15000);
      assert.ok(!items.includes(names[2]));
    } finally {
      powershell(processById+'$null=$p.CloseMainWindow()');
    }
    await app.evaluate('removeContextMenu()');
  }
  assert.deepEqual(await api('vcs.tortoise.actions',{paths:[git,svn]}),[]);
});
