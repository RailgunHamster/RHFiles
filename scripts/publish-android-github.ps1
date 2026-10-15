# Upload the output of publish-android.ps1 as a non-latest stable GitHub release.
# Authentication comes from Git's existing credential helper, never CLI arguments.
param(
    [string]$Directory = "$PSScriptRoot\..\android\dist\feed",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'RailgunHamster/RHFiles',
    [string]$Commit,
    [string]$Proxy
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
$api = "https://api.github.com/repos/$Repository"
$latestBefore = Invoke-RestMethod "$api/releases/latest" @requestOptions
$tag = "android-v$version"
$existing = @(Invoke-RestMethod "$api/releases?per_page=100" @requestOptions) | Where-Object tag_name -eq $tag | Select-Object -First 1
if ($existing) { $remoteRelease=$existing } else {
    $body = @{tag_name=$tag; target_commitish=$Commit; name="RHFiles Android $version"; body=$release.notes; draft=$true; prerelease=$false; make_latest='false'} | ConvertTo-Json -Depth 8
    $remoteRelease=Invoke-RestMethod "$api/releases" -Method Post -Body $body -ContentType 'application/json; charset=utf-8' @requestOptions
}
foreach ($file in $files) {
    $name=Split-Path -Leaf $file
    $already=@($remoteRelease.assets | Where-Object name -eq $name) | Select-Object -First 1
    $digest=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($already) {
        if ($already.digest -ne "sha256:$digest") { throw "Existing GitHub asset differs: $name; will not overwrite it" }
        continue
    }
    $upload="https://uploads.github.com/repos/$Repository/releases/$($remoteRelease.id)/assets?name=$([uri]::EscapeDataString($name))"
    $uploaded=Invoke-RestMethod $upload -Method Post -InFile $file -ContentType 'application/octet-stream' @requestOptions
    if ($uploaded.digest -ne "sha256:$digest") { throw "GitHub upload checksum mismatch: $name" }
    Write-Host "Verified GitHub asset: $name"
}
if ($remoteRelease.draft) {
    $remoteRelease=Invoke-RestMethod "$api/releases/$($remoteRelease.id)" -Method Patch -Body (@{draft=$false;make_latest='false'} | ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @requestOptions
}
$latestAfter=Invoke-RestMethod "$api/releases/latest" @requestOptions
if ($latestBefore.id -ne $latestAfter.id) { throw 'GitHub latest changed unexpectedly; verify desktop update feed before proceeding' }
Write-Host "Published $($remoteRelease.html_url); Windows latest remains $($latestAfter.tag_name)"
