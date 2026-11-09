import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';import {root} from '../testing/source.mjs';
const body='{"verified":true}',hash=createHash('sha256').update(body).digest('hex');
const fixture=()=>({body,release:{tag_name:'v0.1.112',draft:false,prerelease:false,assets:[{id:12,name:'releases.win.json',size:Buffer.byteLength(body),digest:'sha256:'+hash,url:'https://api.github.com/repos/example/repo/releases/assets/12',browser_download_url:'https://github.com/example/repo/releases/download/v0.1.112/releases.win.json'}]}});
function run(value){return spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',`
$ErrorActionPreference='Stop';. $env:RHFILES_HELPER;$case=$env:RHFILES_CASE|ConvertFrom-Json;$script:reads=0;
function Invoke-WebRequest($Uri,$Headers,$TimeoutSec){
 if($Headers.Authorization){throw 'Credentials leaked into download'}
 if($Uri -notlike 'https://api.github.com/repos/example/repo/releases/assets/12*' -and $Uri -cne $case.release.assets[0].browser_download_url){throw 'Unexpected public asset endpoint'}
 $script:reads++;if($case.failAll -or ($case.failFirst -and $script:reads -eq 1)){throw 'Temporary gateway failure'}
 [pscustomobject]@{Content=[Text.Encoding]::UTF8.GetBytes($case.body)}
};
try{$result=Read-RHFilesGithubJsonAsset -Repository example/repo -Release $case.release -FileName releases.win.json;@{result=$result;reads=$script:reads}|ConvertTo-Json -Compress}
catch{[Console]::Error.WriteLine($_.Exception.Message+'; reads='+$script:reads);exit 1}
`],{encoding:'utf8',timeout:15000,env:{...process.env,GH_TOKEN:'test-token-must-not-be-forwarded',RHFILES_HELPER:path.join(root,'scripts/github-public-assets.ps1'),RHFILES_CASE:JSON.stringify(value)}});}
const windows={skip:process.platform!=='win32'?'PowerShell public asset transport':false};
test('public asset JSON is downloaded through the official API with digest verification and no API credential forwarding',windows,()=>{const r=run(fixture());assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{reads:1,result:{verified:true}});});
for(const [name,mutate]of Object.entries({
  'wrong repository endpoint':f=>f.release.assets[0].url='https://api.github.com/repos/other/repo/releases/assets/12',
  'external endpoint':f=>f.release.assets[0].url='http://127.0.0.1/private',
  'changed canonical path':f=>f.release.assets[0].browser_download_url='https://github.com/example/repo/releases/download/v0.1.111/releases.win.json',
  'draft':f=>f.release.draft=true,
  'oversized body declaration':f=>f.release.assets[0].size=3*1024*1024,
  'missing digest':f=>f.release.assets[0].digest='',
}))test('rejects '+name+' before starting a download',windows,()=>{const f=fixture();mutate(f);const r=run(f);assert.notEqual(r.status,0);assert.match(r.stderr,/reads=0/);});
test('a corrupt downloaded body cannot become accepted release metadata',windows,()=>{const f=fixture();f.body='{"verified":false}';const r=run(f);assert.notEqual(r.status,0);assert.match(r.stderr,/checksum\/size mismatch; reads=1/);});
test('a failed API read can use the canonical browser URL without repeating any write',windows,()=>{const f=fixture();f.failFirst=true;const r=run(f);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)),{reads:2,result:{verified:true}});});
test('unavailable asset endpoints stop after three bounded reads',windows,()=>{const f=fixture();f.failAll=true;const r=run(f);assert.notEqual(r.status,0);assert.match(r.stderr,/reads=3/);});

function metadata(sequence,{retryAfter=null,date=false}={}){
 return spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',`
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;. $env:RHFILES_HELPER;$case=$env:RHFILES_CASE|ConvertFrom-Json;$script:reads=0;$script:delays=@();
function Start-Sleep([int]$Seconds){$script:delays+= $Seconds}
function Invoke-RestMethod($Uri,$Headers,$TimeoutSec,$MaximumRedirection){
 if($Uri -cne 'https://api.github.com/repos/example/repo/releases/tags/v0.1.120' -or $Headers.Authorization -cne 'Bearer fixture-metadata-token' -or $MaximumRedirection -ne 0 -or $TimeoutSec -le 0 -or $TimeoutSec -gt 45){throw 'Unexpected metadata request boundary'}
 $status=[int]$case.sequence[$script:reads];$script:reads++;
 if($status -eq 200){return [pscustomobject]@{tag_name='v0.1.120'}}
 if($status -eq 0){throw [Net.Http.HttpRequestException]::new('Owned test network timeout')}
 $response=[Net.Http.HttpResponseMessage]::new([Net.HttpStatusCode]$status)
 if($null -ne $case.retryAfter){$response.Headers.RetryAfter=if($case.date){[Net.Http.Headers.RetryConditionHeaderValue]::new([DateTimeOffset]::UtcNow.AddSeconds($case.retryAfter))}else{[Net.Http.Headers.RetryConditionHeaderValue]::new([TimeSpan]::FromSeconds($case.retryAfter))}}
 throw [Microsoft.PowerShell.Commands.HttpResponseException]::new('Owned temporary HTTP error',$response)
}
try{$result=Get-RHFilesGithubPublicRelease example/repo v0.1.120;@{tag=$result.tag_name;reads=$script:reads;delays=@($script:delays)}|ConvertTo-Json -Compress}
catch{@{failed=$true;reads=$script:reads;delays=@($script:delays)}|ConvertTo-Json -Compress;exit 1}
`],{encoding:'utf8',timeout:15000,env:{...process.env,GH_TOKEN:'fixture-metadata-token',RHFILES_HELPER:path.join(root,'scripts/github-public-assets.ps1'),RHFILES_CASE:JSON.stringify({sequence,retryAfter,date})}});
}
test('temporary 504/502 metadata responses recover with bounded read-only backoff',windows,()=>{const r=metadata([504,502,200]);assert.equal(r.status,0,r.stdout+r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)),{tag:'v0.1.120',reads:3,delays:[1,2]});});
test('metadata network timeouts recover without sending credentials to redirects',windows,()=>{const r=metadata([0,200]);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)).reads,2);});
for(const status of [401,403,404])test('permanent metadata HTTP '+status+' is not retried or treated as a transient gateway',windows,()=>{const r=metadata([status]);assert.notEqual(r.status,0);assert.deepEqual(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)),{failed:true,reads:1,delays:[]});});
test('persistent metadata failures stop after three reads',windows,()=>{const r=metadata([503,503,503]);assert.notEqual(r.status,0);assert.deepEqual(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)),{failed:true,reads:3,delays:[1,2]});});
test('metadata rate limiting honors a bounded Retry-After and stops when it exceeds the total budget',windows,()=>{for(const [seconds,expectedReads]of [[5,2],[60,1]]){const r=metadata([429,200],{retryAfter:seconds});assert.equal(r.status,seconds===5?0:1,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)).reads,expectedReads);}});
test('metadata Retry-After HTTP dates also preserve the bounded read policy',windows,()=>{const r=metadata([429,200],{retryAfter:5,date:true});assert.equal(r.status,0,r.stdout+r.stderr);const value=JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));assert.equal(value.reads,2);assert(value.delays[0]>=4&&value.delays[0]<=5);});
