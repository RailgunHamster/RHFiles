# Prepare a self-contained, pinned non-GPL Windows playback runtime. Never
# install VLC, edit the user's VLC profile, or scan plugins at app startup.
param(
    [string]$Proxy = '',
    [string]$PackagePath = '',
    [string]$CacheGenArchive = '',
    [string]$LicensePath = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'libvlc-bundle.ps1')
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$spec = Get-RHFilesLibVlcSpecification
$destination = Assert-RHFilesLibVlcWorkspacePath (Join-Path $repoRoot "src-tauri/thirdparty/$($spec.Folder)") $repoRoot
if (Test-Path -LiteralPath $destination) {
    Assert-RHFilesLibVlcBundle $destination
    [pscustomobject]@{Version=$spec.Version; Directory=$destination; Reused=$true}
    return
}
$work = Assert-RHFilesLibVlcWorkspacePath (Join-Path $repoRoot ('temp/libvlc-prepare-' + [guid]::NewGuid().ToString('N'))) $repoRoot
New-Item -ItemType Directory -Path $work | Out-Null
function Get-PinnedLibVlcInput([string]$Supplied, [string]$Url, [string]$Sha256, [string]$Name) {
    $file = if ($Supplied) { [IO.Path]::GetFullPath($Supplied) } else { Join-Path $work $Name }
    if (-not $Supplied) {
        $download = @{Uri=$Url; OutFile=$file; TimeoutSec=180}
        if ($Proxy) { $download.Proxy=$Proxy }
        Invoke-WebRequest @download
    }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or
        (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $Sha256) { throw "libVLC input checksum mismatch: $Name" }
    $file
}
$package = Get-PinnedLibVlcInput $PackagePath $spec.PackageUrl $spec.PackageSha256 'runtime.nupkg'
$tools = Get-PinnedLibVlcInput $CacheGenArchive $spec.ToolsUrl $spec.ToolsSha256 'tools.7z'
$license = Get-PinnedLibVlcInput $LicensePath $spec.LicenseUrl $spec.LicenseSha256 'COPYING.LIB'
$sevenZip = Join-Path $repoRoot 'src-tauri/thirdparty/7z.exe'
if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw 'Run scripts/prepare-7zip.ps1 first' }
$extracted = Join-Path $work 'extracted'
& $sevenZip x $package 'build/x64/*' 'VideoLAN.LibVLC.Windows.nuspec' "-o$extracted" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'libVLC NuGet extraction failed' }
$native = Join-Path $extracted 'build/x64'
$runtime = Join-Path $work 'vlc'
New-Item -ItemType Directory -Path $runtime | Out-Null
foreach ($name in @('libvlc.dll','libvlccore.dll','plugins','hrtfs','lua')) {
    $source = Join-Path $native $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $runtime $name) -Recurse }
}
Copy-Item -LiteralPath $license -Destination (Join-Path $runtime 'COPYING.LIB')
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/thirdparty/libvlc/NOTICE.txt') -Destination (Join-Path $runtime 'RHFiles-NOTICE.txt')
Copy-Item -LiteralPath (Join-Path $extracted 'VideoLAN.LibVLC.Windows.nuspec') -Destination $runtime

# The helper is GPL and belongs to build tools, never the runtime stage. Load
# the very same two NuGet DLLs rather than accidentally using a system VLC.
$toolOutput = Join-Path $work 'build-tools'
& $sevenZip x $tools 'vlc-3.0.24/vlc-cache-gen.exe' 'vlc-3.0.24/COPYING.txt' "-o$toolOutput" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'libVLC cache generator extraction failed' }
$toolDirectory = Join-Path $toolOutput 'vlc-3.0.24'
foreach ($name in @('libvlc.dll','libvlccore.dll')) { Copy-Item -LiteralPath (Join-Path $runtime $name) -Destination $toolDirectory }
$previousAppData = $env:APPDATA
$previousLocalAppData = $env:LOCALAPPDATA
try {
    $env:APPDATA = Join-Path $work 'cachegen-profile/roaming'
    $env:LOCALAPPDATA = Join-Path $work 'cachegen-profile/local'
    New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
    & (Join-Path $toolDirectory 'vlc-cache-gen.exe') (Join-Path $runtime 'plugins')
    if ($LASTEXITCODE -ne 0) { throw 'libVLC plugin index generation failed' }
} finally {
    $env:APPDATA = $previousAppData
    $env:LOCALAPPDATA = $previousLocalAppData
}
$document = New-RHFilesLibVlcDocument $runtime
[IO.File]::WriteAllText((Join-Path $runtime 'RHFiles-libVLC.json'), ($document | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Assert-RHFilesLibVlcBundle $runtime
# Only a newly created build directory is moved. An existing destination was
# validated above; it is never overwritten/deleted on preparation failure.
[void](Assert-RHFilesLibVlcWorkspacePath $runtime $repoRoot)
[void](Assert-RHFilesLibVlcWorkspacePath $destination $repoRoot)
# Directory.Move rejects an already-existing destination rather than merging
# into a directory which might have appeared after the initial existence test.
[IO.Directory]::Move($runtime, $destination)
Assert-RHFilesLibVlcBundle $destination
[pscustomobject]@{Version=$spec.Version; Directory=$destination; Reused=$false}
