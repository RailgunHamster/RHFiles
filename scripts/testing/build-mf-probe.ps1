$ErrorActionPreference = 'Stop'
$probeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$probeOutput = Join-Path $probeRoot 'test-artifacts/mf-engine-probe'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsInstall = & $vswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vsInstall) { throw 'MSVC x64 build tools are required for this test-only probe.' }
$msvc = Get-ChildItem -LiteralPath (Join-Path $vsInstall 'VC/Tools/MSVC') -Directory | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$sdk = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory | Where-Object {$_.Name -match '^10\.\d+\.\d+\.\d+$'} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
if (!$msvc -or !$sdk) { throw 'The Windows C++ SDK is unavailable.' }
$compilerBin = Join-Path $msvc.FullName 'bin/Hostx64/x64'
$env:PATH = $compilerBin + ';' + $env:PATH
New-Item -ItemType Directory -Force -Path $probeOutput | Out-Null
$compileArgs = @('/nologo','/std:c++20','/EHsc','/MT','/W4','/DUNICODE','/D_UNICODE',('/I'+(Join-Path $msvc.FullName 'include')))
foreach ($part in @('ucrt','shared','um','winrt')) { $compileArgs += '/I'+(Join-Path $sdk.FullName $part) }
$compileArgs += @((Join-Path $PSScriptRoot 'native-mf-probe.cpp'),('/Fo'+(Join-Path $probeOutput 'native-mf-probe.obj')),('/Fe'+(Join-Path $probeOutput 'native-mf-probe.exe')),'/link',('/LIBPATH:'+(Join-Path $msvc.FullName 'lib/x64')))
foreach ($part in @('ucrt','um')) { $compileArgs += '/LIBPATH:'+(Join-Path $sdkRoot ('Lib/'+$sdk.Name+'/'+$part+'/x64')) }
$compileArgs += @('mfplat.lib','mfuuid.lib','mf.lib','d3d11.lib','dcomp.lib','dxgi.lib','user32.lib','gdi32.lib','ole32.lib','oleaut32.lib','propsys.lib','shlwapi.lib')
& (Join-Path $compilerBin 'cl.exe') @compileArgs
if ($LASTEXITCODE -ne 0) { throw 'Native comparison probe compilation failed.' }
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $probeOutput 'native-mf-probe.exe')
