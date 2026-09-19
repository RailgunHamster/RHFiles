# test-gui.ps1 — Build, launch, and run automated GUI tests for RHFiles
param(
    [switch]$NoBuild,
    [switch]$KeepOpen,
    [int]$Timeout = 90,
    [string]$ExecutablePath = "",
    [string]$UpdateSource = "",
    # Run the suite over the DevTools protocol instead of the harness auto-run.
    # This is the mode that works on a headless/disconnected session, where the
    # hidden window never initialises its WebView and no results are ever written.
    [int]$CdpPort = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

if (-not $NoBuild) {
    Write-Host "`n[1/3] Building RHFiles (debug)..." -ForegroundColor Cyan
    cargo build --manifest-path (Join-Path $ProjectRoot "src-tauri\Cargo.toml") 2>&1 | ForEach-Object {
        if ($_ -match "^error") { Write-Host $_ -ForegroundColor Red }
    }
    Write-Host "Build done." -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build (-NoBuild)" -ForegroundColor Gray
}

$exePath = if ([string]::IsNullOrWhiteSpace($ExecutablePath)) {
    Join-Path $ProjectRoot "target\debug\rhfiles.exe"
} else {
    [IO.Path]::GetFullPath($ExecutablePath)
}
if (-not (Test-Path $exePath)) {
    Write-Host "ERROR: RHFiles executable not found: $exePath" -ForegroundColor Red
    exit 1
}
$portableRoot = Split-Path -Parent $exePath
$portableCurrentExe = Join-Path $portableRoot "current\RHFiles.exe"
$isVelopackLauncher = (Test-Path -LiteralPath (Join-Path $portableRoot ".portable")) -and (Test-Path -LiteralPath $portableCurrentExe)

$resultFile = Join-Path $env:TEMP "rhfiles-test-results.json"
Remove-Item $resultFile -ErrorAction SilentlyContinue

Write-Host "`n[2/3] Launching RHFiles with test auto-run..." -ForegroundColor Cyan
$env:RHFILES_AUTORUN_TESTS = "1"
if ($CdpPort -gt 0) {
    $env:RHFILES_CDP_PORT = "$CdpPort"
    Write-Host "  DevTools port: $CdpPort (RHFILES_CDP_PORT)" -ForegroundColor Gray
}
if (-not [string]::IsNullOrWhiteSpace($UpdateSource)) {
    $env:RHFILES_TEST_UPDATE_SOURCE = [IO.Path]::GetFullPath($UpdateSource)
}
# A hidden window never brings up its WebView on a headless session, so the CDP
# mode launches visibly; the window is closed again when the run finishes.
$windowStyle = if ($CdpPort -gt 0) { "Normal" } else { "Hidden" }
$proc = Start-Process -FilePath $exePath -PassThru -WindowStyle $windowStyle
Remove-Item Env:RHFILES_AUTORUN_TESTS
Remove-Item Env:RHFILES_TEST_UPDATE_SOURCE -ErrorAction SilentlyContinue

Write-Host "`n[3/3] Waiting for test results (timeout: ${Timeout}s)..." -ForegroundColor Cyan
$startTime = Get-Date
$maxWait = New-TimeSpan -Seconds $Timeout
$testResults = $null

while (((Get-Date) - $startTime) -lt $maxWait) {
    Start-Sleep -Milliseconds 1000
    if (Test-Path $resultFile) {
        try {
            $content = Get-Content $resultFile -Raw
            if ($content -and $content.Trim() -ne "") {
                $candidate = $content | ConvertFrom-Json
                # The harness streams partial progress into the same file while
                # the suite is still running; only a final report ends the wait.
                if (-not $candidate.partial) {
                    $testResults = $candidate
                    break
                }
            }
        } catch {}
    }
    if ($proc.HasExited -and -not $isVelopackLauncher) {
        Write-Host "App exited during test run" -ForegroundColor Yellow
        break
    }
}

Write-Host "`n========================================" -ForegroundColor White
Write-Host "  GUI TEST RESULTS" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White

if (-not $testResults -and $CdpPort -gt 0) {
    # The harness auto-run may not have reported (a hidden start, a slow first
    # paint). Drive the same suite over the DevTools protocol instead.
    Write-Host "  No results file; running the suite over CDP..." -ForegroundColor Yellow
    try {
        $json = & node (Join-Path $ProjectRoot "scripts\cdp-window.mjs") eval "window.__runTests().then(r => JSON.stringify(r))" 2>&1
        $testResults = ($json | Out-String).Trim() | ConvertFrom-Json
    } catch {
        Write-Host "  CDP run failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

if ($testResults) {
    if ($testResults.error) {
        Write-Host "  ERROR: $($testResults.error)" -ForegroundColor Red
    } else {
        $passed = [int]$testResults.passed
        $failed = [int]$testResults.failed
        $total = [int]$testResults.total
        $color = if ($failed -eq 0) { "Green" } else { "Red" }
        Write-Host "  Total: $total  Passed: $passed  Failed: $failed" -ForegroundColor $color
        Write-Host ""
        foreach ($t in $testResults.results) {
            if ($t.status -eq "PASS") {
                Write-Host "  [PASS] " -ForegroundColor Green -NoNewline
                Write-Host $t.name
            } else {
                Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
                Write-Host $t.name -ForegroundColor Yellow
                Write-Host "         $($t.error)" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "  No results received within timeout." -ForegroundColor Yellow
    Write-Host "  Try manually: open devtools (F12) and run window.__runTests()" -ForegroundColor Gray
}
Write-Host "========================================`n" -ForegroundColor White

Remove-Item $resultFile -ErrorAction SilentlyContinue

if (-not $KeepOpen -and -not $proc.HasExited) {
    Write-Host "Closing RHFiles..." -ForegroundColor Gray
    $proc.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 2
    if (-not $proc.HasExited) { $proc.Kill() }
}
if (-not $KeepOpen -and $isVelopackLauncher) {
    $portableProcesses = Get-Process RHFiles -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $portableCurrentExe }
    foreach ($portableProcess in $portableProcesses) {
        $portableProcess.CloseMainWindow() | Out-Null
    }
    Start-Sleep -Seconds 2
    $portableProcesses = Get-Process RHFiles -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $portableCurrentExe }
    foreach ($portableProcess in $portableProcesses) {
        $portableProcess.Kill()
    }
}

if ($testResults -and [int]$testResults.failed -gt 0) { exit 1 }
exit 0
