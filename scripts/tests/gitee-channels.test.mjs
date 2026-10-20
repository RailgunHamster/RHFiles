import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from '../testing/source.mjs';
const windows={skip:process.platform!=='win32'?'PowerShell channel publishing policy':false};
const valid=()=>({Assets:[{PackageId:'RHFiles',Version:'0.1.73',Type:'Full',FileName:'RHFiles-0.1.73-full.nupkg',SHA256:'a'.repeat(64),Size:100}]});
function run(code,input){return spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';. $env:RHFILES_GITEE_POLICY;$case=$env:RHFILES_CASE|ConvertFrom-Json;"+code],{encoding:'utf8',timeout:20000,env:{...process.env,RHFILES_GITEE_POLICY:path.join(root,'scripts/gitee-channels.ps1'),RHFILES_CASE:JSON.stringify(input)}});}
test('Gitee recognizes the Windows channel rather than the repository-wide Android version',windows,()=>{
  const result=run('Get-RHFilesWindowsChannelVersion $case',valid());assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'0.1.73');
});
for(const [label,change] of [
  ['Android-only manifest',feed=>{delete feed.Assets;feed.releases=[{version:'0.1.22',versionCode:1022}];}],
  ['empty feed',feed=>feed.Assets=[]],
  ['foreign package',feed=>feed.Assets[0].PackageId='other'],
  ['missing full',feed=>{feed.Assets[0].Type='Delta';feed.Assets[0].FileName='RHFiles-0.1.73-delta.nupkg';}],
  ['unsafe filename',feed=>feed.Assets[0].FileName='../secret'],
  ['version/filename mismatch',feed=>feed.Assets[0].Version='0.1.74'],
  ['bad hash',feed=>feed.Assets[0].SHA256='x'],
  ['zero size',feed=>feed.Assets[0].Size=0],
])test('Gitee publication refuses '+label,windows,()=>{
  const feed=valid();change(feed);const result=run('Get-RHFilesWindowsChannelVersion $case',feed);assert.notEqual(result.status,0);
});
test('an Android publication carries Windows feed and history, not executable payloads',windows,()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-gitee-channels-'));
  try{
    const result=run(`function Read-RHFilesPublicGiteeFile($Repository,$Name){if($Name -eq 'releases.win.json'){return ($case.feed|ConvertTo-Json -Depth 8 -Compress)};if($Name -eq 'release-history.json'){return '{"schemaVersion":1,"releases":[{"version":"0.1.73","notesMarkdown":"notes"}]}'};throw 'Unexpected channel request'};@(Save-RHFilesGiteeCompanionChannels Android example/repo $case.directory)|ForEach-Object Name`,{directory,feed:valid()});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readdirSync(directory).sort(),['release-history.json','releases.win.json']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'releases.win.json'))).Assets[0].Version,'0.1.73');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('an incomplete companion or concurrent publication aborts instead of downgrading latest',windows,()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-gitee-race-'));
  try{
    const result=run(`function Read-RHFilesPublicGiteeFile($Repository,$Name){if($Name -eq 'releases.win.json'){return ($case.feed|ConvertTo-Json -Depth 8 -Compress)};return $null};Save-RHFilesGiteeCompanionChannels Android example/repo $case.directory`,{directory,feed:valid()});
    assert.notEqual(result.status,0);assert.match(result.stderr,/incomplete/);
    fs.writeFileSync(path.join(directory,'releases.android.json'),'old');
    const race=run(`function Read-RHFilesPublicGiteeFile($Repository,$Name){return 'new'};Assert-RHFilesGiteeCompanionsUnchanged example/repo @((Get-Item -LiteralPath (Join-Path $case.directory 'releases.android.json')))`,{directory});
    assert.notEqual(race.status,0);assert.match(race.stderr,/Another platform/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
