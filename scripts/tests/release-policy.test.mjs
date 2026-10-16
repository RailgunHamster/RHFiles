import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {root} from '../testing/source.mjs';

const windows={skip:process.platform!=='win32'?'Windows-only PowerShell packaging policy':false};
function run(code,input={}) {
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';. $env:RHFILES_POLICY;$case=$env:RHFILES_CASE|ConvertFrom-Json;"+code],{
    encoding:'utf8',timeout:20000,env:{...process.env,RHFILES_POLICY:path.join(root,'scripts/release-policy.ps1'),RHFILES_CASE:JSON.stringify(input)},
  });
  if(result.error)throw result.error;
  return result;
}
for(const [a,b,order] of [['0.1.71','0.1.72',-1],['0.1.72','0.1.72',0],['0.1.73','0.1.72',1],['0.1.9','0.1.10',-1],['1.0.0-rc.2','1.0.0-rc.10',-1],['1.0.0-rc.1','1.0.0',-1],['1.0.0+build.2','1.0.0+build.9',0]])test(`release semver ordering ${a} / ${b}`,windows,()=>{
  const r=run('Compare-RHFilesVersion $case.a $case.b',{a,b});assert.equal(r.status,0,r.stderr);assert.equal(Number(r.stdout.trim()),order);
});
test('same/newer downloaded packages are not seeded into a rerun',windows,()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-ci-versions-'));
  // Owned zero-byte fixtures test filename policy, not NuGet/package integrity.
  for(const version of ['0.1.72','0.1.73'])fs.writeFileSync(path.join(directory,`RHFiles-${version}-full.nupkg`),'');
  let r=run('$p=Select-RHFilesPreviousPackage $case.directory "0.1.72";if($p){throw "Self/newer release used as base"}',{directory});assert.equal(r.status,0,r.stderr);
  fs.writeFileSync(path.join(directory,'RHFiles-0.1.71-full.nupkg'),'');
  r=run('(Select-RHFilesPreviousPackage $case.directory "0.1.72").Name',{directory});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'RHFiles-0.1.71-full.nupkg');
});
function published(){const digest='a'.repeat(64),name='RHFiles-0.1.72-full.nupkg';return {version:'0.1.72',release:{tag_name:'v0.1.72',draft:false,prerelease:false,assets:[name,'releases.win.json','release-history.json','RHFiles-win-Portable.zip','RHFiles-win-Setup.exe'].map(name=>({name,digest:'sha256:'+digest,size:12}))},feed:{Assets:[{PackageId:'RHFiles',Version:'0.1.72',Type:'Full',FileName:name,SHA256:digest,Size:12}]}};}
test('complete existing version is a verified no-op, not an overwrite',windows,()=>{const r=run('Assert-RHFilesPublishedRelease $case.release $case.feed $case.version',published());assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'True');});
for(const kind of ['missing-feed','missing-installer','wrong-version','draft','bad-hash','bad-size','duplicate-package'])test(`incomplete or conflicting published release rejects ${kind}`,windows,()=>{
  const input=published();if(kind==='missing-feed')input.release.assets=input.release.assets.filter(a=>a.name!=='releases.win.json');if(kind==='missing-installer')input.release.assets.pop();if(kind==='wrong-version')input.feed.Assets[0].Version='0.1.71';if(kind==='draft')input.release.draft=true;if(kind==='bad-hash')input.release.assets[0].digest='sha256:'+'b'.repeat(64);if(kind==='bad-size')input.release.assets[0].size=13;if(kind==='duplicate-package')input.release.assets.push(input.release.assets[0]);
  const r=run('Assert-RHFilesPublishedRelease $case.release $case.feed $case.version',input);assert.notEqual(r.status,0,'Unsafe already-published result accepted');assert.match(r.stderr,/Published|Existing/);
});
