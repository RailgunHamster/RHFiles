import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {root} from '../testing/source.mjs';
const windows={skip:process.platform!=='win32'?'PowerShell release gate':false};
function run(code,input={}){return spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';. $env:RHFILES_PLATFORM_POLICY;$case=$env:RHFILES_CASE|ConvertFrom-Json;"+code],{encoding:'utf8',timeout:20000,env:{...process.env,RHFILES_PLATFORM_POLICY:path.join(root,'scripts/platform-version.ps1'),RHFILES_CASE:JSON.stringify(input)}});}
test('independent platform sources expose explicit Android code and different tag namespaces',windows,()=>{
  const r=run("@((Get-RHFilesPlatformVersion Desktop -Root $case.root),(Get-RHFilesPlatformVersion Android -Root $case.root))|ConvertTo-Json",{root});assert.equal(r.status,0,r.stderr);const [desktop,android]=JSON.parse(r.stdout);assert.equal(desktop.Tag,'v'+desktop.Version);assert.equal(android.Tag,'android-v'+android.Version);assert.ok(Number.isInteger(android.VersionCode)&&android.VersionCode>=1022);assert.equal(desktop.Version,JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'))).version);assert.equal(android.Version,JSON.parse(fs.readFileSync(path.join(root,'android/src-tauri/tauri.conf.json'))).version);
});
for(const [platform,tag] of [['Desktop','android-v0.1.72'],['Android','v0.1.22'],['Android','untagged-accidental'],['Desktop','v0.1.71']])test(`wrong platform tag rejected: ${platform}/${tag}`,windows,()=>{const r=run('Assert-RHFilesPlatformTag (Get-RHFilesPlatformVersion $case.platform -Root $case.root) $case.tag',{root,platform,tag});assert.notEqual(r.status,0);assert.match(r.stderr,/Wrong platform tag/);});
for(const [version,code,ok] of [['0.1.23',1023,true],['0.1.22',1022,true],['0.1.23',1022,false],['0.1.22',1023,false],['0.1.21',1023,false],['0.1.23',1021,false],['0.1.9',1009,false],['0.2.0',1023,true]])test(`Android history ${version}/${code} ${ok?'accepts':'rejects'}`,windows,()=>{
  const r=run('Assert-RHFilesAndroidHistory $case.version $case.code $case.history',{version,code,history:[{version:'0.1.21',versionCode:1021},{version:'0.1.22',versionCode:1022}]});assert.equal(r.status===0,ok,r.stderr);
});
test('source mismatches, implicit codes and per-build increments fail before packaging',windows,()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-platform-policy-'));
  try{const directory=path.join(fixture,'android/src-tauri');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'Cargo.toml'),'[package]\nname="owned-fixture"\nversion="0.1.22"\n');
    for(const config of [{version:'0.1.21',identifier:'com.railgunhamster.rhfiles',bundle:{android:{versionCode:1022}}},{version:'0.1.22',identifier:'com.railgunhamster.rhfiles',bundle:{android:{}}},{version:'0.1.22',identifier:'com.railgunhamster.rhfiles',bundle:{android:{versionCode:1022,autoIncrementVersionCode:true}}}]){fs.writeFileSync(path.join(directory,'tauri.conf.json'),JSON.stringify(config));const r=run('Get-RHFilesPlatformVersion Android -Root $case.root',{root:fixture});assert.notEqual(r.status,0);}
  }finally{fs.rmSync(fixture,{recursive:true,force:true});}
});
