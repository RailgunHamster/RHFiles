# Local, independent of GitHub Actions. Requires PowerShell 7 and a verified
# ordinary release directory. Does not build, sign, overwrite or delete packages.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Windows','Android')][string]$Platform,
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Commit,
    [string]$Repository='railgunhamster/RHFiles',
    [string]$TokenFile="$env:LOCALAPPDATA\RHFiles-Publishing\cnb-token.xml"
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'Use PowerShell 7 (pwsh)'}
. (Join-Path $PSScriptRoot 'cnb-release.ps1')
Assert-RHFilesCnbRepository $Repository
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('rhfiles-cnb-publish-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $scratch
$client=New-RHFilesCnbHttpClient
$pointer=[IntPtr]::Zero;$token=$null;$secret=$null;$lock=$null;$stage='local validation'
try {
    # All local publishers using this credential directory serialize. The
    # remote companion snapshot is rechecked too; another host may publish.
    $lock=[IO.File]::Open((Join-Path (Split-Path -Parent $TokenFile) 'cnb-publish.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $metadata=if($Platform -eq 'Windows'){'releases.win.json'}else{'releases.android.json'}
    $feed=Read-RHFilesCnbJsonFile (Join-Path $Directory $metadata)
    $channelVersion=Get-RHFilesCnbChannelVersion $Platform $feed
    $files=@()
    if($Platform -eq 'Windows'){
        $version=$channelVersion;$tag="v$version"
        $assets=@($feed.Assets|Where-Object Version -eq $version)
        foreach($asset in $assets){$file=Get-Item -LiteralPath (Join-Path $Directory $asset.FileName);Assert-RHFilesCnbFile $file $asset.Size $asset.SHA256;$files+=,$file}
        # Historical GitHub payloads need not be mirrored to CNB.
        $feed=@{Assets=$assets}
        $history=Get-Item -LiteralPath (Join-Path $Directory 'release-history.json')
        Assert-RHFilesCnbHistory (Read-RHFilesCnbJsonFile $history.FullName)
        $files+=,$history
        foreach($name in @("RHFiles-$version-portable-x64.zip",'RHFiles-win-Setup.exe')){$files+=, (Get-Item -LiteralPath (Join-Path $Directory $name))}
        $notes=($assets|Where-Object Type -eq 'Full'|Select-Object -First 1).NotesMarkdown
    } else {
        $release=@($feed.releases|Sort-Object {[long]$_.versionCode} -Descending)[0]
        $version=$release.version;$tag="android-v$version"
        foreach($asset in $release.assets){$file=Get-Item -LiteralPath (Join-Path $Directory $asset.fileName);Assert-RHFilesCnbFile $file $asset.size $asset.sha256;$files+=,$file}
        $release|Add-Member -NotePropertyName cnbTag -NotePropertyValue $tag -Force
        $feed=[ordered]@{schemaVersion=1;packageId='com.railgunhamster.rhfiles';releases=@($release)}
        $notes=$release.notes
    }
    $snapshot=@{};$companion=@();$priorOwn=$null
    foreach($name in @('releases.win.json','release-history.json','releases.android.json')){
        $destination=Join-Path $scratch ('prior-'+$name)
        $exists=Receive-RHFilesCnbPublicFile $client (Get-RHFilesCnbPublicUrl $Repository latest $name) $destination 2MB -AllowMissing
        $snapshot[$name]=if($exists){(Get-FileHash -LiteralPath $destination).Hash}else{$null}
        if(-not $exists){continue}
        $value=Read-RHFilesCnbJsonFile $destination
        switch($name){
            'releases.win.json' {$null=Get-RHFilesCnbChannelVersion Windows $value}
            'releases.android.json' {$null=Get-RHFilesCnbChannelVersion Android $value}
            'release-history.json' {Assert-RHFilesCnbHistory $value}
        }
        if($name -eq $metadata){$priorOwn=$value}
        if(($Platform -eq 'Windows' -and $name -eq 'releases.android.json') -or ($Platform -eq 'Android' -and $name -in @('releases.win.json','release-history.json'))){
            $copy=Join-Path $scratch $name
            Copy-Item -LiteralPath $destination -Destination $copy
            $companion+=Get-Item -LiteralPath $copy
        }
    }
    if([bool]$snapshot['releases.win.json'] -ne [bool]$snapshot['release-history.json']){throw 'Latest Windows feed/history incomplete; do not hide the other platform'}
    if($priorOwn){
        $priorVersion=Get-RHFilesCnbChannelVersion $Platform $priorOwn
        if(($Platform -eq 'Windows' -and [version]$priorVersion -gt [version]$channelVersion) -or ($Platform -eq 'Android' -and [long]$priorVersion -gt [long]$channelVersion)){throw 'Refusing to regress the latest channel'}
        if($Platform -eq 'Android'){
            # Keep CNB history only after its payloads have been published. Do
            # not blindly import older entries from another provider's feed.
            $feed.releases+=@($priorOwn.releases|Where-Object {[long]$_.versionCode -lt [long]$channelVersion})
        }
    }
    [IO.File]::WriteAllText((Join-Path $scratch $metadata),($feed|ConvertTo-Json -Depth 30 -Compress),[Text.UTF8Encoding]::new($false))
    $files+=Get-Item -LiteralPath (Join-Path $scratch $metadata)
    $files+=$companion
    $names=@{}
    foreach($file in $files){if($names.ContainsKey($file.Name)){throw 'Duplicate local asset name'};$names[$file.Name]=$true}
    $stage='API authentication'
    $secret=Import-Clixml -LiteralPath $TokenFile
    if($secret -isnot [Security.SecureString]){throw 'Expected a locally encrypted SecureString token'}
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    # Assert public repository before attaching any file. Anonymous downloads
    # remain the definitive client-facing verification below.
    $parent=$Repository.Substring(0,$Repository.LastIndexOf('/'))
    $repositoryName=$Repository.Substring($Repository.LastIndexOf('/')+1)
    $repos=Invoke-RHFilesCnbApi $client $token "/$parent/-/repos?descendant=sub&search=$([uri]::EscapeDataString($repositoryName))"
    $matching=@($repos|Where-Object {$_.path -ceq $Repository})
    if($matching.Count -ne 1 -or $matching[0].visibility_level -ine 'Public'){throw 'CNB repository must be public'}
    $stage='release staging'
    $remote=Invoke-RHFilesCnbApi $client $token "/$Repository/-/releases/tags/$tag" -AllowMissing
    if(-not $remote){
        $null=Invoke-RHFilesCnbApi $client $token "/$Repository/-/releases" POST @{tag_name=$tag;target_commitish=$Commit;name="RHFiles $Platform $version";body=$notes;draft=$false;prerelease=$true;make_latest='false'}
        $remote=Invoke-RHFilesCnbApi $client $token "/$Repository/-/releases/tags/$tag"
    }
    if($remote.tag_name -cne $tag -or $remote.tag_commitish -ine $Commit -or $remote.id -notmatch '^[A-Za-z0-9_-]+$'){throw 'Release source commit/identity mismatch; refusing to mutate it'}
    foreach($file in $files){
        $stage="asset $($file.Name)"
        $remote=Invoke-RHFilesCnbApi $client $token "/$Repository/-/releases/$($remote.id)"
        $existing=@($remote.assets|Where-Object name -CEQ $file.Name)
        if($existing.Count -gt 1){throw 'Duplicate remote asset'}
        if(-not $existing.Count){
            if(-not $remote.prerelease -or $remote.draft){throw 'Published/draft release is incomplete; refusing to change it'}
            Send-RHFilesCnbAsset $client $token $Repository $remote.id $file
        }
        $verified=Join-Path $scratch ('verified-'+$file.Name)
        $null=Receive-RHFilesCnbPublicFile $client (Get-RHFilesCnbPublicUrl $Repository $tag $file.Name) $verified $file.Length
        Assert-RHFilesCnbFile (Get-Item -LiteralPath $verified) $file.Length (Get-FileHash -LiteralPath $file.FullName).Hash
        Write-Output "Verified anonymous CNB asset: $($file.Name)"
    }
    if($remote.prerelease){
        $stage='latest-channel promotion'
        Assert-RHFilesCnbSnapshotUnchanged $client $Repository $snapshot $scratch
        $null=Invoke-RHFilesCnbApi $client $token "/$Repository/-/releases/$($remote.id)" PATCH @{prerelease=$false;draft=$false;make_latest='true'}
    }
    $stage='latest-channel readback'
    foreach($file in @($files|Where-Object {$_.Name -in @('releases.win.json','release-history.json','releases.android.json')})){
        $readback=Join-Path $scratch ('latest-'+$file.Name)
        $null=Receive-RHFilesCnbPublicFile $client (Get-RHFilesCnbPublicUrl $Repository latest $file.Name) $readback 2MB
        Assert-RHFilesCnbFile (Get-Item -LiteralPath $readback) $file.Length (Get-FileHash -LiteralPath $file.FullName).Hash
    }
    Write-Output "Published https://cnb.cool/$Repository/-/releases/tag/$tag"
} catch {
    # No exception text: HTTP handlers can include signed object URLs, upload
    # tokens or headers. Safe stage + retained artifacts are enough to resume.
    $status=[regex]::Match($_.Exception.Message,'HTTP [0-9]{3}').Value
    $location=($_.ScriptStackTrace -split "`n"|Select-Object -First 1)
    throw "CNB publication stopped at '$stage' ($($_.Exception.GetType().Name) $status; $location). No automatic write retry, overwrite or deletion. Verification directory: $scratch"
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $token=$null
    if($secret){$secret.Dispose()};if($lock){$lock.Dispose()};$client.Dispose()
}
