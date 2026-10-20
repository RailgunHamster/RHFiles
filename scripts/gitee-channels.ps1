# Public channel indexes coexist on the repository-wide latest release.
# Payload URLs are always version-tagged; copying an index never copies an APK/package.
function Get-RHFilesWindowsChannelVersion($Feed) {
    $assets=@($Feed.Assets)
    if(-not $assets.Count){throw 'Missing Windows Assets; refusing to publish a false latest channel'}
    foreach($asset in $assets){
        if($asset.PackageId -cne 'RHFiles' -or $asset.Version -notmatch '^\d+\.\d+\.\d+$' -or $asset.Type -notin @('Full','Delta') -or $asset.FileName -cne "RHFiles-$($asset.Version)-$($asset.Type.ToLowerInvariant()).nupkg" -or $asset.SHA256 -notmatch '^[a-fA-F0-9]{64}$' -or [long]$asset.Size -le 0){throw 'Invalid Windows channel asset'}
    }
    $version=($assets | Sort-Object {[version]$_.Version} -Descending | Select-Object -First 1).Version
    if(-not @($assets|Where-Object {$_.Version -eq $version -and $_.Type -eq 'Full'}).Count){throw 'Latest Windows channel has no full package'}
    return $version
}

function Get-RHFilesAndroidChannelCode($Feed) {
    if($Feed.schemaVersion -ne 1 -or $Feed.packageId -cne 'com.railgunhamster.rhfiles' -or -not @($Feed.releases).Count){throw 'Invalid Android companion channel'}
    $release=@($Feed.releases|Sort-Object {[long]$_.versionCode} -Descending)[0]
    if($release.version -notmatch '^\d+\.\d+\.\d+$' -or [long]$release.versionCode -le 0 -or -not @($release.assets).Count){throw 'Invalid Android companion release'}
    return [long]$release.versionCode
}

function Read-RHFilesPublicGiteeFile([string]$Repository,[string]$Name) {
    if($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $Name -notin @('releases.win.json','release-history.json','releases.android.json')){throw 'Invalid public Gitee channel request'}
    try {
        $response=Invoke-WebRequest "https://gitee.com/$Repository/releases/download/latest/$Name" -Headers @{'User-Agent'='RHFiles-Updater';'Cache-Control'='no-cache'} -TimeoutSec 45
        if($response.RawContentLength -gt 2MB){throw 'Channel index exceeds safety limit'}
        return [string]$response.Content
    } catch {
        if([int]$_.Exception.Response.StatusCode -eq 404){return $null}
        throw
    }
}

function Save-RHFilesGiteeCompanionChannels([ValidateSet('Windows','Android')][string]$Platform,[string]$Repository,[string]$Directory) {
    $names=if($Platform -eq 'Windows'){@('releases.android.json')}else{@('releases.win.json','release-history.json')}
    $files=@()
    foreach($name in $names){
        $text=Read-RHFilesPublicGiteeFile $Repository $name
        if(-not $text){
            if($files.Count){throw 'Other platform channel is incomplete; refusing to make it disappear from latest'}
            return @() # Initial bootstrap: the other platform has never been published.
        }
        $value=$text|ConvertFrom-Json
        switch($name){
            'releases.android.json' {$null=Get-RHFilesAndroidChannelCode $value}
            'releases.win.json' {$null=Get-RHFilesWindowsChannelVersion $value}
            'release-history.json' {if($value.schemaVersion -ne 1 -or -not $value.releases){throw 'Invalid Windows release history'}}
        }
        $file=Join-Path $Directory $name
        [IO.File]::WriteAllText($file,$text,[Text.UTF8Encoding]::new($false))
        $files+=Get-Item -LiteralPath $file
    }
    return $files
}

function Assert-RHFilesGiteeCompanionsUnchanged([string]$Repository,$Files) {
    foreach($file in $Files){
        $current=Read-RHFilesPublicGiteeFile $Repository $file.Name
        if($null -eq $current -or $current -cne [IO.File]::ReadAllText($file.FullName)){throw 'Another platform was published during this upload. Release kept prerelease; refresh companion channels before retrying.'}
    }
}
