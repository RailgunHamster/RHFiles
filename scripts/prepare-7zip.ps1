param(
    [string]$Proxy = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$thirdPartyDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\thirdparty"))
$workDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "temp\7zip-26.03"))
$extractDirectory = Join-Path $workDirectory "extracted"
$destinationExe = Join-Path $thirdPartyDirectory "7z.exe"
$destinationDll = Join-Path $thirdPartyDirectory "7z.dll"
$destinationLicense = Join-Path $thirdPartyDirectory "7zip-LICENSE.txt"

# 7-Zip 26.03 (2026-09-03). The full console version (7z.exe + 7z.dll, with RAR
# extraction support) ships inside the official x64 installer; the "extra"
# package only carries the reduced 7za.exe. The installer is a 7-Zip SFX, so
# the pinned standalone 7zr.exe can unpack it without any preinstalled 7-Zip.
$installerUrl = "https://github.com/ip7z/7zip/releases/download/26.03/7z2603-x64.exe"
$installerFallbackUrl = "https://www.7-zip.org/a/7z2603-x64.exe"
$installerSha256 = "0859C524B8A63551848F0C246ABDDCB1D0B7B656B0FBFE879F8D85E61A9E6EDD"
$sevenZrUrl = "https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe"
$sevenZrFallbackUrl = "https://www.7-zip.org/7zr.exe"
$sevenZrSha256 = "AD4C82FADCBDF93C03B4FC440F300509C7D60C5C2F4D183E35D9D70D6957037D"
$expectedExeSha256 = "6EE3C0ED0B27663C1B948AE85A7C0BB073AED1498983182F3F0DF1F6A8C30B2F"
$expectedDllSha256 = "65E4C1F855F9EF6E8F0F5DF8E3F27D9EB5F07311408639DA0A1CA0B8F4871B0D"

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

function Test-PinnedSevenZip([string]$ExePath, [string]$DllPath) {
    if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $DllPath -PathType Leaf)) { return $false }
    try {
        if ((Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash -ne $expectedExeSha256) { return $false }
        if ((Get-FileHash -LiteralPath $DllPath -Algorithm SHA256).Hash -ne $expectedDllSha256) { return $false }
        $versionOutput = & $ExePath 2>$null
        $versionExitCode = $LASTEXITCODE
        # 7z.exe prints a blank line before the version banner.
        $firstLine = $versionOutput | Where-Object { "$_".Trim() } | Select-Object -First 1
        return $versionExitCode -eq 0 -and $firstLine -match '^7-Zip 26\.03\b'
    } catch {
        return $false
    }
}

function Save-VerifiedFile([string]$PrimaryUrl, [string]$FallbackUrl, [string]$ExpectedSha256, [string]$DestinationPath, [string]$Description) {
    $downloadArguments = @{
        Uri = $PrimaryUrl
        OutFile = $DestinationPath
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
                Write-Warning "$Description download attempt $attempt failed; retrying. $($_.Exception.Message)"
                Start-Sleep -Seconds ([Math]::Min(16, [Math]::Pow(2, $attempt)))
            }
        }
    }
    $source = $PrimaryUrl
    if (-not $downloaded) {
        Write-Warning "The primary $Description source is unavailable; falling back to 7-zip.org. $($lastDownloadError.Exception.Message)"
        $downloadArguments.Uri = $FallbackUrl
        $downloadArguments.OutFile = $DestinationPath
        $source = $FallbackUrl
        $lastDownloadError = $null
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Invoke-WebRequest @downloadArguments
                $downloaded = $true
                break
            } catch {
                $lastDownloadError = $_
                if ($attempt -lt 3) {
                    Write-Warning "$Description fallback download attempt $attempt failed; retrying. $($_.Exception.Message)"
                    Start-Sleep -Seconds ([Math]::Pow(2, $attempt))
                }
            }
        }
        if (-not $downloaded) {
            throw "Unable to download $Description from either source: $($lastDownloadError.Exception.Message)"
        }
    }
    $receivedSha256 = (Get-FileHash -LiteralPath $DestinationPath -Algorithm SHA256).Hash
    if ($receivedSha256 -ne $ExpectedSha256) {
        throw "$Description checksum mismatch. Expected $ExpectedSha256, received $receivedSha256"
    }
    return $source
}

if (-not $Force -and (Test-PinnedSevenZip $destinationExe $destinationDll) -and
    (Test-Path -LiteralPath $destinationLicense -PathType Leaf)) {
    [pscustomobject]@{
        Version = "26.03"
        Executable = $destinationExe
        Reused = $true
        Sha256 = (Get-FileHash -LiteralPath $destinationExe -Algorithm SHA256).Hash
    }
    return
}

Reset-WorkspaceDirectory $workDirectory "7-Zip preparation directory"
New-Item -ItemType Directory -Path $thirdPartyDirectory -Force | Out-Null

$sevenZrPath = Join-Path $workDirectory "7zr.exe"
$null = Save-VerifiedFile $sevenZrUrl $sevenZrFallbackUrl $sevenZrSha256 $sevenZrPath "7zr.exe"
$installerPath = Join-Path $workDirectory "7z2603-x64.exe"
$installerSource = Save-VerifiedFile $installerUrl $installerFallbackUrl $installerSha256 $installerPath "7-Zip installer"

New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null
& $sevenZrPath x $installerPath "-o$extractDirectory" -y 7z.exe 7z.dll License.txt | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "7zr failed to extract 7z.exe and 7z.dll from the installer (exit code $LASTEXITCODE)"
}

$sourceExe = Join-Path $extractDirectory "7z.exe"
$sourceDll = Join-Path $extractDirectory "7z.dll"
$sourceLicense = Join-Path $extractDirectory "License.txt"
foreach ($required in @($sourceExe, $sourceDll, $sourceLicense)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "The verified installer did not contain $(Split-Path -Leaf $required)"
    }
}
if (-not (Test-PinnedSevenZip $sourceExe $sourceDll)) {
    throw "The extracted 7-Zip binaries did not verify as version 26.03"
}

Copy-Item -LiteralPath $sourceExe -Destination $destinationExe -Force
Copy-Item -LiteralPath $sourceDll -Destination $destinationDll -Force
Copy-Item -LiteralPath $sourceLicense -Destination $destinationLicense -Force
if (-not (Test-PinnedSevenZip $destinationExe $destinationDll)) {
    throw "The staged 7-Zip binaries did not verify as version 26.03"
}

[pscustomobject]@{
    Version = "26.03"
    Executable = $destinationExe
    Reused = $false
    Source = $installerSource
    ArchiveSha256 = $installerSha256
    Sha256 = (Get-FileHash -LiteralPath $destinationExe -Algorithm SHA256).Hash
}
