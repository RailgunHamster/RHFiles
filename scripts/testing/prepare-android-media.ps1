# Synthetic media for SmbUpdateInstrumentation mode=media. No real files/accounts.
param([string]$EmulatorSerial='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixture=Join-Path $repo 'test-artifacts\network-smb-fixture'
New-Item -ItemType Directory -Path (Join-Path $fixture '子目录') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $fixture '子目录\测试.txt'),'RHFiles synthetic SMB fixture',[Text.UTF8Encoding]::new($false))
$ffmpeg=(Get-Command ffmpeg -ErrorAction Stop).Source
& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=320x180:rate=15 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 30 -c:v libx264 -preset ultrafast -profile:v baseline -pix_fmt yuv420p -c:a aac -movflags +faststart (Join-Path $fixture 'movie.mp4')
if($LASTEXITCODE -ne 0){throw 'Test-pattern video encoding failed'}
& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=blue:size=320x180:rate=15 -f lavfi -i sine=frequency=660:sample_rate=44100 -t 30 -c:v libx264 -preset ultrafast -profile:v baseline -pix_fmt yuv420p -c:a aac -movflags +faststart (Join-Path $fixture 'movie2.mp4')
if($LASTEXITCODE -ne 0){throw 'Distinct blue video encoding failed'}
foreach($name in @('photo.png','photo-base.jpg')){
    & $ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=orange:s=32x20 -frames:v 1 (Join-Path $fixture $name)
    if($LASTEXITCODE -ne 0){throw 'Image fixture encoding failed'}
}
# JPEG APP1: Exif little-endian TIFF, one SHORT orientation=6 (90 degrees).
$jpeg=[IO.File]::ReadAllBytes((Join-Path $fixture 'photo-base.jpg'))
$exif=[byte[]](255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0)
[IO.File]::WriteAllBytes((Join-Path $fixture 'photo-rotated.jpg'),[byte[]]($jpeg[0..1]+$exif+$jpeg[2..($jpeg.Length-1)]))
if($EmulatorSerial){
    if($EmulatorSerial -notmatch '^emulator-\d+$'){throw 'Physical devices are not accepted by this fixture helper'}
    $sdk=if($env:ANDROID_HOME){$env:ANDROID_HOME}else{$env:ANDROID_SDK_ROOT}
    $adb=Join-Path $sdk 'platform-tools\adb.exe'
    if((& $adb -s $EmulatorSerial shell getprop ro.kernel.qemu).Trim() -ne '1'){throw 'Android emulator required'}
    & $adb -s $EmulatorSerial reverse tcp:1445 tcp:1445
    & $adb -s $EmulatorSerial push (Join-Path $fixture 'movie.mp4') /sdcard/Download/RHFiles-Media-QA-1.mp4
    if($LASTEXITCODE -ne 0){throw 'First emulator fixture transfer failed'}
    & $adb -s $EmulatorSerial push (Join-Path $fixture 'movie2.mp4') /sdcard/Download/RHFiles-Media-QA-2.mp4
    if($LASTEXITCODE -ne 0){throw 'Second emulator fixture transfer failed'}
}
Write-Output "Read-only SMB fixture directory: $fixture"
