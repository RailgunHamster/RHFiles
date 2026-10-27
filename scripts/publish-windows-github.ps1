# Local publishing is independent of Gitee. Keep immutable version assets and
# leave an incomplete upload as a draft, never as a usable update channel.
param(
    [string]$Directory="$PSScriptRoot\..\dist\velopack-releases",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$Repository='RailgunHamster/RHFiles',
    [string]$Commit,
    [string]$Proxy,
    [ValidateRange(30,3600)][int]$UploadTimeoutSeconds=900
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'release-policy.ps1')
. (Join-Path $PSScriptRoot 'gitee-channels.ps1')
. (Join-Path $PSScriptRoot 'platform-version.ps1')
. (Join-Path $PSScriptRoot 'github-channels.ps1')
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
$publisherToken=$env:GH_TOKEN
if(-not $publisherToken){
    $credentialLines="protocol=https`nhost=github.com`n`n"|git -c http.proxy= -c https.proxy= credential fill
    if($LASTEXITCODE -ne 0){throw 'GitHub credentials unavailable'}
    $passwordLine=$credentialLines|Where-Object {$_.StartsWith('password=')}|Select-Object -First 1
    if(-not $passwordLine){throw 'GitHub credentials unavailable'}
    $publisherToken=$passwordLine.Substring(9)
}
$headers=@{Authorization=('Bearer '+$publisherToken);Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'}
$options=@{Headers=$headers;TimeoutSec=240}
$public=@{TimeoutSec=120}
if($Proxy){$options.Proxy=$Proxy;$public.Proxy=$Proxy}
$uploadOptions=$options.Clone();$uploadOptions.TimeoutSec=$UploadTimeoutSeconds
$api="https://api.github.com/repos/$Repository"
$tag="v$version"
try{
    # Legacy Android clients read the repository-wide Latest release. Stage its
    # verified Android index AND APKs before advancing Windows Latest, not after.
    $companionDirectory=Join-Path ([IO.Path]::GetTempPath()) ('rhfiles-github-companion-'+[guid]::NewGuid().ToString('N'))
    $companion=Save-RHFilesGithubAndroidCompanion $Repository $companionDirectory $options $public
    if($companion){$files+=@($companion.files)}
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
        $previousIndex=$null
        if($existing.Count){
            if($existing[0].digest -ceq "sha256:$hash"){continue}
            if(-not $companion -or $file.Name -cne 'releases.android.json'){throw "Draft asset differs: $($file.Name); refusing overwrite"}
            $old=Invoke-RestMethod $existing[0].browser_download_url @options;if($old -is [string]){$old=$old|ConvertFrom-Json}
            if((Get-RHFilesAndroidChannelCode $old) -ge $companion.snapshot.code){throw 'Refusing equal/newer draft Android companion replacement'}
            $previousIndex=Invoke-RestMethod "$api/releases/assets/$($existing[0].id)" -Method Patch -Body (@{name="releases.android.previous-$($existing[0].id).json"}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @options
        }
        try{
            $uploaded=Invoke-RestMethod "https://uploads.github.com/repos/$Repository/releases/$($remote.id)/assets?name=$([uri]::EscapeDataString($file.Name))" -Method Post -InFile $file.FullName -ContentType 'application/octet-stream' @uploadOptions
            if($uploaded.digest -cne "sha256:$hash" -or [long]$uploaded.size -ne $file.Length){throw "Upload checksum/size mismatch: $($file.Name)"}
        }catch{
            $failure=$_
            if($previousIndex){$current=Invoke-RestMethod "$api/releases/$($remote.id)" @options;if(-not ($current.assets|Where-Object name -CEQ $file.Name)){$null=Invoke-RestMethod "$api/releases/assets/$($previousIndex.id)" -Method Patch -Body (@{name=$file.Name}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @options}}
            throw $failure
        }
        Write-Host "Verified GitHub asset: $($file.Name)"
    }
    $staged=Invoke-RestMethod "$api/releases/$($remote.id)" @options
    # Validate the exact complete asset list before making it visible.
    $staged.draft=$false
    $null=Assert-RHFilesPublishedRelease $staged $feed $version
    Assert-RHFilesGithubAndroidUnchanged $Repository $companion $options $public
    $remote=Invoke-RestMethod "$api/releases/$($remote.id)" -Method Patch -Body (@{draft=$false;prerelease=$false;make_latest='true'}|ConvertTo-Json) -ContentType 'application/json; charset=utf-8' @options
    $publicFeed=Invoke-RestMethod "https://github.com/$Repository/releases/download/$tag/releases.win.json" @public
    if($publicFeed -is [string]){$publicFeed=$publicFeed|ConvertFrom-Json}
    $null=Assert-RHFilesPublishedRelease $remote $publicFeed $version
    $latest=Invoke-RestMethod "$api/releases/latest" @options
    if($latest.id -ne $remote.id){throw 'Windows Latest did not advance; inspect channel before proceeding'}
    if($companion){$android=Invoke-RestMethod "https://github.com/$Repository/releases/download/$tag/releases.android.json" @public;if($android -is [string]){$android=$android|ConvertFrom-Json};if((Get-RHFilesAndroidChannelCode $android) -ne $companion.snapshot.code){throw 'Public Android companion did not survive Windows publication'}}
    Write-Host "Published $($remote.html_url)"
}finally{$headers.Clear();$credentialLines=$null;$passwordLine=$null;$publisherToken=$null}
