# Upload immutable Windows payloads, then expose both platform indexes together.
param(
    [string]$Directory="$PSScriptRoot\..\dist\velopack-releases",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$Repository='railgunhamster/RHFiles',
    [string]$Commit,
    [string]$TokenFile="$env:USERPROFILE\.rhfiles-gitee-token.xml"
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gitee-channels.ps1')
$feed=Get-Content -LiteralPath (Join-Path $Directory 'releases.win.json') -Raw|ConvertFrom-Json
$version=Get-RHFilesWindowsChannelVersion $feed
if(-not $Commit){$Commit=(git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Git commit unavailable'}}
if($Commit -notmatch '^[a-fA-F0-9]{40}$'){throw 'Expected a full source commit SHA'}
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('rhfiles-windows-gitee-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch|Out-Null
$companion=@(Save-RHFilesGiteeCompanionChannels Windows $Repository $scratch)
$assets=@($feed.Assets|Where-Object Version -eq $version)
$files=@()
foreach($asset in $assets){
    $file=Get-Item -LiteralPath (Join-Path $Directory $asset.FileName)
    if($file.Length -ne $asset.Size -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $asset.SHA256){throw 'Windows package does not match its feed'}
    $files+=,$file
}
# Gitee may not contain historical GitHub packages; publish only this tag's assets.
[IO.File]::WriteAllText((Join-Path $scratch 'releases.win.json'),(@{Assets=$assets}|ConvertTo-Json -Depth 10 -Compress),[Text.UTF8Encoding]::new($false))
$files+=Get-Item -LiteralPath (Join-Path $scratch 'releases.win.json')
foreach($name in @('release-history.json',"RHFiles-$version-portable-x64.zip",'RHFiles-win-Setup.exe')){$files+=Get-Item -LiteralPath (Join-Path $Directory $name)}
$files+=$companion
$pointer=[IntPtr]::Zero;$token=$null;$options=$null
try {
    if($env:GITEE_TOKEN){$token=$env:GITEE_TOKEN}else{
        $secret=Import-Clixml -LiteralPath $TokenFile
        if($secret -isnot [Security.SecureString]){throw 'Expected a DPAPI-encrypted token'}
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    $api="https://gitee.com/api/v5/repos/$Repository"
    $options=@{Headers=@{Authorization="Bearer $token";Accept='application/json'};TimeoutSec=180;MaximumRedirection=0}
    $repo=Invoke-RestMethod $api @options
    if($repo.private){throw 'Gitee update repository must be public'}
    $tag="v$version"
    try{$remote=Invoke-RestMethod "$api/releases/tags/$tag" @options}catch{if([int]$_.Exception.Response.StatusCode -ne 404){throw};$remote=$null}
    if(-not $remote){
        $body=@{tag_name=$tag;target_commitish=$Commit;name="RHFiles Windows $version";body=($assets|Where-Object Type -eq 'Full'|Select-Object -First 1).NotesMarkdown;prerelease=$true}|ConvertTo-Json -Depth 8
        $remote=Invoke-RestMethod "$api/releases" -Method Post -ContentType 'application/json; charset=utf-8' -Body $body @options
    }
    if($remote.target_commitish -ne $Commit){throw 'Release belongs to another source commit; refusing to overwrite'}
    $attachments=Invoke-RestMethod "$api/releases/$($remote.id)/attach_files?per_page=100&page=1" @options
    foreach($file in $files){
        $existing=@($attachments|Where-Object name -CEQ $file.Name)
        if($existing.Count -gt 1){throw 'Duplicate release attachment'}
        if(-not $existing.Count){
            if(-not $remote.prerelease){throw 'Stable release is incomplete; refusing to change it'}
            $null=Invoke-RestMethod "$api/releases/$($remote.id)/attach_files" -Method Post -Form @{file=$file} @options
        }
        $verified=Join-Path $scratch ('verified-'+$file.Name)
        $url="https://gitee.com/$Repository/releases/download/$tag/$([uri]::EscapeDataString($file.Name))"
        # No Authorization header may follow a download redirect to the CDN.
        Invoke-WebRequest $url -OutFile $verified -TimeoutSec 180
        if((Get-Item -LiteralPath $verified).Length -ne $file.Length -or (Get-FileHash -LiteralPath $verified -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash){throw "Anonymous download checksum mismatch: $($file.Name)"}
        Write-Host "Verified anonymous Gitee asset: $($file.Name)"
    }
    if($remote.prerelease){
        Assert-RHFilesGiteeCompanionsUnchanged $Repository $companion
        $body=@{tag_name=$tag;target_commitish=$Commit;name="RHFiles Windows $version";body=($assets|Where-Object Type -eq 'Full'|Select-Object -First 1).NotesMarkdown;prerelease=$false}|ConvertTo-Json -Depth 8
        $null=Invoke-RestMethod "$api/releases/$($remote.id)" -Method Patch -ContentType 'application/json; charset=utf-8' -Body $body @options
    }
    $public=Read-RHFilesPublicGiteeFile $Repository 'releases.win.json'|ConvertFrom-Json
    if((Get-RHFilesWindowsChannelVersion $public) -ne $version){throw 'Gitee latest is not the new Windows version'}
    foreach($file in $companion){
        $current=Read-RHFilesPublicGiteeFile $Repository $file.Name
        if($current -cne [IO.File]::ReadAllText($file.FullName)){throw 'Android latest index was not preserved'}
    }
    Write-Host "Published https://gitee.com/$Repository/releases/tag/$tag"
} catch {
    $message=$_.Exception.Message;if($token){$message=$message.Replace($token,'[REDACTED]')}
    throw "Windows Gitee publish failed: $message; verification artifacts: $scratch"
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $token=$null;$options=$null
}
