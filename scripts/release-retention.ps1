# Pure retention policy. Unknown tags, drafts and prereleases are never swept.
function Get-RHFilesReleaseClass($Release) {
    $tag=[string]$Release.tag_name
    if($Release.draft -or $Release.prerelease){return $null}
    if($tag -cmatch '^(android|windows|macos|linux)-v(\d+\.\d+\.\d+)$'){return [pscustomobject]@{platform=$Matches[1];version=[version]$Matches[2]}}
    if($tag -cmatch '^v(\d+\.\d+\.\d+)$'){return [pscustomobject]@{platform='windows';version=[version]$Matches[1]}}
    return $null
}
function Get-RHFilesAssetPlatform([string]$Name) {
    if($Name -match '(?i)macos|\.dmg$|\.app\.zip$'){return 'macos'}
    if($Name -match '(?i)linux|\.AppImage$|\.deb$|\.rpm$'){return 'linux'}
    if($Name -match '(?i)\.apk$'){return 'android'}
    if($Name -match '(?i)\.exe$|\.nupkg$|portable.*\.zip$|^RELEASES$|^releases\.win\.json$'){return 'windows'}
    return $null
}
function Get-RHFilesRetentionPlan($Releases,[ValidateRange(1,20)][int]$Keep=3,[string[]]$ProtectedTags=@()) {
    $records=@();$byPlatform=@{}
    foreach($release in $Releases){
        $class=Get-RHFilesReleaseClass $release;if(-not $class){continue}
        $platforms=@($class.platform)+@($release.assets|ForEach-Object {Get-RHFilesAssetPlatform $_.name}|Where-Object {$_ -in @('macos','linux')})|Select-Object -Unique
        $record=[pscustomobject]@{release=$release;version=$class.version;platforms=@($platforms)};$records+=,$record
        foreach($platform in $platforms){if(-not $byPlatform.ContainsKey($platform)){$byPlatform[$platform]=@()};$byPlatform[$platform]+=,$record}
    }
    $kept=@{};$keptPlatforms=@{}
    foreach($platform in $byPlatform.Keys){foreach($record in @($byPlatform[$platform]|Sort-Object version -Descending|Select-Object -First $Keep)){$id=[string]$record.release.id;$kept[$id]=$true;if(-not $keptPlatforms.ContainsKey($id)){$keptPlatforms[$id]=@()};$keptPlatforms[$id]+=$platform}}
    foreach($record in $records){if($record.release.tag_name -cin $ProtectedTags){$kept[[string]$record.release.id]=$true;$keptPlatforms[[string]$record.release.id]=$record.platforms}}
    $remove=@();$trim=@();$keepList=@()
    foreach($record in $records){
        $r=$record.release;$id=[string]$r.id
        if(-not $kept.ContainsKey($id)){$remove+=,$r;continue}
        $platforms=@($keptPlatforms[$id]);$keepList+=,[pscustomobject]@{id=$id;tag=$r.tag_name;platforms=$platforms}
        # A legacy combined release may be the only macOS/Linux build. Retain
        # its native assets without retaining an obsolete Windows package set.
        if('windows' -in $record.platforms -and 'windows' -notin $platforms -and $r.tag_name -cnotin $ProtectedTags){
            $assets=@($r.assets|Where-Object { (Get-RHFilesAssetPlatform $_.name) -eq 'windows' })
            if($assets.Count){$trim+=,[pscustomobject]@{release=$r;assets=$assets}}
        }
    }
    [pscustomobject]@{keep=$keepList;delete=$remove;trim=$trim;ignored=@($Releases|Where-Object {-not (Get-RHFilesReleaseClass $_)})}
}
