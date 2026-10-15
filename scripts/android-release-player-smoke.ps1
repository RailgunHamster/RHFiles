# Smoke-test the minified release APK through Android accessibility / real taps.
# No WebView debugging or exported player Activity is required. Emulator only.
param([string]$Serial='emulator-5582',[string]$Apk="$PSScriptRoot\..\android\dist\rhfiles-android-arm64-v8a-release.apk")
$ErrorActionPreference='Stop'
if ($Serial -notmatch '^emulator-\d+$') { throw 'Physical devices are not permitted' }
$sdk=if($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}else{$env:ANDROID_HOME}
$adb=Join-Path $sdk 'platform-tools\adb.exe'
function Adb { $value=& $adb -s $Serial @args; if($LASTEXITCODE -ne 0){throw 'ADB command failed'}; return $value }
if ((Adb shell getprop ro.kernel.qemu) -ne '1') { throw 'Not an emulator' }
$evidence=Join-Path $PSScriptRoot ('..\test-artifacts\android-release-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evidence | Out-Null
function TapText([string]$Text) {
    for($attempt=0;$attempt -lt 6;$attempt++) {
        $dump=Adb shell uiautomator dump /sdcard/rhfiles-release.xml
        if ($dump -notmatch 'dumped') { throw 'Android accessibility did not become idle' }
        [xml]$xml=(Adb shell cat /sdcard/rhfiles-release.xml) -join "`n"
        $node=$xml.SelectNodes('//node') | Where-Object { ($_.text -eq $Text -or $_.text.StartsWith($Text+' ')) -and $_.bounds -ne '[0,0][0,0]' -and $_.bounds -match '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$' } | Select-Object -First 1
        if($node){
            $null=$node.bounds -match '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$'
            $x=[int](([int]$Matches[1]+[int]$Matches[3])/2);$y=[int](([int]$Matches[2]+[int]$Matches[4])/2)
            Adb shell input tap $x $y | Out-Null;return
        }
        Adb shell input swipe 360 1300 360 500 350 | Out-Null
    }
    throw "Missing accessibility label: $Text"
}
Adb install -r $Apk | Out-Host
Adb shell am force-stop com.railgunhamster.rhfiles | Out-Null
Adb shell am start -W -n com.railgunhamster.rhfiles/.MainActivity | Out-Null
Start-Sleep -Seconds 3
TapText '下载'
TapText 'sample-h264-aac.mp4'
Start-Sleep -Seconds 4
$state=(Adb shell dumpsys activity activities) -join "`n"
if($state -notmatch 'topResumedActivity=.*PlaybackActivity') { throw 'Release player did not open' }
Adb shell screencap -p /sdcard/rhfiles-release.png | Out-Null
Adb pull /sdcard/rhfiles-release.png (Join-Path $evidence 'release-player.png') | Out-Null
Adb shell input keyevent 4 | Out-Null
Start-Sleep -Seconds 2
if(((Adb shell dumpsys activity activities) -join "`n") -notmatch 'topResumedActivity=.*MainActivity') { throw 'Release player did not return to file list' }
$identity=(Adb shell dumpsys package com.railgunhamster.rhfiles) -join "`n"
if($identity -notmatch 'versionName=0.1.6') { throw 'Wrong installed release version' }
Write-Host "PASS: release APK launch, Download navigation, native player and one-Back return. Evidence: $evidence"
