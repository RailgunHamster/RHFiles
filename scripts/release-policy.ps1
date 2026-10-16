# Shared pure policy used by packaging, release preflight and regression tests.
function Compare-RHFilesVersion([string]$Left, [string]$Right) {
    $pattern='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
    $a=[regex]::Match($Left,$pattern);$b=[regex]::Match($Right,$pattern)
    if(-not $a.Success -or -not $b.Success){throw 'Invalid semantic version'}
    foreach($m in @($a,$b)){foreach($part in $m.Groups[4].Value.Split('.')){if($part -match '^0[0-9]+$'){throw 'Numeric prerelease identifiers cannot have leading zeros'}}}
    foreach($i in 1..3){$order=([System.Numerics.BigInteger]::Parse($a.Groups[$i].Value)).CompareTo([System.Numerics.BigInteger]::Parse($b.Groups[$i].Value));if($order){return [Math]::Sign($order)}}
    $ap=$a.Groups[4].Value;$bp=$b.Groups[4].Value
    if(-not $ap -and -not $bp){return 0};if(-not $ap){return 1};if(-not $bp){return -1}
    $aa=$ap.Split('.');$bb=$bp.Split('.')
    for($i=0;$i -lt [Math]::Min($aa.Count,$bb.Count);$i++){
        $an=$aa[$i] -match '^[0-9]+$';$bn=$bb[$i] -match '^[0-9]+$'
        if($an -and $bn){$order=([System.Numerics.BigInteger]::Parse($aa[$i])).CompareTo([System.Numerics.BigInteger]::Parse($bb[$i]))}
        elseif($an -ne $bn){$order=if($an){-1}else{1}}
        else{$order=[string]::CompareOrdinal($aa[$i],$bb[$i])}
        if($order){return [Math]::Sign($order)}
    }
    return [Math]::Sign($aa.Count-$bb.Count)
}
function Select-RHFilesPreviousPackage([string]$Directory,[string]$Version) {
    $best=$null;$bestVersion=$null
    foreach($file in Get-ChildItem -LiteralPath $Directory -Filter 'RHFiles-*-full.nupkg' -File){
        if($file.Name -notmatch '^RHFiles-(.+)-full\.nupkg$'){continue};$candidate=$Matches[1]
        if((Compare-RHFilesVersion $candidate $Version) -ge 0){continue}
        if(-not $best -or (Compare-RHFilesVersion $candidate $bestVersion) -gt 0){$best=$file;$bestVersion=$candidate}
    }
    return $best
}
function Assert-RHFilesPublishedRelease($Release,$Feed,[string]$Version) {
    if($Release.draft -or $Release.prerelease -or $Release.tag_name -cne "v$Version"){throw 'Existing release is not the expected stable version; refusing to replace it'}
    $assets=@($Release.assets)
    foreach($required in @('releases.win.json','release-history.json',"RHFiles-$Version-full.nupkg")){
        $requiredAssets=@($assets|Where-Object name -CEQ $required)
        if($requiredAssets.Count -ne 1 -or [long]$requiredAssets[0].size -le 0 -or $requiredAssets[0].digest -notmatch '^sha256:[0-9A-Fa-f]{64}$'){throw "Published release is incomplete or ambiguous: $required"}
    }
    foreach($alternatives in @(@('RHFiles-win-Portable.zip','RHFiles-Portable.zip',"RHFiles-$Version-portable-x64.zip"),@('RHFiles-win-Setup.exe','RHFiles-Setup.exe'))){
        $selected=@($assets|Where-Object {$_.name -cin $alternatives -and [long]$_.size -gt 0 -and $_.digest -match '^sha256:[0-9A-Fa-f]{64}$'})
        if(-not $selected.Count){throw 'Published release lacks verified portable/installer assets'}
    }
    $entry=@($Feed.Assets|Where-Object {$_.PackageId -ceq 'RHFiles' -and $_.Version -ceq $Version -and $_.Type -ceq 'Full'})
    if($entry.Count -ne 1 -or $entry[0].FileName -cne "RHFiles-$Version-full.nupkg"){throw 'Published update feed does not identify the expected full package'}
    $remote=@($assets|Where-Object name -CEQ $entry[0].FileName)[0]
    if($entry[0].SHA256 -notmatch '^[0-9A-Fa-f]{64}$' -or $remote.digest -ine ('sha256:'+$entry[0].SHA256) -or [long]$entry[0].Size -le 0 -or [long]$remote.size -ne [long]$entry[0].Size){throw 'Published package checksum or size does not match the update feed'}
    return $true
}
