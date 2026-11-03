[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root ('test-artifacts/update-splash-' + [Guid]::NewGuid().ToString('N')) }
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Use a new isolated output directory' }
$current = New-Item -ItemType Directory -Path (Join-Path $output 'current')
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe = Join-Path $current.FullName 'RHFilesSplashFixture.exe'
& $compiler /nologo /utf8output /target:exe /main:SplashTests /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll "/out:$exe" (Join-Path $root 'src-tauri/src/RHFilesUpdateSplash.cs') (Join-Path $root 'scripts/testing/update-splash-tests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Helper regression compilation failed' }
& $exe (Join-Path $root 'src-tauri/icons/rhfiles-icon-v4-256.png')
if ($LASTEXITCODE -ne 0) { throw 'Helper regression failed' }
Write-Output "Visual fixtures: $output"
