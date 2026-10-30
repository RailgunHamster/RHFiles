import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {admitLocalClockDevice} from '../testing/rhvideo-local-clock.mjs';
const runner=fileURLToPath(new URL('../testing/rhvideo-audio-clock.mjs',import.meta.url));

test('PCM controls share the exact owned-AVD guard including the current host-GPU control',()=>{
  const source=fs.readFileSync(runner,'utf8');
  assert.match(source,/admitLocalClockDevice\(serial,kernel,avd\)/);
  for(const avd of ['RHFilesRhVideoQA20261027','RHFilesRhVideoQA20261030Audio','RHFilesRhVideoQA20261030HostGpu','RHFilesRhVideoQA20261030Api36'])assert.doesNotThrow(()=>admitLocalClockDevice('emulator-5590','1\n',avd+'\nOK\n'));
  for(const avd of ['UserPhone','RHFilesRhVideoQA20261030HostGpu-unrelated','RHFilesRhVideoQA20261030Api36-unrelated'])assert.throws(()=>admitLocalClockDevice('emulator-5590','1\n',avd));
  assert.throws(()=>admitLocalClockDevice('emulator-5588','0','RHFilesRhVideoQA20261030HostGpu'));
  assert.match(source,/\['com\.railgunhamster\.rhfiles','stagefright'\]/);assert.match(source,/hostElapsedMs:performance\.now\(\)-started/);
});
test('independent PCM clock refuses physical or ambiguous devices before accessing the SDK',()=>{
  for(const serial of ['', 'Moto', 'USB123', '192.168.0.114:46413', 'emulator-5586;adb']){
    const result=spawnSync(process.execPath,[runner,...(serial?[serial]:[])],{encoding:'utf8',windowsHide:true,timeout:5000});
    assert.equal(result.status,1);assert.match(result.stderr,/Only an owned emulator serial is accepted/);assert.equal(result.stdout,'');
  }
});
test('PCM comparison is separate from the app and does not tune the platform or mistake an observation timeout for success',()=>{
  const source=fs.readFileSync(runner,'utf8'),java=fs.readFileSync(new URL('../testing/android/PcmClock.java',import.meta.url),'utf8');
  assert.match(source,/rhfiles-qa-pcm-/);assert.match(source,/\['shell','timeout','15','env'/);
  assert.match(source,/value\.exitCode!==0\|\|value\.report\?\.clockHealthy!==true/);
  assert.match(java,/CAPACITY_FRAMES=24000/);assert.match(java,/WRITE_NON_BLOCKING/);assert.match(java,/System\.exit\(healthy\?0:2\)/);
  assert.doesNotMatch(java,/setStartThreshold|setBufferSizeInFrames|setStreamVolume|\.setVolume\(|Class\.forName|ExoPlayer/);
  assert.doesNotMatch(source,/force-stop|reboot|stop-service|svc.*audio|settings.*put/);
});
