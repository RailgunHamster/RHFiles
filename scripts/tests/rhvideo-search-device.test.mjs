import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {admitSearchDevice,libraryBusinessMode,verifyLibraryBusinessTraffic} from '../testing/rhvideo-search-fields.mjs';
const fixture=(overrides={})=>args=>{
  const command=args.join(' ');if(command in overrides)return overrides[command];
  return ({'shell getprop ro.kernel.qemu':'1','emu avd name':'RHFilesRhVideoQA20261030HostGpu\nOK','shell getprop sys.boot_completed':'1','shell dumpsys window windows':'owned home'})[command]||'';
};
test('search acceptance admits only the booted owned emulator with no active app/playback',()=>assert.doesNotThrow(()=>admitSearchDevice('emulator-5588',fixture())));
test('search acceptance rejects phone serials before any device call',()=>{
  for(const serial of ['192.168.0.1:1234','USB-phone',undefined])assert.throws(()=>admitSearchDevice(serial,()=>assert.fail('No access before serial validation')));
});
test('search acceptance rejects physical kernels, near-name AVDs, unbooted and unhealthy systems',()=>{
  for(const values of [{'shell getprop ro.kernel.qemu':'0'},{'emu avd name':'RHFilesRhVideoQA20261030HostGpu-copy\nOK'},{'shell getprop sys.boot_completed':'0'},{'shell dumpsys window windows':'Application Error: Bluetooth'},{'shell dumpsys window windows':'Application Not Responding: system'}])assert.throws(()=>admitSearchDevice('emulator-5588',fixture(values)));
});
test('search acceptance cannot replace existing RHFiles or independent playback',()=>{
  for(const name of ['com.railgunhamster.rhfiles','stagefright'])assert.throws(()=>admitSearchDevice('emulator-5588',fixture({['shell pidof '+name]:'1234'})),/Existing playback/);
});
test('Windows and Android execute the same packaged scenario; Android never installs or changes display/audio',()=>{
  const source=fs.readFileSync(new URL('../testing/rhvideo-search-fields.mjs',import.meta.url),'utf8'),windows=fs.readFileSync(new URL('../e2e/rhvideo-search-fields.test.mjs',import.meta.url),'utf8');
  for(const value of [source,windows])assert.match(value,/checkPackagedSearchFields\(view,/);
  assert.match(source,/Installed APK differs/);assert.match(source,/Use the actual current packaged worker index/);assert.match(source,/unexpectedWrites/);
  assert.doesNotMatch(source,/run\(\[['"](?:install|uninstall)['"]|\['shell','(?:reboot|wm)'|setVolume|setPlaybackSpeed|adb.*kill-server/);
});
test('owned-library scenarios are explicit and unknown modes never reach device admission',()=>{
  assert.equal(libraryBusinessMode(),'search-fields');for(const mode of ['video-order','replacement-intent'])assert.equal(libraryBusinessMode(mode),mode);
  for(const value of ['playback',null,{},'video-order-copy'])assert.throws(()=>libraryBusinessMode(value));
});
test('final traffic admission rejects extra replacement batches and any search mutation',()=>{
  const reads=[{method:'GET',path:'/api/v1/videos'},{method:'POST',path:'/api/v1/auth/login'}],batch={method:'POST',path:'/api/v1/replace-batches'};
  assert.doesNotThrow(()=>verifyLibraryBusinessTraffic(reads,'search-fields'));assert.throws(()=>verifyLibraryBusinessTraffic([...reads,batch],'search-fields'));
  for(const mode of ['video-order','replacement-intent']){assert.doesNotThrow(()=>verifyLibraryBusinessTraffic([...reads,batch],mode));assert.throws(()=>verifyLibraryBusinessTraffic(reads,mode));assert.throws(()=>verifyLibraryBusinessTraffic([...reads,batch,batch],mode));}
  for(const mode of ['search-fields','video-order','replacement-intent'])for(const bad of [{method:'DELETE',path:'/api/v1/replace-batches'},{method:'POST',path:'/api/v1/trash/video/v1'}])assert.throws(()=>verifyLibraryBusinessTraffic([...reads,bad],mode));
});
