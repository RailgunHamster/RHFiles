# Read-only version authority. Desktop and Android intentionally do not compare
# with each other. Keep Android's OS installation counter explicit and stable
# across ABI builds; never auto-increment it on a developer's machine.
function Get-RHFilesPlatformVersion {
    param([ValidateSet('Desktop','Android')][string]$Platform,[string]$Root=(Split-Path -Parent $PSScriptRoot))
    $directory=if($Platform -eq 'Android'){'android/src-tauri'}else{'src-tauri'}
    $config=Get-Content -LiteralPath (Join-Path $Root "$directory/tauri.conf.json") -Raw | ConvertFrom-Json
    $cargo=Get-Content -LiteralPath (Join-Path $Root "$directory/Cargo.toml") -Raw
    $package=[regex]::Match($cargo,'(?ms)^\[package\]\s*\r?\n(.*?)(?=^\[|\z)').Groups[1].Value
    $version=[regex]::Match($package,'(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
    if($version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $config.version -cne $version){throw "$Platform Cargo/Tauri stable versions differ or are invalid"}
    $code=$null
    if($Platform -eq 'Android'){
        $code=$config.bundle.android.versionCode
        if($code -isnot [long] -and $code -isnot [int]){throw 'Android versionCode must be an explicit integer'}
        if($code -lt 1 -or $code -gt 2100000000){throw 'Android versionCode is outside the supported range'}
        if($config.bundle.android.autoIncrementVersionCode){throw 'Android versionCode must not change between ABI builds'}
        if($config.identifier -cne 'com.railgunhamster.rhfiles'){throw 'Unexpected Android package identity'}
    }
    [pscustomobject]@{Platform=$Platform;Version=$version;VersionCode=$code;Tag=$(if($Platform -eq 'Android'){"android-v$version"}else{"v$version"})}
}
function Assert-RHFilesPlatformTag {
    param($Version,[string]$Tag)
    if($Tag -cne $Version.Tag){throw "Wrong platform tag: expected $($Version.Tag), received $Tag"}
}
function Assert-RHFilesAndroidHistory {
    param([string]$Version,[long]$Code,[object[]]$History)
    . (Join-Path $PSScriptRoot 'release-policy.ps1')
    foreach($previous in $History){
        if($previous.version -ceq $Version -and [long]$previous.versionCode -ne $Code){throw 'A published Android version cannot be assigned another versionCode'}
        if([long]$previous.versionCode -eq $Code -and $previous.version -cne $Version){throw 'An Android versionCode cannot be reused for a different version'}
        if([long]$previous.versionCode -ne $Code -and ((Compare-RHFilesVersion $previous.version $Version) -ge 0 -or [long]$previous.versionCode -ge $Code)){throw 'New Android releases must increase both version and versionCode; do not replace or downgrade published packages'}
    }
}
