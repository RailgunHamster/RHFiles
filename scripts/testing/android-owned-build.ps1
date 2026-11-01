param([ValidateSet('Unit','Release')][string]$Mode='Unit',[Parameter(Mandatory=$true)][string]$RunId)
$ErrorActionPreference='Stop'
if($RunId -notmatch '^[a-f0-9]{32}$'){throw 'Invalid owned build identifier'}
$projectRoot=(Get-Location).Path
if(!(Test-Path -LiteralPath (Join-Path $projectRoot 'android/src-tauri/tauri.conf.json'))){throw 'Run from the owned RHFiles project root'}
$generated=Join-Path $projectRoot 'android/src-tauri/gen/android'
$log=Join-Path $projectRoot "test-artifacts/android-owned-$RunId.log"
$result=Join-Path $projectRoot "test-artifacts/android-owned-$RunId.json"
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME='C:\Users\Administrator\AppData\Local\Android\Sdk'
$jvmDirectory=Join-Path 'C:\Users\Administrator\.codex' ('jvm-'+$RunId.Substring(0,8))
New-Item -ItemType Directory -Path $jvmDirectory -Force | Out-Null
# Process-local only. No registry, execution policy or global Java settings.
$env:JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=$jvmDirectory"
$env:PATH=(Join-Path $env:JAVA_HOME 'bin')+';C:\Users\Administrator\.cargo\bin;'+$env:PATH
$code=1
try{
  if($Mode -eq 'Unit'){
    Push-Location $generated
    try{& .\gradlew.bat :app:testUniversalDebugUnitTest --no-daemon *> $log;$code=$LASTEXITCODE}finally{Pop-Location}
  }else{
    Push-Location $projectRoot
    try{& (Join-Path $projectRoot 'scripts/android-build.ps1') *> $log;$code=$LASTEXITCODE}finally{Pop-Location}
  }
}catch{$_|Out-String|Add-Content -LiteralPath $log;$code=1}
[pscustomobject]@{exitCode=$code;mode=$Mode;runId=$RunId;log=$log;finishedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $result -Encoding utf8
exit $code
