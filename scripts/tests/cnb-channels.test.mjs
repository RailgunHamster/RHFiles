import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function run(code,input={}){
  return spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';. $env:RHFILES_CNB_POLICY;$case=$env:RHFILES_CASE|ConvertFrom-Json;"+code],{encoding:'utf8',timeout:20000,env:{...process.env,RHFILES_CNB_POLICY:path.join(root,'scripts/cnb-release.ps1'),RHFILES_CASE:JSON.stringify(input)}});
}
const win={Assets:[{PackageId:'RHFiles',Version:'0.1.91',Type:'Full',FileName:'RHFiles-0.1.91-full.nupkg',SHA256:'a'.repeat(64),Size:12}]};
const android={schemaVersion:1,packageId:'com.railgunhamster.rhfiles',releases:[{version:'0.1.38',versionCode:1038,assets:[{abi:'arm64-v8a',fileName:'RHFiles-Android-0.1.38-arm64-v8a.apk',sha256:'b'.repeat(64),size:12}]}]};
test('CNB public paths support nested groups, pinned payloads and repository-wide latest indexes',()=>{
  const result=run("Get-RHFilesCnbPublicUrl example/sub/files v0.1.91 RHFiles-0.1.91-full.nupkg;Get-RHFilesCnbPublicUrl example/sub/files latest releases.android.json");
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/),['https://cnb.cool/example/sub/files/-/releases/download/v0.1.91/RHFiles-0.1.91-full.nupkg','https://cnb.cool/example/sub/files/-/releases/latest/download/releases.android.json']);
});
test('CNB path validation rejects traversal, empty segments, queries and attachment paths',()=>{
  const result=run("foreach($path in @('a/../b','a//b','a/b?token=x','a/b/-/releases','https://evil.test/a')){$rejected=$false;try{Assert-RHFilesCnbRepository $path}catch{$rejected=$true};if(-not $rejected){throw 'Unsafe path accepted'}};'ok'");
  assert.equal(result.status,0,result.stderr);
});
test('both channel schemas are validated independently',()=>{
  const result=run('Get-RHFilesCnbChannelVersion Windows $case.win;Get-RHFilesCnbChannelVersion Android $case.android',{win,android});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(result.stdout.trim().split(/\r?\n/),['0.1.91','1038']);
});
for(const [label,platform,input]of [
  ['empty Windows','Windows',{Assets:[]}],
  ['delta without full','Windows',{Assets:[{...win.Assets[0],Type:'Delta',FileName:'RHFiles-0.1.91-delta.nupkg'}]}],
  ['duplicate Windows filename','Windows',{Assets:[win.Assets[0],win.Assets[0]]}],
  ['invalid Windows hash','Windows',{Assets:[{...win.Assets[0],SHA256:'abc'}]}],
  ['empty Android','Android',{...android,releases:[]}],
  ['draft Android','Android',{...android,releases:[{...android.releases[0],draft:true}]}],
  ['duplicate Android code','Android',{...android,releases:[android.releases[0],android.releases[0]]}],
  ['duplicate Android ABI','Android',{...android,releases:[{...android.releases[0],assets:[android.releases[0].assets[0],android.releases[0].assets[0]]}]}],
  ['wrong Android package','Android',{...android,packageId:'different.app'}],
])test('publisher rejects '+label,()=>assert.notEqual(run(`Get-RHFilesCnbChannelVersion ${platform} $case`,input).status,0));
test('upload confirmation rejects credential redirection and wrong release or repository',()=>{
  const result=run("foreach($url in @('https://evil.test/a/b/-/releases/123/asset-upload-confirmation/t/f','https://api.cnb.cool/a/b/-/releases/456/asset-upload-confirmation/t/f','https://api.cnb.cool/a/other/-/releases/123/asset-upload-confirmation/t/f','http://api.cnb.cool/a/b/-/releases/123/asset-upload-confirmation/t/f','https://api.cnb.cool/a/b/-/releases/123/asset-upload-confirmation/t/f?token=x')){$rejected=$false;try{Get-RHFilesCnbConfirmationPath a/b 123 $url}catch{$rejected=$true};if(-not $rejected){throw 'Unsafe confirmation accepted'}};Get-RHFilesCnbConfirmationPath a/b 123 '/a/b/-/releases/123/asset-upload-confirmation/token/file'");
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'/a/b/-/releases/123/asset-upload-confirmation/token/file');
  const permanent=run("Get-RHFilesCnbConfirmationPath a/b 123 '/a/b/-/releases/123/asset-upload-confirmation/token/file?ttl=0'");
  assert.equal(permanent.status,0,permanent.stderr);assert.match(permanent.stdout,/\?ttl=0/);
  assert.notEqual(run("Get-RHFilesCnbConfirmationPath a/b 123 '/a/b/-/releases/123/asset-upload-confirmation/token/file?ttl=1'").status,0);
});
test('latest snapshot catches absent-to-present and other-platform changes before promotion',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-cnb-policy-'));
  try{
    for(const changed of [false,true]){
      const result=run("function Receive-RHFilesCnbPublicFile($Client,$Url,$Output,$Limit,[switch]$AllowMissing){if($Url.EndsWith('releases.android.json') -and $case.changed){[IO.File]::WriteAllText($Output,'new channel');return $true};return $false};Assert-RHFilesCnbSnapshotUnchanged $null example/files @{'releases.win.json'=$null;'release-history.json'=$null;'releases.android.json'=$null} $case.directory",{changed,directory});
      assert.equal(result.status===0,!changed,result.stderr);
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('publisher stages, anonymously verifies, checks companion race, then promotes; no overwrite/delete/CI token',()=>{
  const publisher=fs.readFileSync(path.join(root,'scripts/publish-cnb.ps1'),'utf8'),helpers=fs.readFileSync(path.join(root,'scripts/cnb-release.ps1'),'utf8');
  assert(publisher.indexOf('Assert-RHFilesCnbSnapshotUnchanged')<publisher.indexOf("make_latest='true'"));
  assert(publisher.indexOf('Verified anonymous CNB asset')<publisher.indexOf("make_latest='true'"));
  assert.match(publisher,/release-history\.json/);assert.match(publisher,/releases\.android\.json/);
  assert.match(helpers,/overwrite=\$false;ttl=0/);assert.match(helpers,/\$confirmation POST/);
  assert.match(helpers,/\$handler\.AllowAutoRedirect=\$false/);
  assert.doesNotMatch(publisher+helpers,/Method Delete|\$env:CNB_TOKEN|\$env:GITHUB_TOKEN|MaximumRetryCount/);
});
