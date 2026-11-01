import test from 'node:test';
import assert from 'node:assert/strict';
import {androidSystemReady} from '../testing/android-system-ready.mjs';
const ready={boot:'1\r\n',framework:'package:/system/framework/framework-res.apk\r\n',settings:'1\r\n',window:'Service window: found\r\n',user:'0\r\n'};
test('only a complete provisioned Android framework admits APK installation',()=>assert.equal(androidSystemReady(ready),true));
test('a stale boot-completed flag and published PackageManager do not admit the observed missing Settings provider',()=>{
  assert.equal(androidSystemReady({...ready,settings:"java.lang.IllegalStateException: Cannot access system provider: 'settings' before system providers are installed!"}),false);
});
test('missing or restarting framework components cannot pass the installation gate',()=>{
  for(const [key,value] of [['boot','0'],['framework',"cmd: Can't find service: package"],['settings','null'],['settings','0'],['window',"Can't find service: window"],['user','java.lang.IllegalStateException']])
    assert.equal(androidSystemReady({...ready,[key]:value}),false,key);
});
