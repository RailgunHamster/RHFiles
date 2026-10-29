import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const grid=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoGridActivity.kt');
test('native media palette is scoped to playback activities rather than changing the file browser theme',()=>{
  const manifest=read('android/manifest/AndroidManifest.xml'),theme=read('android/gradle/app/src/main/res/values/rhvideo_media_theme.xml'),chrome=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoMediaChrome.kt');
  const activities=[...manifest.matchAll(/<activity\b[^>]+>/g)].map(match=>match[0]);
  assert.deepEqual(activities.filter(tag=>tag.includes('@style/Theme.RHFiles.MediaViewer')).map(tag=>tag.match(/android:name="([^"]+)"/)[1]).sort(),['.PlaybackActivity','.RhVideoGridActivity']);
  assert.match(theme,/parent="Theme.MaterialComponents.NoActionBar"/);
  assert.doesNotMatch(chrome,/ExoPlayer|RhVideoClient|setDefaultNightMode|setLocalNightMode|SharedPreferences/,'The presentation helper must not become a playback or settings owner');
});
test('readout preview never commits a new command or overwrites a held guarded gesture',()=>{
  const changed=grid.match(/override fun onProgressChanged\([^\n]+/)[0];assert.match(changed,/if\(user\)paintReadout\(command,v\)/);assert.doesNotMatch(changed,/control\(|guarded\(/);
  assert.match(grid,/if\(command !in dragging\)\{sliders\[command\]\?\.progress=value;paintReadout\(command\)\}/);
  assert.match(grid,/onStartTrackingTouch[^\n]+gesture=guarded\(/);
  assert.match(grid,/onStopTrackingTouch[^\n]+control\(request\.put\("value"/);
  assert.match(grid,/sliders\["seekRatio"\]\?\.isEnabled=p\.duration>0/);
});
