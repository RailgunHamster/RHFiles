// Packaging policy tests use synthetic files, not simulated media playback.
// Actual bundled decoder/ZIP acceptance is a separate opt-in Windows run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from '../testing/source.mjs';
const windows={skip:process.platform!=='win32'?'Windows packaging policy':false};
function run(code,values={},shell='pwsh'){
 const env={...process.env,RHFILES_VLC_POLICY:path.join(root,'scripts/libvlc-bundle.ps1'),RHFILES_VLC_CASE:JSON.stringify(values)};
 // A pwsh parent can otherwise hand Windows PowerShell only its own v7
 // module directories, hiding even the legacy built-in Get-FileHash cmdlet.
 if(shell==='powershell')for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
 const result=spawnSync(shell,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);. $env:RHFILES_VLC_POLICY;$case=$env:RHFILES_VLC_CASE|ConvertFrom-Json;"+code],{encoding:'utf8',timeout:20000,env});
 if(result.error)throw result.error;return result;
}
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-vlc-policy-'));
 fs.mkdirSync(path.join(directory,'plugins','codec'),{recursive:true});
 fs.writeFileSync(path.join(directory,'libvlc.dll'),'synthetic fixture, never loaded');fs.writeFileSync(path.join(directory,'plugins','codec','fixture.dll'),'synthetic plugin');
 return directory;
}
test('the libVLC manifest inventories exact bytes and paths without absolute build-machine paths',windows,()=>{
 const directory=fixture();try{const r=run('$doc=New-RHFilesLibVlcDocument $case.directory;Assert-RHFilesLibVlcInventory $case.directory $doc;$doc|ConvertTo-Json -Depth 8 -Compress',{directory});assert.equal(r.status,0,r.stderr);const doc=JSON.parse(r.stdout);assert.equal(doc.runtimeVersion,'3.0.24');assert.equal(doc.architecture,'win-x64');assert.deepEqual(doc.files.map(v=>v.path).sort(),['libvlc.dll','plugins/codec/fixture.dll']);assert(!r.stdout.includes(directory));assert(doc.files.every(v=>v.bytes>0&&/^[a-f0-9]{64}$/.test(v.sha256)));}finally{fs.rmSync(directory,{recursive:true});}
});
test('Windows PowerShell 5.1 validates exact bundle inventory and still rejects duplicate manifest entries',windows,()=>{
 const directory=fixture();try{
  fs.writeFileSync(path.join(directory,'空 格#100%.txt'),'preserve the literal filename');
  const r=run('$doc=New-RHFilesLibVlcDocument $case.directory;Assert-RHFilesLibVlcInventory $case.directory $doc;$doc|ConvertTo-Json -Depth 8 -Compress',{directory},'powershell');
  assert.equal(r.status,0,r.stderr);assert(JSON.parse(r.stdout).files.some(v=>v.path==='空 格#100%.txt'));
  const duplicate=run('$doc=New-RHFilesLibVlcDocument $case.directory;$doc.files[1]=$doc.files[0];Assert-RHFilesLibVlcInventory $case.directory $doc',{directory},'powershell');
  assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/invalid\/duplicate path/);
 }finally{fs.rmSync(directory,{recursive:true});}
});
for(const mutation of ['format','version','architecture','index','source','duplicate','escape','tamper','extra','timestamp'])test('bundle adoption rejects '+mutation,windows,()=>{
 const directory=fixture();try{const r=run(`$doc=New-RHFilesLibVlcDocument $case.directory;switch($case.mutation){
 'format'{$doc.format='other'} 'version'{$doc.runtimeVersion='3.0.23'} 'architecture'{$doc.architecture='win-x86'} 'index'{$doc.pluginIndexMode='scan'} 'source'{$doc.packageSha256='0'*64}
 'duplicate'{$doc.files[1]=$doc.files[0]} 'escape'{$doc.files[0].path='../outside.dll'}
 'tamper'{[IO.File]::AppendAllText((Join-Path $case.directory 'libvlc.dll'),'changed')}
 'extra'{[IO.File]::WriteAllText((Join-Path $case.directory 'extra.dll'),'unexpected')}
 'timestamp'{$item=Get-Item -LiteralPath (Join-Path $case.directory 'plugins/codec/fixture.dll');$item.LastWriteTimeUtc=$item.LastWriteTimeUtc.AddSeconds(8)}
 };Assert-RHFilesLibVlcInventory $case.directory $doc`,{directory,mutation});assert.notEqual(r.status,0,'Unsafe bundle was adopted');assert.match(r.stderr,/libVLC|bundle|manifest|inventory|path|timestamp/i);}finally{fs.rmSync(directory,{recursive:true});}
});
test('a matching synthetic manifest is not enough to become a real native bundle',windows,()=>{
 const directory=fixture();try{const r=run('$doc=New-RHFilesLibVlcDocument $case.directory;[IO.File]::WriteAllText((Join-Path $case.directory "RHFiles-libVLC.json"),($doc|ConvertTo-Json -Depth 8));Assert-RHFilesLibVlcBundle $case.directory',{directory});assert.notEqual(r.status,0);assert.match(r.stderr,/libVLC.*(missing|checksum|pinned)/i);}finally{fs.rmSync(directory,{recursive:true});}
});
test('the real Windows release path prepares, stages and verifies the native bundle',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/package-velopack.ps1'),'utf8');assert(/prepare-libvlc\.ps1/.test(source),'Release must prepare the native runtime');assert(/Copy-Item[^\r\n]+libVlc[^\r\n]+["']vlc["']/i.test(source),'Release must stage the prepared folder beside the executable');assert(/Assert-RHFilesLibVlcBundle/.test(source),'Release must verify the staged files');
 assert(/Assert-RHFilesLibVlcArchive[^\r\n]+'current'/.test(source),'The portable archive must be verified after compression');assert(/Assert-RHFilesLibVlcArchive[^\r\n]+'lib\/app'/.test(source),'The actual full update package must contain the same complete runtime');
});
test('build targets reject workspace roots and escaped paths without touching them',windows,()=>{
 const directory=fixture();try{for(const target of [directory,path.resolve(directory,'..','escaped-vlc'),path.join(directory,'..','escaped-vlc')]){const r=run('Assert-RHFilesLibVlcWorkspacePath $case.target $case.directory',{directory,target});assert.notEqual(r.status,0);assert.match(r.stderr,/inside.*workspace/);}const safe=path.join(directory,'new','bundle'),r=run('Assert-RHFilesLibVlcWorkspacePath $case.target $case.directory',{directory,target:safe});assert.equal(r.status,0,r.stderr);const resolved=r.stdout.trim(),admitted=fs.statSync(path.dirname(path.dirname(resolved)),{bigint:true}),original=fs.statSync(directory,{bigint:true});assert.equal(path.basename(resolved),'bundle');assert.equal(path.basename(path.dirname(resolved)),'new');assert.equal(admitted.dev,original.dev);assert.equal(admitted.ino,original.ino,'An expanded 8.3 alias must still identify the exact admitted workspace');assert(!fs.existsSync(safe),'Path validation is read-only');}finally{fs.rmSync(directory,{recursive:true});}
});
test('workspace and inventory checks refuse junctions before traversing their target',windows,()=>{
 const directory=fixture(),target=path.join(directory,'owned-target'),link=path.join(directory,'junction');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'unchanged.txt'),'not traversed');fs.symlinkSync(target,link,'junction');
 try{for(const code of ['Assert-RHFilesLibVlcWorkspacePath $case.link $case.directory','Get-RHFilesLibVlcInventory $case.directory']){const r=run(code,{directory,link});assert.notEqual(r.status,0);assert.match(r.stderr,/link|junction/);}assert.equal(fs.readFileSync(path.join(target,'unchanged.txt'),'utf8'),'not traversed');}finally{fs.rmdirSync(link);fs.rmSync(directory,{recursive:true});}
});
for(const year of [1980,1981])test('archive policy '+(year===1980?'accepts only the known Velopack epoch':'rejects arbitrary changed plugin times'),windows,()=>{
 const directory=fixture();try{const r=run('$doc=New-RHFilesLibVlcDocument $case.directory;$item=Get-Item -LiteralPath (Join-Path $case.directory "plugins/codec/fixture.dll");$item.LastWriteTime=[DateTime]::new($case.year,1,1);Assert-RHFilesLibVlcInventory $case.directory $doc "velopack"',{directory,year});if(year===1980)assert.equal(r.status,0,r.stderr);else{assert.notEqual(r.status,0);assert.match(r.stderr,/timestamp/);}}finally{fs.rmSync(directory,{recursive:true});}
});
