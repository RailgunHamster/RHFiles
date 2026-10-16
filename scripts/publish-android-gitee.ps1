# APKs and per-version feeds are immutable. Upload APKs before the feed, and
# expose the stable release only after anonymous downloads verify every byte.
# The DPAPI-encrypted token stays outside Git and never enters the APK.
param(
    [string]$Directory="$PSScriptRoot\..\android\dist\feed",
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository='railgunhamster/RHFiles',
    [string]$Commit,
    [string]$TokenFile="$env:USERPROFILE\.rhfiles-gitee-token.xml"
)
$ErrorActionPreference='Stop'
$manifest=Get-Content -LiteralPath (Join-Path $Directory 'releases.android.json') -Raw | ConvertFrom-Json
if($manifest.schemaVersion -ne 1 -or $manifest.packageId -ne 'com.railgunhamster.rhfiles'){throw 'Invalid Android feed'}
$release=@($manifest.releases | Sort-Object { [long]$_.versionCode } -Descending)[0]
if($release.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid stable Android version'}
if(-not $Commit){$Commit=(git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Git commit unavailable'}}
$files=@()
foreach($asset in $release.assets){
    if($asset.fileName -notmatch '^RHFiles-Android-[A-Za-z0-9_.-]+\.apk$'){throw 'Invalid APK filename'}
    $file=Get-Item -LiteralPath (Join-Path $Directory $asset.fileName)
    if($file.Length -ne $asset.size -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256){throw 'APK checksum does not match feed'}
    $files+=,$file
}
$files+=Get-Item -LiteralPath (Join-Path $Directory 'releases.android.json')
$secret=Import-Clixml -LiteralPath $TokenFile
if($secret -isnot [Security.SecureString]){throw 'Expected a DPAPI-encrypted SecureString token'}
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$token=$null
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('rhfiles-gitee-verify-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
try{
    $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $api="https://gitee.com/api/v5/repos/$Repository"
    $options=@{Headers=@{Authorization="Bearer $token";Accept='application/json'};TimeoutSec=120;MaximumRedirection=0}
    $repo=Invoke-RestMethod $api @options
    if($repo.private){throw 'Gitee repository must be public before publishing an anonymous update source'}
    $tag='android-v'+$release.version
    try{$remote=Invoke-RestMethod "$api/releases/tags/$tag" @options}catch{if([int]$_.Exception.Response.StatusCode -ne 404){throw};$remote=$null}
    if(-not $remote){
        $body=@{tag_name=$tag;target_commitish=$Commit;name=('RHFiles Android '+$release.version);body=$release.notes;prerelease=$true}|ConvertTo-Json -Depth 8
        $remote=Invoke-RestMethod "$api/releases" -Method Post -ContentType 'application/json; charset=utf-8' -Body $body @options
    }
    if($remote.target_commitish -ne $Commit){throw 'Gitee release points to a different commit; refusing to overwrite'}
    $attachments=Invoke-RestMethod "$api/releases/$($remote.id)/attach_files?per_page=100&page=1" @options
    foreach($file in $files){
        $name=$file.Name
        $existing=@($attachments | Where-Object name -eq $name)
        if($existing.Count -gt 1){throw "Duplicate Gitee asset: $name"}
        if(-not $existing.Count){
            if(-not $remote.prerelease){throw 'Stable release is incomplete; refusing to mutate published release'}
            $null=Invoke-RestMethod "$api/releases/$($remote.id)/attach_files" -Method Post -Form @{file=$file} @options
        }
        $url="https://gitee.com/$Repository/releases/download/$tag/$([uri]::EscapeDataString($name))"
        $verified=Join-Path $scratch $name
        # Deliberately no Authorization: clients must be able to download the
        # source anonymously. Never follow a publish credential to a CDN.
        Invoke-WebRequest $url -OutFile $verified -TimeoutSec 180
        if((Get-Item -LiteralPath $verified).Length -ne $file.Length -or (Get-FileHash -LiteralPath $verified -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash){throw "Gitee anonymous download verification failed: $name"}
        Write-Host "Verified anonymous Gitee asset: $name"
    }
    if($remote.prerelease){
        $body=@{tag_name=$tag;target_commitish=$Commit;name=('RHFiles Android '+$release.version);body=$release.notes;prerelease=$false}|ConvertTo-Json -Depth 8
        $null=Invoke-RestMethod "$api/releases/$($remote.id)" -Method Patch -ContentType 'application/json; charset=utf-8' -Body $body @options
    }
    $public=Invoke-RestMethod "$api/releases/tags/$tag" -TimeoutSec 30
    if($public.prerelease){throw 'Gitee release is not public stable yet'}
    Write-Host "Published https://gitee.com/$Repository/releases/tag/$tag"
}catch{
    # Avoid emitting HTTP request objects or token-bearing error details.
    $message=$_.Exception.Message
    if($token){$message=$message.Replace($token,'[REDACTED]')}
    throw "Gitee publish failed: $message; verification files retained at $scratch"
}finally{
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $token=$null;$options=$null
}
