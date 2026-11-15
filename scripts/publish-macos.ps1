# Publish a signed macOS version without moving either repository's Latest marker.
# The provider feed is written locally only after anonymous package verification.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('CNB','GitHub')][string]$Provider,
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Commit,
    [string]$Proxy='http://127.0.0.1:7890',
    [string]$TokenFile="$env:LOCALAPPDATA\RHFiles-Publishing\cnb-token.xml"
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/cnb-release.ps1"
$config=git show "${Commit}:src-tauri/tauri.macos.conf.json" | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $config.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'){throw 'Invalid committed macOS version'}
$version=$config.version
$tag="macos-v$version"
$notes=(git show "${Commit}:docs/release-notes/macos/$version.md") -join "`n"
if($LASTEXITCODE -ne 0 -or !$notes.Trim()){throw 'Missing committed macOS release notes'}
$archive=Get-Item -LiteralPath (Join-Path $Directory 'RHFiles-macos-arm64.app.tar.gz')
$installer=Get-Item -LiteralPath (Join-Path $Directory 'RHFiles-macos-arm64.app.zip')
$signature=(Get-Content -LiteralPath ($archive.FullName+'.sig') -Raw).Trim()
if($signature -cnotmatch '^[A-Za-z0-9+/]+={0,2}$' -or $signature.Length -gt 4096){throw 'Missing or invalid Tauri archive signature'}
$client=$null
$secret=$null
$pointer=[IntPtr]::Zero
$lock=$null
$stage='read credentials'
try{
    if($Provider -eq 'CNB'){
        $repository='railgunhamster/RHFiles'
        $client=New-RHFilesCnbHttpClient
        $lock=[IO.File]::Open((Join-Path (Split-Path -Parent $TokenFile) 'cnb-publish.lock'),'OpenOrCreate','ReadWrite','None')
        $secret=Import-Clixml -LiteralPath $TokenFile
        if($secret -isnot [Security.SecureString]){throw 'Expected an encrypted CNB token'}
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $api="/$repository/-/releases"
        $stage='stage CNB release'
        $prior=Invoke-RHFilesCnbApi $client $token "$api/latest"
        $row=Invoke-RHFilesCnbApi $client $token "$api/tags/$tag" -AllowMissing
        if(!$row){
            $null=Invoke-RHFilesCnbApi $client $token $api POST @{tag_name=$tag;target_commitish=$Commit;name="RHFiles macOS $version";body=$notes;draft=$false;prerelease=$true;make_latest='false'}
            $row=Invoke-RHFilesCnbApi $client $token "$api/tags/$tag"
        }
        if($row.tag_name -cne $tag -or $row.tag_commitish -ine $Commit -or $row.draft){throw 'CNB release identity mismatch'}
        foreach($file in $archive,$installer){
            $stage="verify CNB $($file.Name)"
            $current=Invoke-RHFilesCnbApi $client $token "$api/$($row.id)"
            $existing=@($current.assets|Where-Object name -CEQ $file.Name)
            if($existing.Count -gt 1){throw 'Duplicate asset'}
            if(!$existing.Count){
                if(!$row.prerelease){throw 'Published Mac release is immutable'}
                Send-RHFilesCnbAsset $client $token $repository $row.id $file
            }
            $received=Join-Path $Directory ('readback-cnb-'+$file.Name)
            $null=Receive-RHFilesCnbPublicFile $client (Get-RHFilesCnbPublicUrl $repository $tag $file.Name) $received $file.Length
            Assert-RHFilesCnbFile (Get-Item -LiteralPath $received) $file.Length (Get-FileHash -LiteralPath $file.FullName).Hash
        }
        if($row.prerelease){$null=Invoke-RHFilesCnbApi $client $token "$api/$($row.id)" PATCH @{prerelease=$false;draft=$false;make_latest='false'}}
        if((Invoke-RHFilesCnbApi $client $token "$api/latest").id -ne $prior.id){throw 'CNB Latest changed during publishing'}
        $url=Get-RHFilesCnbPublicUrl $repository $tag $archive.Name
    } else {
        $repository='RailgunHamster/RHFiles'
        $credentials="protocol=https`nhost=github.com`n`n"|git -c credential.interactive=never credential fill 2>$null
        $passwordLine=$credentials|Where-Object {$_.StartsWith('password=')}|Select-Object -First 1
        if(!$passwordLine){throw 'GitHub credential unavailable'}
        $token=$passwordLine.Substring(9)
        $api="https://api.github.com/repos/$repository/releases"
        $auth=@{Headers=@{Authorization="Bearer $token";Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'};TimeoutSec=600}
        $public=@{TimeoutSec=240}
        if($Proxy){$auth.Proxy=$Proxy;$public.Proxy=$Proxy}
        $stage='stage GitHub draft'
        $prior=Invoke-RestMethod "$api/latest" @auth
        $all=Invoke-RestMethod "${api}?per_page=100" @auth
        $row=$all|Where-Object tag_name -CEQ $tag|Select-Object -First 1
        if(!$row){
            $row=Invoke-RestMethod $api @auth -Method Post -ContentType 'application/json' -Body (@{tag_name=$tag;target_commitish=$Commit;name="RHFiles macOS $version";body=$notes;draft=$true;prerelease=$false;make_latest='false'}|ConvertTo-Json)
        }
        if($row.tag_name -cne $tag -or $row.target_commitish -ine $Commit){throw 'GitHub release identity mismatch'}
        foreach($file in $archive,$installer){
            $stage="verify GitHub $($file.Name)"
            $existing=@($row.assets|Where-Object name -CEQ $file.Name)
            if($existing.Count -gt 1){throw 'Duplicate asset'}
            $asset=$existing|Select-Object -First 1
            if(!$asset){
                if(!$row.draft){throw 'Published Mac release is immutable'}
                $asset=Invoke-RestMethod "https://uploads.github.com/repos/$repository/releases/$($row.id)/assets?name=$($file.Name)" @auth -Method Post -InFile $file.FullName -ContentType 'application/octet-stream'
            }
            $hash=(Get-FileHash -LiteralPath $file.FullName).Hash.ToLowerInvariant()
            if($asset.digest -cne "sha256:$hash" -or [long]$asset.size -ne $file.Length){throw 'GitHub package differs from signed local build'}
        }
        if($row.draft){$null=Invoke-RestMethod "$api/$($row.id)" @auth -Method Patch -ContentType 'application/json' -Body '{"draft":false,"prerelease":false,"make_latest":"false"}'}
        if((Invoke-RestMethod "$api/latest" @auth).id -ne $prior.id){throw 'GitHub Latest changed during publishing'}
        $base="https://github.com/$repository/releases/download/$tag"
        foreach($file in $archive,$installer){
            $stage="read anonymous GitHub $($file.Name)"
            $received=Join-Path $Directory ('readback-github-'+$file.Name)
            Invoke-WebRequest "$base/$($file.Name)" @public -OutFile $received
            Assert-RHFilesCnbFile (Get-Item -LiteralPath $received) $file.Length (Get-FileHash -LiteralPath $file.FullName).Hash
        }
        $url="$base/$($archive.Name)"
    }
    $stage='write verified Mac feed'
    $file=Join-Path (Resolve-Path -LiteralPath $Directory).Path "macos-$($Provider.ToLowerInvariant()).json"
    $feed=@{version=$version;notes=$notes;platforms=@{'darwin-aarch64'=@{url=$url;signature=$signature}}}
    [IO.File]::WriteAllText($file, (($feed|ConvertTo-Json -Depth 8)+"`n"), [Text.UTF8Encoding]::new($false))
    Write-Output "$Provider verified macOS $version. Manifest: $file"
} catch {
    throw "$Provider macOS publication failed at '$stage' ($($_.Exception.GetType().Name))."
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    if($secret){$secret.Dispose()}
    if($client){$client.Dispose()}
    if($lock){$lock.Dispose()}
    $token=$null
    $credentials=$null
    $passwordLine=$null
}
