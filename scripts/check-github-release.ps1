# Read-only idempotency gate. Never overwrite an existing published version.
param([Parameter(Mandatory)][string]$Version,[string]$Repository='RailgunHamster/RHFiles')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'release-policy.ps1')
if($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid release repository or version'}
$headers=@{Accept='application/vnd.github+json'}
if($env:GH_TOKEN){$headers.Authorization='Bearer '+$env:GH_TOKEN}
$api="https://api.github.com/repos/$Repository/releases/tags/v$Version"
try{$release=Invoke-RestMethod $api -Headers $headers -TimeoutSec 45}catch{
    if([int]$_.Exception.Response.StatusCode -ne 404){throw}
    if($env:GITHUB_OUTPUT){'published=false' >> $env:GITHUB_OUTPUT}
    Write-Host "Version $Version has not been published; packaging is required."
    return
}
$asset=@($release.assets|Where-Object name -CEQ 'releases.win.json')
if($asset.Count -ne 1){throw 'Existing release has no unique Windows feed; manual recovery/new version required'}
$url=[uri]$asset[0].browser_download_url
if($url.Scheme -ne 'https' -or $url.Host -ne 'github.com' -or -not $url.AbsolutePath.StartsWith("/$Repository/releases/download/v$Version/")){throw 'Unexpected release feed location'}
# No API credentials follow the asset/CDN redirect.
$feed=Invoke-RestMethod $url.AbsoluteUri -TimeoutSec 45
if($feed -is [string]){$feed=$feed|ConvertFrom-Json}
$null=Assert-RHFilesPublishedRelease $release $feed $Version
if($env:GITHUB_OUTPUT){'published=true' >> $env:GITHUB_OUTPUT}
Write-Host "Version $Version is already completely published and verified; immutable assets are left unchanged."
