# Test-only candidate from a builder linked by https://mpv.io/installation/.
# Not a product dependency, license clearance, codec installation or updater.
$ErrorActionPreference='Stop'
$probeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $PSScriptRoot '../libvlc-bundle.ps1')
$asset='mpv-dev-lgpl-x86_64-20261029-git-cf764c61d1.7z'
$expected='f62fd6192e7310397a8b4288330e8f2f838fe85a8d1e5a0f242940fae940f04d'
$directory=Assert-RHFilesLibVlcWorkspacePath (Join-Path $probeRoot 'test-artifacts/mpv-engine-probe') $probeRoot
$archive=Assert-RHFilesLibVlcWorkspacePath (Join-Path $directory $asset) $probeRoot
New-Item -ItemType Directory -Force -Path $directory | Out-Null
if(!(Test-Path -LiteralPath $archive)){
  $uri='https://github.com/zhongfly/mpv-winbuild/releases/download/2026-10-29-cf764c61d1/'+$asset
  Invoke-WebRequest -Uri $uri -Proxy 'http://127.0.0.1:7890' -TimeoutSec 180 -OutFile $archive
}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Candidate archive does not match the GitHub release asset digest; it will not be extracted or loaded.'}
if((Get-Item -LiteralPath $archive).Length -ne 28988727){throw 'Unexpected candidate archive size'}
$sevenZip=Join-Path $probeRoot 'src-tauri/thirdparty/7z.exe'
& $sevenZip l -slt -ba $archive
if($LASTEXITCODE -ne 0){throw 'Could not inspect the verified candidate archive'}
$runtime=Assert-RHFilesLibVlcWorkspacePath (Join-Path $directory 'runtime') $probeRoot
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
foreach($entry in @('libmpv-2.dll','include/mpv/client.h')){[void](Assert-RHFilesLibVlcWorkspacePath (Join-Path $runtime $entry) $probeRoot)}
# Extract only these literal entries; do not run scripts or install packages.
& $sevenZip x -y ('-o'+$runtime) $archive 'libmpv-2.dll' 'include\mpv\client.h'
if($LASTEXITCODE -ne 0){throw 'Could not extract the candidate API/header'}
Get-FileHash -LiteralPath (Join-Path $runtime 'libmpv-2.dll'),(Join-Path $runtime 'include/mpv/client.h') -Algorithm SHA256
Write-Output ('Verified test-only candidate: '+$expected)
