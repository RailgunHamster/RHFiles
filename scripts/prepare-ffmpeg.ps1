param(
    [string]$Proxy = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$thirdPartyDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\thirdparty"))
$workDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "temp\ffmpeg-9.0.1"))
$archivePath = Join-Path $workDirectory "ffmpeg-9.0.1-essentials_build.7z"
$extractDirectory = Join-Path $workDirectory "extracted"
$destinationExe = Join-Path $thirdPartyDirectory "ffmpeg.exe"
$destinationLicense = Join-Path $thirdPartyDirectory "ffmpeg-LICENSE.txt"
$destinationReadme = Join-Path $thirdPartyDirectory "ffmpeg-README.txt"
$downloadUrl = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.7z"
$expectedArchiveSha256 = "49A73BDF0850092A252AC4641D922F3048D63ED113E196CC65CE1E4F7FB33E85"
$expectedBinarySha256 = "72A489ECCD008C2EC2C0A5856C5C75BC3D8BBFA90166C4566865C246445E6AA3"

function Assert-WorkspaceChild([string]$Path, [string]$Description) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $workspacePrefix = $repoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description must stay inside the repository: $fullPath"
    }
    return $fullPath
}

function Reset-WorkspaceDirectory([string]$Path, [string]$Description) {
    $safePath = Assert-WorkspaceChild $Path $Description
    if (Test-Path -LiteralPath $safePath) {
        Remove-Item -LiteralPath $safePath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $safePath -Force | Out-Null
}

function Test-PinnedFfmpeg([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $expectedBinarySha256) {
            return $false
        }
        $versionOutput = & $Path -version 2>$null
        $versionExitCode = $LASTEXITCODE
        $firstLine = $versionOutput | Select-Object -First 1
        return $versionExitCode -eq 0 -and $firstLine -match '^ffmpeg version 9\.0\.1(?:-|\s)'
    } catch {
        return $false
    }
}

if (-not $Force -and (Test-PinnedFfmpeg $destinationExe) -and
    (Test-Path -LiteralPath $destinationLicense -PathType Leaf) -and
    (Test-Path -LiteralPath $destinationReadme -PathType Leaf)) {
    [pscustomobject]@{
        Version = "9.0.1"
        Executable = $destinationExe
        Reused = $true
        Sha256 = (Get-FileHash -LiteralPath $destinationExe -Algorithm SHA256).Hash
    }
    return
}

Reset-WorkspaceDirectory $workDirectory "FFmpeg preparation directory"
New-Item -ItemType Directory -Path $thirdPartyDirectory -Force | Out-Null

$downloadArguments = @{
    Uri = $downloadUrl
    OutFile = $archivePath
    TimeoutSec = 300
}
if (-not [string]::IsNullOrWhiteSpace($Proxy)) {
    $downloadArguments.Proxy = $Proxy
}
$downloaded = $false
$lastDownloadError = $null
for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
        Invoke-WebRequest @downloadArguments
        $downloaded = $true
        break
    } catch {
        $lastDownloadError = $_
        if ($attempt -lt 5) {
            Write-Warning "FFmpeg download attempt $attempt failed; retrying. $($_.Exception.Message)"
            Start-Sleep -Seconds ([Math]::Min(16, [Math]::Pow(2, $attempt)))
        }
    }
}
if (-not $downloaded) {
    throw "Unable to download the pinned FFmpeg build after 5 attempts: $($lastDownloadError.Exception.Message)"
}

$archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($archiveSha256 -ne $expectedArchiveSha256) {
    throw "FFmpeg archive checksum mismatch. Expected $expectedArchiveSha256, received $archiveSha256"
}

$sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
if (-not $sevenZip) {
    @(
        "C:\Program Files\7-Zip\7z.exe",
        "C:\Program Files (x86)\7-Zip\7z.exe"
    ) | ForEach-Object {
        if (-not $sevenZip -and (Test-Path -LiteralPath $_ -PathType Leaf)) {
            $sevenZip = Get-Item -LiteralPath $_
        }
    }
}
if (-not $sevenZip) {
    throw "7-Zip is required to prepare the bundled FFmpeg executable"
}
$sevenZipPath = if ($sevenZip.Source) { $sevenZip.Source } else { $sevenZip.FullName }

New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null
& $sevenZipPath x $archivePath "-o$extractDirectory" -y | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "7-Zip failed to extract FFmpeg (exit code $LASTEXITCODE)"
}

$sourceExe = Get-ChildItem -LiteralPath $extractDirectory -Recurse -Filter "ffmpeg.exe" -File | Select-Object -First 1
$sourceLicense = Get-ChildItem -LiteralPath $extractDirectory -Recurse -Filter "LICENSE" -File | Select-Object -First 1
$sourceReadme = Get-ChildItem -LiteralPath $extractDirectory -Recurse -Filter "README.txt" -File | Select-Object -First 1
if (-not $sourceExe -or -not $sourceLicense -or -not $sourceReadme) {
    throw "The verified FFmpeg archive did not contain ffmpeg.exe, LICENSE, and README.txt"
}

Copy-Item -LiteralPath $sourceExe.FullName -Destination $destinationExe -Force
Copy-Item -LiteralPath $sourceLicense.FullName -Destination $destinationLicense -Force
Copy-Item -LiteralPath $sourceReadme.FullName -Destination $destinationReadme -Force
if (-not (Test-PinnedFfmpeg $destinationExe)) {
    throw "The extracted FFmpeg executable did not report version 9.0.1"
}

[pscustomobject]@{
    Version = "9.0.1"
    Executable = $destinationExe
    Reused = $false
    ArchiveSha256 = $archiveSha256
    Sha256 = (Get-FileHash -LiteralPath $destinationExe -Algorithm SHA256).Hash
}
