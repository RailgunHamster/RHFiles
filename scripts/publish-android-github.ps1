# Upload the output of publish-android.ps1 as a non-latest stable GitHub release.
# Authentication comes from Git's existing credential helper, never CLI arguments.
param(
    [string]$Directory = "$PSScriptRoot\..\android\dist\feed",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'RailgunHamster/RHFiles',
    [string]$Commit,
    [string]$Proxy,
    [ValidateRange(30,3600)][int]$UploadTimeoutSeconds=900,
    # Prepare immutable draft assets while Windows is still uploading. Normal
    # invocation later verifies them and publishes against the then-current Latest.
    [switch]$StageOnly
)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $Directory 'releases.android.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.packageId -ne 'com.railgunhamster.rhfiles') { throw 'Invalid Android feed' }
$release = @($manifest.releases | Sort-Object { [long]$_.versionCode } -Descending)[0]
$version = $release.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid stable Android version' }
if (-not $Commit) { $Commit = (git rev-parse HEAD).Trim(); if ($LASTEXITCODE -ne 0) { throw 'Git commit unavailable' } }
$files = @()
foreach ($asset in $release.assets) {
    if ($asset.fileName -notmatch '^RHFiles-Android-[A-Za-z0-9_.-]+\.apk$') { throw 'Invalid APK filename' }
    $file = Join-Path $Directory $asset.fileName
    if ((Get-Item -LiteralPath $file).Length -ne $asset.size -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) { throw 'APK checksum does not match feed' }
    $files += $file
}
$files += Join-Path $Directory 'releases.android.json'
$credentialLines = "protocol=https`nhost=github.com`n`n" | git -c http.proxy= -c https.proxy= credential fill
if ($LASTEXITCODE -ne 0) { throw 'GitHub credentials unavailable' }
$passwordLine = $credentialLines | Where-Object { $_.StartsWith('password=') } | Select-Object -First 1
if (-not $passwordLine) { throw 'GitHub credentials unavailable' }
$headers = @{Authorization=('Bearer '+$passwordLine.Substring(9)); Accept='application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'}
$requestOptions = @{Headers=$headers; TimeoutSec=120}
if ($Proxy) { $requestOptions.Proxy=$Proxy }
$uploadOptions=$requestOptions.Clone();$uploadOptions.TimeoutSec=$UploadTimeoutSeconds
$api = "https://api.github.com/repos/$Repository"
$latestBefore = Invoke-RestMethod "$api/releases/latest" @requestOptions
$tag = "android-v$version"
# Invoke-RestMethod emits a JSON array as one pipeline object; assign it first
# so Where-Object filters individual releases on a retry (including drafts).
$allReleases = Invoke-RestMethod "$api/releases?per_page=100" @requestOptions
$existing = $allReleases | Where-Object tag_name -eq $tag | Select-Object -First 1
if ($existing) { $remoteRelease=$existing } else {
    $body = @{tag_name=$tag; target_commitish=$Commit; name="RHFiles Android $version"; body=$release.notes; draft=$true; prerelease=$false; make_latest='false'} | ConvertTo-Json -Depth 8
    $remoteRelease=Invoke-RestMethod "$api/releases" -Method Post -Body $body -ContentType 'application/json; charset=utf-8' @requestOptions
}
function Publish-Assets($TargetRelease, [switch]$CompatibilityMirror) {
foreach ($file in $files) {
    $name=Split-Path -Leaf $file
    $already=@($TargetRelease.assets | Where-Object name -eq $name) | Select-Object -First 1
    $digest=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $previousFeed=$null
    if ($already) {
        if ($already.digest -eq "sha256:$digest") { continue }
        if (-not $CompatibilityMirror -or $name -ne 'releases.android.json') { throw "Existing GitHub asset differs: $name; will not overwrite it" }
        $oldFeed=Invoke-RestMethod $already.browser_download_url @requestOptions
        if ($oldFeed -is [string]) { $oldFeed=$oldFeed | ConvertFrom-Json }
        if ($oldFeed.schemaVersion -ne 1 -or $oldFeed.packageId -ne $manifest.packageId) { throw 'Unexpected compatibility feed' }
        $oldCode=($oldFeed.releases | Measure-Object versionCode -Maximum).Maximum
        if ($oldCode -ge $release.versionCode) { throw 'Refusing to replace an equal/newer compatibility feed with different bytes' }
        # Preserve the old index for recovery. APK assets are always immutable;
        # upload new APKs first, then switch only this mutable compatibility index.
        $previousFeed=Invoke-RestMethod "$api/releases/assets/$($already.id)" -Method Patch -Body (@{name="releases.android.previous-$($already.id).json"}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @requestOptions
    }
    try {
        $upload="https://uploads.github.com/repos/$Repository/releases/$($TargetRelease.id)/assets?name=$([uri]::EscapeDataString($name))"
        $uploaded=Invoke-RestMethod $upload -Method Post -InFile $file -ContentType 'application/octet-stream' @uploadOptions
        if ($uploaded.digest -ne "sha256:$digest") { throw "GitHub upload checksum mismatch: $name" }
    } catch {
        $failure=$_
        if ($previousFeed) {
            $current=Invoke-RestMethod "$api/releases/$($TargetRelease.id)" @requestOptions
            if (-not ($current.assets | Where-Object name -eq $name)) {
                $null=Invoke-RestMethod "$api/releases/assets/$($previousFeed.id)" -Method Patch -Body (@{name=$name}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @requestOptions
            }
        }
        throw $failure
    }
    Write-Host "Verified GitHub asset: $name"
}
}
if($StageOnly -and -not $remoteRelease.draft){throw 'StageOnly requires an unpublished draft; refusing stable-release changes'}
Publish-Assets $remoteRelease
if($StageOnly){
    Write-Host "Verified Android draft assets for $tag; no update channel or Latest marker changed."
    $headers.Clear();$credentialLines=$null;$passwordLine=$null
    return
}
if ($remoteRelease.draft) {
    $remoteRelease=Invoke-RestMethod "$api/releases/$($remoteRelease.id)" -Method Patch -Body (@{draft=$false;make_latest='false'} | ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @requestOptions
}
# Old APKs stop at the first Android feed in GitHub's non-version-sorted list.
# Keep an Android sidecar on Windows Latest so those APKs can update themselves.
# Never change Windows assets, tag, notes, or its Latest designation.
if ($latestBefore.tag_name -match '^v\d+\.\d+\.\d+$') {
    $windowsHashes=@{}
    foreach ($asset in $latestBefore.assets | Where-Object name -NotLike '*android*' | Where-Object name -NotLike 'RHFiles-Android-*') { $windowsHashes[$asset.name]=$asset.digest }
    Publish-Assets $latestBefore -CompatibilityMirror
    $verified=Invoke-RestMethod "$api/releases/$($latestBefore.id)" @requestOptions
    foreach ($name in $windowsHashes.Keys) {
        if (($verified.assets | Where-Object name -eq $name | Select-Object -First 1).digest -ne $windowsHashes[$name]) { throw "Windows asset changed unexpectedly: $name" }
    }
    Write-Host "Legacy Android update bridge verified on $($latestBefore.tag_name)"
}
$latestAfter=Invoke-RestMethod "$api/releases/latest" @requestOptions
if ($latestBefore.id -ne $latestAfter.id) { throw 'GitHub latest changed unexpectedly; verify desktop update feed before proceeding' }
Write-Host "Published $($remoteRelease.html_url); Windows latest remains $($latestAfter.tag_name)"
