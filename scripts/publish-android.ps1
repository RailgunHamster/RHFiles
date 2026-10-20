# Publish a signed Android APK and its *separate* update feed. Never edits the
# Windows feed. Publish the same files as GitHub release assets for both sources.
param(
    [string]$Apk = "$PSScriptRoot\..\android\dist\rhfiles-android-arm64-v8a-release.apk",
    [string]$OutputDirectory = "$PSScriptRoot\..\android\dist\feed",
    [string]$NotesFile
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'platform-version.ps1')
$platformVersion=Get-RHFilesPlatformVersion -Platform Android
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }
$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$aapt = Join-Path $buildTools.FullName 'aapt.exe'
$signer = Join-Path $buildTools.FullName 'apksigner.bat'
$badging = (& $aapt dump badging $Apk) -join "`n"
if ($LASTEXITCODE -ne 0 -or $badging -notmatch "package: name='com.railgunhamster.rhfiles' versionCode='(\d+)' versionName='([^']+)'") { throw 'Invalid RHFiles APK' }
$code = [long]$Matches[1]
$version = $Matches[2]
if($version -cne $platformVersion.Version -or $code -ne $platformVersion.VersionCode){throw 'APK versionName/versionCode differs from the Android source manifest; refusing stale/probe APK'}
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Only stable Android versions can be published' }
if ($badging -notmatch "native-code: '([^']+)'\s*(?:`n|$)") { throw 'Publish a single-ABI APK' }
$abi = $Matches[1]
if ($badging -notmatch "sdkVersion:'(\d+)'") { throw 'APK minimum SDK missing' }
$minSdk = [int]$Matches[1]
$certs = (& $signer verify --print-certs $Apk 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0 -or $certs -notmatch 'certificate SHA-256 digest: ([0-9a-fA-F]+)') { throw 'APK signature verification failed' }
# Preserve the existing installation identity. A replacement signing key is not
# an update: it would require uninstalling and losing private user data.
if ($Matches[1].ToLowerInvariant() -ne '42f3ddee0997f1e9ad09bf968ad283c66ebae87f84288de90795626756491975') { throw 'Unexpected signing identity; do not publish' }
$name = "RHFiles-Android-$version-$abi.apk"
$hash = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
$asset = [ordered]@{ abi=$abi; fileName=$name; size=(Get-Item -LiteralPath $Apk).Length; sha256=$hash }
$notes = if ($NotesFile) { Get-Content -LiteralPath $NotesFile -Raw } else { "RHFiles Android $version" }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$feedPath = Join-Path $OutputDirectory 'releases.android.json'
$history = @()
if (Test-Path -LiteralPath $feedPath) {
    $existing = Get-Content -LiteralPath $feedPath -Raw | ConvertFrom-Json
    if ($existing.schemaVersion -ne 1 -or $existing.packageId -ne 'com.railgunhamster.rhfiles') { throw 'Unexpected Android feed' }
    $history = @($existing.releases)
}
$same = $history | Where-Object versionCode -eq $code | Select-Object -First 1
Assert-RHFilesAndroidHistory -Version $version -Code $code -History $history
if ($same) {
    if ($same.version -ne $version) { throw 'Version-code collision' }
    $previous = $same.assets | Where-Object abi -eq $abi | Select-Object -First 1
    if ($previous -and $previous.sha256 -ne $hash) { throw 'This version/ABI already exists with different bytes; bump the Android version' }
}
$otherAssets = if ($same) { @($same.assets | Where-Object abi -ne $abi) } else { @() }
$release = [ordered]@{ version=$version; versionCode=$code; minSdk=$minSdk; giteeTag="android-v$version"; prerelease=$false; notes=$notes; assets=@($otherAssets)+@($asset) }
$releases = @($history | Where-Object versionCode -ne $code)+@($release)
$feed = [ordered]@{ schemaVersion=1; packageId='com.railgunhamster.rhfiles'; releases=@($releases | Sort-Object { [long]$_.versionCode } -Descending) }
$target = Join-Path $OutputDirectory $name
if (Test-Path -LiteralPath $target) {
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Published APK already exists with different bytes' }
} else {
    Copy-Item -LiteralPath $Apk -Destination "$target.uploading"
    if ((Get-FileHash -LiteralPath "$target.uploading" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Published APK checksum mismatch' }
    Move-Item -LiteralPath "$target.uploading" -Destination $target
}
# Feed is committed last, so clients cannot see a version whose APK is missing.
$feed | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath "$feedPath.uploading" -Encoding utf8NoBOM
Move-Item -LiteralPath "$feedPath.uploading" -Destination $feedPath -Force
Write-Host "Published Android $version ($code / $abi)"
Write-Host $target
Write-Host $feedPath
