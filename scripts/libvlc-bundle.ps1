# Build-time policy only. The application remains dynamically linked: these
# checks must not prevent a user from replacing/rebuilding their LGPL library.
function Assert-RHFilesLibVlcWorkspacePath([string]$Path, [string]$Workspace) {
    $root = [IO.Path]::GetFullPath($Workspace).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'libVLC build path must stay inside its workspace'
    }
    for ($current=$full; $current.Length -ge $root.Length; $current=[IO.Path]::GetDirectoryName($current)) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'libVLC build path cannot traverse a link/junction'
        }
        if ($current -ieq $root) { break }
    }
    $full
}

function Get-RHFilesLibVlcSpecification {
    [pscustomobject]@{
        Version = '3.0.24'
        Folder = 'libvlc-3.0.24-win64'
        PackageUrl = 'https://api.nuget.org/v3-flatcontainer/videolan.libvlc.windows/3.0.24/videolan.libvlc.windows.3.0.24.nupkg'
        PackageSha256 = '3da3f37ee2b2b10e5c788d830a3b513658c36521ea1b0f966ed86eb69f41ef3c'
        ToolsUrl = 'https://download.videolan.org/pub/videolan/vlc/3.0.24/win64/vlc-3.0.24-win64.7z'
        ToolsSha256 = '1ed59c09152e78aff84663fa76efab26057716576db74332858810e5ef54ae1f'
        LicenseUrl = 'https://raw.githubusercontent.com/videolan/vlc/3.0.24/COPYING.LIB'
        LicenseSha256 = 'dc626520dcd53a22f727af3ee42c770e56c97a64fe3adb063799d8ab032fe551'
        LibSha256 = 'c0b1bedbc8e11267b39111733920a6af73d08791e333e4f8902eaffe4daf6db9'
        CoreSha256 = 'c089f281affe1e85c61edd5996c2b496191f82fa5cdc7ef709b0c09bf754cdbe'
    }
}

function Get-RHFilesLibVlcInventory([string]$Directory) {
    $root = Get-Item -LiteralPath $Directory -ErrorAction Stop
    if (-not $root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'libVLC inventory requires a real directory, not a link'
    }
    # Check a directory before traversing it; never follow a junction out of
    # the admitted bundle. A poisoned manifest cannot make us read its paths.
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($root.FullName)
    $prefix = $root.FullName.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $entries = [Collections.Generic.List[object]]::new()
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'libVLC bundle contains a link' }
            if ($item.PSIsContainer) { $pending.Push($item.FullName); continue }
            # Windows' built-in PowerShell 5.1 uses .NET Framework, which has
            # neither Path.GetRelativePath nor Dictionary.TryAdd. All entries
            # came from the checked traversal; keep literal Unicode/#/% names.
            if (-not $item.FullName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'libVLC inventory path escaped its root' }
            $relative = $item.FullName.Substring($prefix.Length).Replace('\', '/')
            if ($relative -eq 'RHFiles-libVLC.json') { continue }
            $entries.Add([pscustomobject]@{
                path = $relative
                bytes = $item.Length
                sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                # VLC's cache validates plugin file mtimes. Bytes alone cannot
                # detect a ZIP tool changing these and causing another scan.
                modified = ([DateTimeOffset]$item.LastWriteTimeUtc).ToUnixTimeSeconds()
            })
        }
    }
    @($entries | Sort-Object path)
}

function New-RHFilesLibVlcDocument([string]$Directory) {
    $spec = Get-RHFilesLibVlcSpecification
    [pscustomobject]@{
        format = 'RHFiles.libVLC.bundle'
        schemaVersion = 1
        runtimeVersion = $spec.Version
        architecture = 'win-x64'
        pluginIndexMode = 'prebuilt-no-scan'
        package = 'VideoLAN.LibVLC.Windows'
        packageSha256 = $spec.PackageSha256
        cachegenArchiveSha256 = $spec.ToolsSha256
        files = @(Get-RHFilesLibVlcInventory $Directory)
    }
}

function Assert-RHFilesLibVlcInventory([string]$Directory, $Document, [ValidateSet('source','velopack')][string]$TimestampPolicy='source') {
    $spec = Get-RHFilesLibVlcSpecification
    if ($Document.format -cne 'RHFiles.libVLC.bundle' -or $Document.schemaVersion -ne 1 -or
        $Document.runtimeVersion -cne $spec.Version -or $Document.architecture -cne 'win-x64' -or $Document.pluginIndexMode -cne 'prebuilt-no-scan' -or
        $Document.package -cne 'VideoLAN.LibVLC.Windows' -or $Document.packageSha256 -cne $spec.PackageSha256 -or
        $Document.cachegenArchiveSha256 -cne $spec.ToolsSha256) { throw 'libVLC manifest identity/source mismatch' }
    $actual = @(Get-RHFilesLibVlcInventory $Directory)
    if ($actual.Count -eq 0 -or $actual.Count -ne @($Document.files).Count) { throw 'libVLC inventory file set mismatch' }
    $expected = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $Document.files) {
        if ($entry.path -isnot [string] -or $entry.path -match '(^/|\\|:|(^|/)(\.|\.\.)($|/)|//)' -or
            [string]::IsNullOrEmpty($entry.path) -or $entry.path.EndsWith('/') -or
            $entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $entry.bytes -lt 0 -or
            $expected.ContainsKey($entry.path)) { throw 'libVLC manifest has an invalid/duplicate path or digest' }
        $expected.Add($entry.path, $entry)
    }
    foreach ($entry in $actual) {
        if (-not $expected.ContainsKey($entry.path)) { throw 'libVLC inventory file set mismatch' }
        $before = $expected[$entry.path]
        if ($before.path -cne $entry.path -or $before.bytes -ne $entry.bytes -or $before.sha256 -cne $entry.sha256) {
            throw "libVLC bundle checksum mismatch: $($entry.path)"
        }
        if ($entry.path -match '^plugins/.+\.dll$' -and $before.modified -ne $entry.modified) {
            $zipEpoch = ([DateTimeOffset][DateTime]::SpecifyKind([DateTime]::new(1980,1,1), [DateTimeKind]::Local)).ToUnixTimeSeconds()
            # Accept only the packager's verified, deterministic DOS epoch,
            # not arbitrary timestamp changes. Runtime uses the prebuilt
            # index without scanning; it never rewrites installed DLL times.
            if ($TimestampPolicy -cne 'velopack' -or $entry.modified -ne $zipEpoch) { throw "libVLC plugin/cache timestamp changed: $($entry.path)" }
        }
    }
}

function Assert-RHFilesLibVlcBundle([string]$Directory, [ValidateSet('source','velopack')][string]$TimestampPolicy='source') {
    $root = Get-Item -LiteralPath $Directory -Force
    if (-not $root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'libVLC bundle root cannot be a link' }
    $manifest = Join-Path $Directory 'RHFiles-libVLC.json'
    if (-not (Test-Path -LiteralPath $manifest -PathType Leaf) -or
        ((Get-Item -LiteralPath $manifest -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        (Get-Item -LiteralPath $manifest).Length -gt 1048576) { throw 'libVLC manifest missing, linked or oversized' }
    $document = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    Assert-RHFilesLibVlcInventory $Directory $document $TimestampPolicy
    $spec = Get-RHFilesLibVlcSpecification
    $pinned = @{'libvlc.dll'=$spec.LibSha256; 'libvlccore.dll'=$spec.CoreSha256; 'COPYING.LIB'=$spec.LicenseSha256}
    foreach ($name in $pinned.Keys) {
        $file = Join-Path $Directory $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "libVLC required file missing: $name" }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $pinned[$name]) { throw "libVLC pinned checksum mismatch: $name" }
    }
    foreach ($name in @('RHFiles-NOTICE.txt','VideoLAN.LibVLC.Windows.nuspec','plugins/plugins.dat',
        'plugins/codec/libavcodec_plugin.dll','plugins/demux/libmp4_plugin.dll',
        'plugins/audio_output/libdirectsound_plugin.dll','plugins/video_output/libdirect3d11_plugin.dll',
        'plugins/video_filter/libtransform_plugin.dll')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Directory $name) -PathType Leaf)) { throw "libVLC required file missing: $name" }
    }
    if ((Get-Item -LiteralPath (Join-Path $Directory 'plugins/plugins.dat')).Length -lt 1024) { throw 'libVLC plugin index missing or incomplete' }
    # Use the upstream non-GPL package; a full VLC player or the build-only GPL
    # cache generator must not leak into the application payload.
    foreach ($file in Get-ChildItem -LiteralPath $Directory -Recurse -File) {
        if ($file.Extension -ieq '.exe' -or $file.Name -match '^lib(faad|x264|x265|mad|a52|dca)_plugin\.dll$') {
            throw "libVLC bundle contains an unexpected executable/GPL-only plugin: $($file.Name)"
        }
    }
}

function Assert-RHFilesLibVlcArchive([string]$Archive, [string]$PayloadRoot, [string]$Workspace) {
    if ($PayloadRoot -cnotin @('current','lib/app')) { throw 'libVLC archive payload root is not supported' }
    $directory = Assert-RHFilesLibVlcWorkspacePath (Join-Path $Workspace ('temp/libvlc-archive-check-' + [guid]::NewGuid().ToString('N'))) $Workspace
    $sevenZip = Join-Path $Workspace 'src-tauri/thirdparty/7z.exe'
    New-Item -ItemType Directory -Path $directory | Out-Null
    & $sevenZip x $Archive "$PayloadRoot/vlc/*" "-o$directory" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'libVLC archive verification extraction failed' }
    Assert-RHFilesLibVlcBundle (Join-Path $directory "$PayloadRoot/vlc") 'velopack'
}
