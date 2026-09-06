param(
    [string]$Version = "",
    [string]$OutputDirectory = "",
    [string]$UpdateSource = "https://github.com/RailgunHamster/RHFiles",
    [string]$PublishDirectory = "",
    [string]$PortableName = "",
    [switch]$SkipBuild,
    [switch]$SkipPreviousRelease
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$stageDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "dist\velopack-stage"))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "dist\velopack-releases"
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)

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

if ([string]::IsNullOrWhiteSpace($Version)) {
    $cargoManifest = Get-Content -LiteralPath (Join-Path $repoRoot "src-tauri\Cargo.toml") -Raw
    $versionMatch = [regex]::Match($cargoManifest, '(?m)^version\s*=\s*"([^"]+)"')
    if (-not $versionMatch.Success) {
        throw "Unable to read the RHFiles version from src-tauri/Cargo.toml"
    }
    $Version = $versionMatch.Groups[1].Value
}

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Version must be a semantic version, for example 0.2.0: $Version"
}

$vpk = Get-Command vpk -ErrorAction SilentlyContinue
if (-not $vpk) {
    throw "Velopack CLI was not found. Install it with: dotnet tool install --global vpk --version 1.2.0"
}

if (-not $SkipBuild) {
    Push-Location $repoRoot
    try {
        cargo build --release --locked --package rhfiles-tauri
        if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

$releaseExe = Join-Path $repoRoot "target\release\rhfiles.exe"
if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) {
    throw "Release executable was not found: $releaseExe"
}

Reset-WorkspaceDirectory $stageDirectory "Velopack staging directory"
Reset-WorkspaceDirectory $OutputDirectory "Velopack output directory"

Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $stageDirectory "RHFiles.exe")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\thirdparty\everything.exe") -Destination (Join-Path $stageDirectory "Everything.exe")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\thirdparty\everything\dll\Everything64.dll") -Destination (Join-Path $stageDirectory "Everything64.dll")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\thirdparty\Everything.lng") -Destination (Join-Path $stageDirectory "Everything.lng")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\thirdparty\dust.exe") -Destination (Join-Path $stageDirectory "dust.exe")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\thirdparty\dust-LICENSE.txt") -Destination (Join-Path $stageDirectory "dust-LICENSE.txt")
Copy-Item -LiteralPath (Join-Path $repoRoot "docs\PORTABLE_README.zh-CN.txt") -Destination (Join-Path $stageDirectory "使用说明.txt")

if (-not $SkipPreviousRelease -and $UpdateSource -match '^https://github\.com/') {
    $downloadExitCode = 0
    try {
        & $vpk.Source download github --outputDir $OutputDirectory --channel win --repoUrl $UpdateSource
        $downloadExitCode = $LASTEXITCODE
    } catch {
        $downloadExitCode = 1
        Write-Warning $_.Exception.Message
    }
    if ($downloadExitCode -ne 0) {
        Write-Warning "No previous GitHub release could be downloaded; a full package will be created."
        $global:LASTEXITCODE = 0
    }
}

$notesPath = Join-Path $repoRoot "docs\release-notes\$Version.md"
$packArguments = @(
    "pack",
    "--outputDir", $OutputDirectory,
    "--channel", "win",
    "--packId", "RHFiles",
    "--packVersion", $Version,
    "--packDir", $stageDirectory,
    "--packAuthors", "RailgunHamster",
    "--packTitle", "RHFiles",
    "--mainExe", "RHFiles.exe",
    "--icon", (Join-Path $repoRoot "src-tauri\icons\rhfiles-icon-v3.ico")
)
if (Test-Path -LiteralPath $notesPath -PathType Leaf) {
    $packArguments += @("--releaseNotes", $notesPath)
}

& $vpk.Source @packArguments
if ($LASTEXITCODE -ne 0) { throw "vpk pack failed with exit code $LASTEXITCODE" }

$portableSource = @(
    (Join-Path $OutputDirectory "RHFiles-win-Portable.zip"),
    (Join-Path $OutputDirectory "RHFiles-Portable.zip")
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $portableSource) {
    $portableSource = Get-ChildItem -LiteralPath $OutputDirectory -Filter "*-Portable.zip" -File | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $portableSource) {
    throw "Velopack did not create a portable archive in: $OutputDirectory"
}
if ([string]::IsNullOrWhiteSpace($PortableName)) {
    $PortableName = "RHFiles-$Version-portable-x64.zip"
}
if ([IO.Path]::GetFileName($PortableName) -ne $PortableName -or -not $PortableName.EndsWith('.zip', [StringComparison]::OrdinalIgnoreCase)) {
    throw "PortableName must be a .zip file name without a directory: $PortableName"
}
$portableName = $PortableName
$portableOutput = Join-Path $OutputDirectory $portableName
Copy-Item -LiteralPath $portableSource -Destination $portableOutput -Force

if (-not [string]::IsNullOrWhiteSpace($PublishDirectory)) {
    $publishRoot = [IO.Path]::GetFullPath($PublishDirectory)
    New-Item -ItemType Directory -Path $publishRoot -Force | Out-Null
    $feedDirectory = Join-Path $publishRoot "RHFiles-Releases"
    New-Item -ItemType Directory -Path $feedDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath $OutputDirectory -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $feedDirectory $_.Name) -Force
    }
    Copy-Item -LiteralPath $portableOutput -Destination (Join-Path $publishRoot $portableName) -Force
}

$hash = Get-FileHash -LiteralPath $portableOutput -Algorithm SHA256
[pscustomobject]@{
    Version = $Version
    Portable = $portableOutput
    UpdateFeed = $OutputDirectory
    Sha256 = $hash.Hash
}
