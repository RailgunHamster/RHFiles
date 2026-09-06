# RHFiles releases

RHFiles uses Velopack for both portable packages and in-place updates. The application checks the public GitHub Releases feed by default; users can switch to the LAN feed at `\\SERVER-HOME\Public\Software\RHFiles-Releases` in Settings.

## Local portable package

From the repository root:

```powershell
.\scripts\package-velopack.ps1
```

To package and copy the portable archive plus update feed to the home server:

```powershell
.\scripts\package-velopack.ps1 -PublishDirectory '\\SERVER-HOME\Public\Software'
```

Use `-PortableName` when a stable download name must be preserved, for example `-PortableName 'RHFiles-0.1.0-portable-x64-r2.zip'`.

The script reads the version from `src-tauri/Cargo.toml`, builds `target\release\rhfiles.exe`, stages the bundled Everything and dust tools, downloads the previous GitHub release when available, and runs `vpk pack`. The resulting `releases.win.json` and NuGet packages must stay beside each other in the update feed.

The packaging machine needs .NET 8 and Velopack CLI 1.2.0:

```powershell
dotnet tool install --global vpk --version 1.2.0
```

## GitHub release

Keep the version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` aligned, add `docs/release-notes/<version>.md`, then push an annotated `v<version>` tag. `.github/workflows/release.yml` packages and publishes the release. It downloads the previous package first so Velopack can generate a delta when possible.

The first Velopack portable build is a bootstrap release: users of the old hand-made ZIP must replace it once. Every Velopack release after that can update itself.
