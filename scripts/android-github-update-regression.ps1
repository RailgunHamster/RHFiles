# Test the installed minified APK against real public GitHub release metadata.
# The runner does not install the downloaded update or touch any physical phone.
param(
    [string]$Serial='emulator-5582',
    [ValidateSet('available','latest')][string]$ExpectedState='available',
    [string]$ExpectedVersion,
    [string]$Proxy='',
    [string]$RunnerApk="$PSScriptRoot\..\android\src-tauri\gen\android\app\build\outputs\apk\androidTest\universal\release\app-universal-release-androidTest.apk"
)
$ErrorActionPreference='Stop'
if ($Serial -notmatch '^emulator-\d+$') { throw 'Only an explicit emulator may be tested' }
if ($ExpectedState -eq 'available' -and $ExpectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'ExpectedVersion is required for a download test' }
$sdkRoot=if($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}else{$env:ANDROID_HOME}
$adb=Join-Path $sdkRoot 'platform-tools\adb.exe'
function Adb { $result=& $adb -s $Serial @args; if($LASTEXITCODE -ne 0){throw 'Emulator ADB command failed'};return $result }
if ((Adb shell getprop ro.kernel.qemu) -ne '1' -or (Adb shell getprop sys.boot_completed) -ne '1') { throw 'A booted emulator is required' }
$identity=(Adb shell dumpsys package com.railgunhamster.rhfiles) -join "`n"
if ($identity -notmatch 'versionName=' -or $identity -match 'pkgFlags=\[[^\]]*DEBUGGABLE') { throw 'Install the minified release APK on the emulator first' }
Adb shell pm grant com.railgunhamster.rhfiles android.permission.POST_NOTIFICATIONS | Out-Null
Adb install --no-streaming -r $RunnerApk | Out-Host
$evidence=Join-Path $PSScriptRoot ('..\test-artifacts\android-github-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evidence | Out-Null
$identity | Set-Content -LiteralPath (Join-Path $evidence 'installed-package.txt') -Encoding utf8NoBOM
$instrumentArguments=@('shell','am','instrument','-w','-e','mode','github','-e','expect',$ExpectedState,'-e','version',$(if($ExpectedVersion){$ExpectedVersion}else{'none'}))
if ($Proxy) { $instrumentArguments+=@('-e','proxy',$Proxy) }
$instrumentArguments+='com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.SmbUpdateInstrumentation'
$result=Adb @instrumentArguments
$text=$result -join "`n"
$text | Set-Content -LiteralPath (Join-Path $evidence 'instrumentation.txt') -Encoding utf8NoBOM
if ($text -notmatch 'INSTRUMENTATION_RESULT: pass=true' -or $text -notmatch 'INSTRUMENTATION_CODE: -1') { throw "GitHub update probe failed: $text" }
if ($ExpectedState -eq 'available' -and $text -notmatch 'INSTRUMENTATION_RESULT: downloadState=ready') { throw 'APK was not fully downloaded and verified' }
$result | Where-Object { $_ -match '^INSTRUMENTATION_RESULT:|^INSTRUMENTATION_CODE:' } | Out-Host
Write-Host "PASS real GitHub $ExpectedState / $ExpectedVersion; evidence: $evidence"
