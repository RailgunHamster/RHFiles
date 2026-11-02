# Release retention must never strand build dependencies on a deleted tag.
# The outer package changes with each release; the extracted executable remains
# independently pinned to the reviewed FFmpeg binary SHA-256.
function ConvertFrom-RHFilesFfmpegFeed($Content) {
    $json=if($Content -is [byte[]]){[Text.UTF8Encoding]::new($false,$true).GetString($Content)}else{[string]$Content}
    if([Text.Encoding]::UTF8.GetByteCount($json) -gt 524288){throw 'FFmpeg recovery metadata exceeds its limit'}
    $json | ConvertFrom-Json -Depth 16
}
function Get-RHFilesFfmpegRecovery($Feed) {
    $packages=@($Feed.Assets | Where-Object {
        $_.PackageId -ceq 'RHFiles' -and $_.Type -ceq 'Full' -and
        $_.Version -match '^\d+\.\d+\.\d+$' -and
        $_.FileName -ceq "RHFiles-$($_.Version)-full.nupkg" -and
        $_.SHA256 -match '^[a-fA-F0-9]{64}$' -and
        [long]$_.Size -gt 0 -and [long]$_.Size -le 1073741824
    } | Sort-Object {[version]$_.Version} -Descending)
    if(-not $packages.Count){throw 'Latest Windows feed contains no verified FFmpeg recovery package'}
    $package=$packages[0]
    [pscustomobject]@{
        Uri="https://github.com/RailgunHamster/RHFiles/releases/latest/download/$($package.FileName)"
        Sha256=$package.SHA256
        Size=[long]$package.Size
        Name=$package.FileName
    }
}
