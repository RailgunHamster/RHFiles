param([switch]$Release, [switch]$NoMsi)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Compute version: YYYY.M.D.minutes_of_day (for filename only)
$now = Get-Date
$minutes = [int]($now.TimeOfDay.TotalMinutes)
$devVer = "$($now.Year).$($now.Month).$($now.Day)-$minutes"
Write-Host "Dev version: $devVer" -ForegroundColor Cyan

if ($Release) {
    cargo build --release --manifest-path src-tauri/Cargo.toml
    if (-not $NoMsi) {
        cargo tauri build --bundles msi
        $msi = Get-ChildItem "target\release\bundle\msi\RHFiles_*_x64_zh-CN.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($msi) {
            $newName = "RHFiles_${devVer}_x64_zh-CN.msi"
            Rename-Item -LiteralPath $msi.FullName -NewName $newName
            Write-Host "MSI: $newName" -ForegroundColor Green
        }
    } else {
        Write-Host "EXE: target\release\rhfiles.exe" -ForegroundColor Green
    }
} else {
    Write-Host "Building debug..." -ForegroundColor Gray
    cargo build --manifest-path src-tauri/Cargo.toml
    Write-Host "EXE: target\debug\rhfiles.exe" -ForegroundColor Green
}