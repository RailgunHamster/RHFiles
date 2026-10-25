import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {sourceRoot} from '../testing/source.mjs';
const read=p=>fs.readFileSync(path.join(sourceRoot,p),'utf8');
test('RHFiles independent pairing has no client UI or automation action',()=>{
  assert.equal(fs.existsSync(path.join(sourceRoot,'android/web/js/rhfiles-connect.js')),false);
  assert.doesNotMatch(read('android/web/index.html'),/rhfiles-connect/);
  assert.doesNotMatch(read('android/web/js/automation-android.js'),/connections\.(?:pair|compose|describe)/);
  assert.doesNotMatch(read('android/web/js/features.js'),/connection\.pair|独立配对/);
});
test('standalone scanner has drawer, overflow and launcher shortcut entries',()=>{
  assert.match(read('android/web/index.html'),/id="nav-scan"/);assert.match(read('android/web/index.html'),/id="drawer-more"/);
  assert.match(read('android/web/js/app.js'),/action\('扫码','scan'/);assert.match(read('android/web/js/automation-android.js'),/'qr.scan'/);
  assert.match(read('android/manifest/AndroidManifest.xml'),/android.app.shortcuts/);
  assert.match(read('android/gradle/app/src/main/res/xml/shortcuts.xml'),/QrScanActivity/);
});
test('general QR content is copy-only and scanner has no generic open intent',()=>{
  const code=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/QrScanActivity.kt');
  assert.match(code,/Copy content/);assert.match(code,/setPrimaryClip/);assert.match(code,/MaterialAlertDialogBuilder/);
  assert.doesNotMatch(code,/Intent\.ACTION_VIEW|Uri\.parse\(.*found|startActivity\(.*found/);
});
