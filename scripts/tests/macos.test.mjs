import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {context,load,plain,readSource} from '../testing/source.mjs';

function mac() {
  const ctx=context({IS_MAC:true,FS_ROOT:'/',G:{homeDirPath:'/Users/测试'},t:key=>key});
  load(ctx,'common.js',['decodeFileUriPath','normalizeWindowsPathInput','parentFolderPath','displayPath']);
  load(ctx,'remote.js',['isFtpPath']);
  load(ctx,'ops.js',['joinFolderPath','windowsPathKey']);
  load(ctx,'conflict.js',['fileNameKey']);
  load(ctx,'tabs.js',['splitAddressQuery']);
  return ctx;
}
test('macOS addresses preserve POSIX roots, Unicode, case and literal backslashes',()=>{
  const c=mac();
  assert.equal(c.normalizeWindowsPathInput('file:///Users/%E6%B5%8B%E8%AF%95/a%20b.json'),'/Users/测试/a b.json');
  assert.equal(c.normalizeWindowsPathInput('~/Documents'),'/Users/测试/Documents');
  assert.equal(c.normalizeWindowsPathInput('/Volumes/CaseSensitive/A\\B'),'/Volumes/CaseSensitive/A\\B');
  assert.equal(c.displayPath('/a\\b'),'/a\\b');
  assert.notEqual(c.windowsPathKey('/a/Report'),c.windowsPathKey('/a/report'));
  assert.notEqual(c.fileNameKey('Report'),c.fileNameKey('report'));
  assert.equal(c.parentFolderPath('/Users'),'/');
  assert.equal(c.parentFolderPath('/'),'/');
  assert.equal(c.parentFolderPath('/a\\b/file'),'/a\\b');
  assert.equal(c.joinFolderPath('/','foo'),'/foo');
  assert.equal(c.joinFolderPath('/a\\b/','c'),'/a\\b/c');
});
test('macOS file URLs and autocomplete use POSIX paths and explicit SMB mounts',()=>{
  const c=mac();
  assert.equal(c.normalizeWindowsPathInput('file://localhost/Users/demo/test.txt'),'/Users/demo/test.txt');
  assert.equal(c.normalizeWindowsPathInput('file://nas/share/a.txt'),'smb://nas/share/a.txt');
  assert.deepEqual(plain(c.splitAddressQuery('/Users/demo/文')),{parent:'/Users/demo/',prefix:'文',trailingSep:false});
  assert.deepEqual(plain(c.splitAddressQuery('/')),{parent:'/',prefix:'',trailingSep:true});
});
test('macOS keyboard bindings use Command without losing Control+Tab or typed-search keys',()=>{
  const c=mac();
  const source=readSource('keyboard.js');
  // Evaluate the shipped defaults and platform adjustment together.
  const start=source.indexOf('const DEFAULT_SHORTCUTS');
  const end=source.indexOf('const ACTION_HANDLERS');
  load(c,'keyboard.js',['normalizeKey']);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.bindings=DEFAULT_SHORTCUTS;',c);
  assert.deepEqual(plain(c.bindings['file.copy']),['Meta+C']);
  assert.deepEqual(plain(c.bindings['file.delete']),['Meta+Backspace','Delete']);
  assert.deepEqual(plain(c.bindings['tab.next']),['Ctrl+Tab']);
  assert.deepEqual(plain(c.bindings['typeSearch.next']),['Alt+]']);
  assert.equal(c.normalizeKey({key:'c',metaKey:true}),'Meta+C');
  assert.equal(c.normalizeKey({key:'Tab',ctrlKey:true}),'Ctrl+Tab');
  const keys=Object.values(c.bindings).flat();
  assert.equal(new Set(keys).size,keys.length,'Default shortcuts must not shadow each other');
});
test('macOS open-with menu routes to native apps, not Windows executables',()=>{
  const c=mac();
  load(c,'ops.js',['buildProgramOpenMenu']);
  const items=plain(c.buildProgramOpenMenu('/Users/demo',{isDirectory:true}));
  assert.ok(items.some(item=>item.label==='Terminal'));
  assert.ok(!items.some(item=>['CMD','PowerShell','Visual Studio','Git Bash'].includes(item.label)));
});
test('macOS never automatically consumes a Windows update feed',()=>{
  const c=mac(); c.G.settings={autoUpdateEnabled:true};
  load(c,'main.js',['isAutomaticUpdateCheckEnabled']);
  assert.equal(c.isAutomaticUpdateCheckEnabled(),false);
});
