param([switch]$Release, [switch]$NoMsi)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Compute version: YY.M.D-minutes (e.g. 26.5.30-552)
$now = Get-Date
$minutes = [int]($now.TimeOfDay.TotalMinutes)
$devVer = "$($now.Year - 2000).$($now.Month).$($now.Day)-$minutes"
Write-Host "Dev version: $devVer" -ForegroundColor Cyan

# Patch tauri.conf.json version for this build
$configPath = "src-tauri\tauri.conf.json"
$original = Get-Content $configPath -Raw
$patched = $original -replace '("version"\s*:\s*)"[^"]*"', ('$1"' + $devVer + '"')
Set-Content $configPath $patched -NoNewline

try {
    if ($Release) {
        cargo build --release --manifest-path src-tauri/Cargo.toml
        if (-not $NoMsi) {
            cargo tauri build --bundles msi
            Write-Host "MSI: target\release\bundle\msi\RHFiles_${devVer}_x64_zh-CN.msi" -ForegroundColor Green
        } else {
            Write-Host "EXE: target\release\rhfiles.exe" -ForegroundColor Green
        }
    } else {
        Write-Host "Building debug..." -ForegroundColor Gray
        cargo build --manifest-path src-tauri/Cargo.toml
        Write-Host "EXE: target\debug\rhfiles.exe" -ForegroundColor Green
    }
} finally {
    Set-Content $configPath $original -NoNewline
}