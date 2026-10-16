# RHFiles releases

RHFiles uses Velopack for both portable packages and in-place updates. The application checks the public GitHub Releases feed by default; users can switch to the LAN feed at `\\SERVER-HOME\Public\Software\RHFiles-Releases` in Settings.

## Local portable package

From the repository root:

```powershell
.\scripts\package-velopack.ps1
```

To package and publish the portable archive plus update feed to the home server's `RHFiles-Releases` directory:

```powershell
.\scripts\package-velopack.ps1 -PublishDirectory '\\SERVER-HOME\Public\Software'
```

Use `-PortableName` when a particular versioned archive name must be preserved inside the feed, for example `-PortableName 'RHFiles-0.1.0-portable-x64-r2.zip'`. Publishing does not create a duplicate portable archive in the parent `Software` directory.

The script reads the version from `src-tauri/Cargo.toml`, builds `target\release\rhfiles.exe`, stages the bundled Everything, dust, FFmpeg, and 7-Zip (`prepare-ffmpeg.ps1` / `prepare-7zip.ps1` download and verify pinned copies into `src-tauri\thirdparty`), downloads the previous GitHub release when available, and runs `vpk pack`. The resulting `releases.win.json`, `release-history.json`, and NuGet packages must stay beside each other in the update feed. `release-history.json` is generated from every semantic-versioned file in `docs/release-notes`; packaging fails if the current version has no notes.

The packaging machine needs .NET 8 and Velopack CLI 1.2.0:

```powershell
dotnet tool install --global vpk --version 1.2.0
```

## GitHub release

Keep the version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` aligned, add `docs/release-notes/<version>.md`, then push an annotated `v<version>` tag. `.github/workflows/release.yml` packages and publishes the release, including the cumulative history asset used by the Settings client. It downloads the previous package first so Velopack can generate a delta when possible.

The first Velopack portable build is a bootstrap release: users of the old hand-made ZIP must replace it once. Every Velopack release after that can update itself.

### CI reruns and packaging validation

`Velopack release` can be run manually against `main` to test the complete
Windows build/package path. Manual runs **never publish or change a tag**;
artifacts are marked `validation-only` and must not be used to replace an
already-published version with different bytes. Tag pushes still publish new
versions normally. Before rebuilding an existing tag, a read-only gate verifies
the stable release, required assets and full-package hash/size against its feed;
a complete release is a successful no-op. An incomplete/conflicting release
stops for explicit recovery rather than overwriting existing user downloads.

Previous packages download to a separate cache. Only a strictly older full
package can seed a delta; an equal/newer download is never placed into `vpk pack`
input, so rerunning packaging does not collide with the version being built.
Windows/macOS business workflows use per-ref concurrency to cancel superseded
runs, record public trigger identifiers, and ignore mobile-only/docs-only
changes that do not affect the desktop applications.

## Android: Gitee, GitHub and LAN

Android uses a separate version and `releases.android.json`, not the Windows
Velopack feed. Build with `scripts/android-build.ps1`, then stage the signed APK
with `scripts/publish-android.ps1 -OutputDirectory <local-staging>` and
`-NotesFile android/release-notes.txt`. Seed staging with the existing cumulative
Android feed to preserve history. The publisher verifies package/ABI/version and
the existing signing certificate, publishes the APK first and the feed last.

Push the release source commit to both remotes, then publish the same bytes:

```powershell
./scripts/publish-android-gitee.ps1 -Directory <local-staging> -Commit <full-sha>
./scripts/publish-android-github.ps1 -Directory <local-staging> -Commit <full-sha>
./scripts/publish-android.ps1 -OutputDirectory '\\SERVER-HOME\Public\Software\RHFiles-Releases' -NotesFile android/release-notes.txt
```

Gitee defaults to `railgunhamster/RHFiles`; its repository must be public.
Store the publishing token outside the repository, encrypted with Windows
DPAPI, at `%USERPROFILE%\.rhfiles-gitee-token.xml` (a PowerShell SecureString
export). The script never puts it in client code or download URLs. Gitee
publishing uses a temporary prerelease, immutable APK/feed attachments and
anonymous download/hash checks before promoting to stable. A failed upload can
be retried; do not overwrite same-version bytes. GitHub retains its older-client
compatibility sidecar on Windows Latest without modifying Windows packages.

New/unconfigured Android installations default to Gitee. Explicitly saved source
choices are preserved. The three sources can be changed in Android Settings;
none requires a publishing token on the phone. All released distributions must
retain project LICENSE/NOTICE and the separate third-party notices.
