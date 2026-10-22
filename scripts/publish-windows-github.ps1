# Local publishing is independent of Gitee. Keep immutable version assets and
# leave an incomplete upload as a draft, never as a usable update channel.
param(
    [string]$Directory="$PSScriptRoot\..\dist\velopack-releases",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$Repository='RailgunHamster/RHFiles',
    [string]$Commit,
    [string]$Proxy
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'release-policy.ps1')
. (Join-Path $PSScriptRoot 'gitee-channels.ps1')
. (Join-Path $PSScriptRoot 'platform-version.ps1')
$feed=Get-Content -LiteralPath (Join-Path $Directory 'releases.win.json') -Raw|ConvertFrom-Json
$version=Get-RHFilesWindowsChannelVersion $feed
if($version -cne (Get-RHFilesPlatformVersion -Platform Desktop).Version){throw 'Package does not match the Windows source version'}
if(-not $Commit){$Commit=(git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Git source commit unavailable'}}
if($Commit -notmatch '^[a-fA-F0-9]{40}$'){throw 'Expected a full source commit SHA'}
$packages=@($feed.Assets)
$files=@()
foreach($asset in $packages){
    $file=Get-Item -LiteralPath (Join-Path $Directory $asset.FileName)
    if($file.Length -ne $asset.Size -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ine $asset.SHA256){throw 'Package checksum/size does not match the feed'}
    $files+=,$file
}
foreach($name in @('release-history.json',"RHFiles-$version-portable-x64.zip",'RHFiles-win-Setup.exe','releases.win.json')){$files+=Get-Item -LiteralPath (Join-Path $Directory $name)}
$credentialLines="protocol=https`nhost=github.com`n`n"|git -c http.proxy= -c https.proxy= credential fill
if($LASTEXITCODE -ne 0){throw 'GitHub credentials unavailable'}
$passwordLine=$credentialLines|Where-Object {$_.StartsWith('password=')}|Select-Object -First 1
if(-not $passwordLine){throw 'GitHub credentials unavailable'}
$headers=@{Authorization=('Bearer '+$passwordLine.Substring(9));Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'}
$options=@{Headers=$headers;TimeoutSec=240}
$public=@{TimeoutSec=120}
if($Proxy){$options.Proxy=$Proxy;$public.Proxy=$Proxy}
$api="https://api.github.com/repos/$Repository"
$tag="v$version"
try{
    $all=Invoke-RestMethod "$api/releases?per_page=100" @options
    $remote=$all|Where-Object tag_name -CEQ $tag|Select-Object -First 1
    if($remote -and -not $remote.draft){
        $publishedFeed=Invoke-RestMethod "https://github.com/$Repository/releases/download/$tag/releases.win.json" @public
        if($publishedFeed -is [string]){$publishedFeed=$publishedFeed|ConvertFrom-Json}
        $null=Assert-RHFilesPublishedRelease $remote $publishedFeed $version
        foreach($file in $files){$hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();if(($remote.assets|Where-Object name -CEQ $file.Name|Select-Object -First 1).digest -cne "sha256:$hash"){throw "Stable release differs from local output: $($file.Name); refusing replacement"}}
        Write-Host "Already published and verified: $($remote.html_url)";return
    }
    if(-not $remote){
        $notes=($packages|Where-Object {$_.Version -eq $version -and $_.Type -eq 'Full'}|Select-Object -First 1).NotesMarkdown
        $body=@{tag_name=$tag;target_commitish=$Commit;name="RHFiles Windows $version";body=$notes;draft=$true;prerelease=$false;make_latest='false'}|ConvertTo-Json -Depth 6
        $remote=Invoke-RestMethod "$api/releases" -Method Post -Body $body -ContentType 'application/json; charset=utf-8' @options
    }
    foreach($file in $files){
        $hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $existing=@($remote.assets|Where-Object name -CEQ $file.Name)
        if($existing.Count -gt 1){throw 'Duplicate asset names'}
        if($existing.Count){if($existing[0].digest -cne "sha256:$hash"){throw "Draft asset differs: $($file.Name); refusing overwrite"};continue}
        $uploaded=Invoke-RestMethod "https://uploads.github.com/repos/$Repository/releases/$($remote.id)/assets?name=$([uri]::EscapeDataString($file.Name))" -Method Post -InFile $file.FullName -ContentType 'application/octet-stream' @options
        if($uploaded.digest -cne "sha256:$hash" -or [long]$uploaded.size -ne $file.Length){throw "Upload checksum/size mismatch: $($file.Name)"}
        Write-Host "Verified GitHub asset: $($file.Name)"
    }
    $staged=Invoke-RestMethod "$api/releases/$($remote.id)" @options
    # Validate the exact complete asset list before making it visible.
    $staged.draft=$false
    $null=Assert-RHFilesPublishedRelease $staged $feed $version
    $remote=Invoke-RestMethod "$api/releases/$($remote.id)" -Method Patch -Body (@{draft=$false;prerelease=$false;make_latest='true'}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @options
    $publicFeed=Invoke-RestMethod "https://github.com/$Repository/releases/download/$tag/releases.win.json" @public
    if($publicFeed -is [string]){$publicFeed=$publicFeed|ConvertFrom-Json}
    $null=Assert-RHFilesPublishedRelease $remote $publicFeed $version
    $latest=Invoke-RestMethod "$api/releases/latest" @options
    if($latest.id -ne $remote.id){throw 'Windows Latest did not advance; inspect channel before proceeding'}
    Write-Host "Published $($remote.html_url)"
}finally{$headers.Clear();$credentialLines=$null;$passwordLine=$null}
