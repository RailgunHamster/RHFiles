# MSIX Packaging Script for RHFiles
# Requires Windows SDK (MakeAppx.exe, SignTool.exe)

param(
    [string]$OutputPath = ".\release",
    [string]$Publisher = "CN=RailgunHamster"
)

Write-Host "Building RHFiles..."
cargo tauri build

$exe = Get-ChildItem -Path ".\src-tauri\target\release\rhfiles-tauri.exe" -ErrorAction SilentlyContinue
if (-not $exe) {
    Write-Error "Build output not found. Run 'cargo tauri build' first."
    exit 1
}

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10">
  <Identity Name="RailgunHamster.RHFiles" Version="0.1.0.0" Publisher="$Publisher" />
  <Properties>
    <DisplayName>RHFiles</DisplayName>
    <PublisherDisplayName>RailgunHamster</PublisherDisplayName>
    <Description>A modern file manager for Windows</Description>
    <Logo>Assets\icon.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Universal" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22631.0" />
  </Dependencies>
  <Applications>
    <Application Id="RHFiles" Executable="rhfiles-tauri.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="RHFiles" Description="File Manager" BackgroundColor="transparent" Square150x150Logo="Assets\icon.png" Square44x44Logo="Assets\icon.png" />
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

$stage = "$OutputPath\msix-staging"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item $exe.FullName $stage
$manifest | Out-File -Encoding UTF8 "$stage\AppxManifest.xml"

MakeAppx.exe pack /d $stage /p "$OutputPath\RHFiles.msix" /o

Write-Host "MSIX package created: $OutputPath\RHFiles.msix"
Write-Host "Sign with: SignTool.exe sign -fd SHA256 -a -f <cert.pfx> $OutputPath\RHFiles.msix"
