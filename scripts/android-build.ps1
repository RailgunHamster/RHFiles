# Builds installable Android APKs end to end:
#   1. syncs the shared signing key, Gradle signing config and manifest
#   2. cross-compiles the Rust backend and assembles the APK
#   3. verifies that every produced APK is signed with the *same* certificate
#
#   pwsh -File scripts/android-build.ps1                # release APK
#   pwsh -File scripts/android-build.ps1 -Debug         # debug APK instead
#   pwsh -File scripts/android-build.ps1 -Both          # both, signed alike
#
# Signing uses the shared keystore from scripts/android-sync.ps1
# (%USERPROFILE%\.android\rhfiles-debug.keystore, aliases/passwords "android").
# Debug and release therefore share one signing identity: installing a release
# build over a debug build (or the other way round) updates in place instead of
# requiring an uninstall that would wipe settings and the search index.

# Never publish a cached APK after a failed CLI/Gradle build. -SkipBuild is only
# for an explicitly completed manual build; package version is still verified.
param(
    [string]$Target = 'aarch64',
    [switch]$Debug,
    [switch]$Both,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot 'android'

& (Join-Path $PSScriptRoot 'android-sync.ps1')

$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }
if (-not $sdk -or -not (Test-Path $sdk)) {
    throw 'ANDROID_SDK_ROOT / ANDROID_HOME does not point at an Android SDK'
}
$buildTools = Join-Path $sdk 'build-tools'
# apksigner lives inside a versioned subdirectory, so the search must recurse and
# the highest version directory wins.
$apksigner = Get-ChildItem $buildTools -Recurse -Filter 'apksigner.bat' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $apksigner) {
    $found = (Get-ChildItem $buildTools -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
    throw "apksigner.bat not found under $buildTools (contains: $found)"
}
$env:ANDROID_HOME = $sdk

$buildDebug = $Debug -or $Both
$buildRelease = (-not $Debug) -or $Both

$buildStarted = [DateTime]::UtcNow
if (-not $SkipBuild) {
    Push-Location $androidDir
    try {
        if ($buildDebug) {
            Write-Host "`nbuilding debug APK for $Target..."
            & cargo tauri android build --apk --debug --target $Target --ci
            if ($LASTEXITCODE -ne 0) { throw "Android debug build failed (exit $LASTEXITCODE); no APK published" }
        }
        if ($buildRelease) {
            Write-Host "`nbuilding release APK for $Target..."
            & cargo tauri android build --apk --target $Target --ci
            if ($LASTEXITCODE -ne 0) { throw "Android release build failed (exit $LASTEXITCODE); no APK published" }
        }
    } finally {
        Pop-Location
    }
}

# Gradle always names the output directory "universal", even for a single ABI.
$outputsRoot = Join-Path $androidDir 'src-tauri\gen\android\app\build\outputs\apk\universal'
$dist = Join-Path $androidDir 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# Rust target triples are named differently from Android ABI directories, so the
# published file name has to follow the ABI, not the `-Target` shorthand.
$abi = switch ($Target) {
    'aarch64' { 'arm64-v8a' }
    'armv7' { 'armeabi-v7a' }
    'x86_64' { 'x86_64' }
    'i686' { 'x86' }
    default { $Target }
}

$candidates = @()
if ($buildDebug) {
    $candidates += [pscustomobject]@{
        Kind = 'debug'
        Path = Join-Path $outputsRoot 'debug\app-universal-debug.apk'
        Dist = Join-Path $dist "rhfiles-android-$abi-debug.apk"
    }
}
if ($buildRelease) {
    $candidates += [pscustomobject]@{
        Kind = 'release'
        # Gradle signs the release APK itself now, so it drops the "-unsigned" suffix.
        Path = Join-Path $outputsRoot 'release\app-universal-release.apk'
        Dist = Join-Path $dist "rhfiles-android-$abi-release.apk"
    }
}

$seen = @{}
$failures = @()
$expectedVersion = (Get-Content (Join-Path $androidDir 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
$aapt = Join-Path $apksigner.Directory.FullName 'aapt.exe'
if (-not (Test-Path -LiteralPath $aapt)) { throw 'aapt.exe is required to verify APK package/version/ABI' }
foreach ($candidate in $candidates) {
    if (-not (Test-Path $candidate.Path)) {
        $failures += "$($candidate.Kind): no APK at $($candidate.Path)"
        continue
    }
    if (-not $SkipBuild -and (Get-Item -LiteralPath $candidate.Path).LastWriteTimeUtc -lt $buildStarted) {
        $failures += "$($candidate.Kind): stale APK predates this build"
        continue
    }
    $badging = (& $aapt dump badging $candidate.Path 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $badging -notmatch "package: name='com.railgunhamster.rhfiles'" -or $badging -notmatch "versionName='$([regex]::Escape($expectedVersion))'" -or $badging -notmatch "native-code: '$([regex]::Escape($abi))'\s*(?:`n|$)") {
        $failures += "$($candidate.Kind): APK package, version or ABI does not match this build ($expectedVersion / $abi)"
        continue
    }
    $certs = (& $apksigner.FullName verify --print-certs $candidate.Path 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $certs -notmatch 'SHA-256 digest: ([0-9a-fA-F]+)') {
        $failures += "$($candidate.Kind): APK is not correctly signed"
        continue
    }
    $digest = $Matches[1].ToLower()
    $seen[$candidate.Kind] = $digest
    Copy-Item $candidate.Path $candidate.Dist -Force
    $size = (Get-Item $candidate.Dist).Length / 1MB
    Write-Host ("{0,-8} {1,6:N2} MB  sha256(cert)={2}" -f $candidate.Kind, $size, $digest)
    Write-Host ("         {0}" -f $candidate.Dist)
}

if ($failures.Count) {
    throw ("build verification failed:`n - " + ($failures -join "`n - "))
}

$distinct = $seen.Values | Select-Object -Unique
if ($distinct.Count -gt 1) {
    throw "debug and release are signed with different certificates ($($distinct -join ', ')) — an update would require an uninstall"
}
if ($seen.Count -gt 1) {
    Write-Host "`nOK: debug and release share one signing certificate."
}

# Suggest the release build for day-to-day use; debug is for WebView debugging.
$suggested = if ($seen.ContainsKey('release')) { 'release' } else { 'debug' }
$suggestedPath = ($candidates | Where-Object { $_.Kind -eq $suggested } | Select-Object -First 1).Dist
Write-Host "`nInstall with: adb install -r `"$suggestedPath`""
if ($seen.ContainsKey('release') -and $seen.ContainsKey('debug')) {
    Write-Host "Both variants are interchangeable: `"$($candidates | Where-Object { $_.Kind -eq 'debug' } | Select-Object -First 1 | ForEach-Object { $_.Dist })`" installs over the release build without uninstalling."
}
