$ErrorActionPreference='Stop'
$probeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $PSScriptRoot '../libvlc-bundle.ps1')
$output=Assert-RHFilesLibVlcWorkspacePath (Join-Path $probeRoot 'test-artifacts/mpv-engine-probe') $probeRoot
foreach($entry in @('native-mpv-probe.exe','native-mpv-probe.obj')){[void](Assert-RHFilesLibVlcWorkspacePath (Join-Path $output $entry) $probeRoot)}
if(!(Test-Path -LiteralPath (Join-Path $output 'runtime/libmpv-2.dll'))){throw 'First prepare the verified, test-only candidate with prepare-mpv-probe.ps1'}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$install=& $vswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$install){throw 'MSVC x64 build tools are required for this test-only comparison'}
$msvc=Get-ChildItem -LiteralPath (Join-Path $install 'VC/Tools/MSVC') -Directory | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
$sdkRoot=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$sdk=Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory | Where-Object {$_.Name -match '^10\.\d+\.\d+\.\d+$'} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
if(!$msvc -or !$sdk){throw 'Windows C++ SDK is unavailable'}
$compiler=Join-Path $msvc.FullName 'bin/Hostx64/x64';$env:PATH=$compiler+';'+$env:PATH
$options=@('/nologo','/std:c++20','/EHsc','/MT','/W4','/DUNICODE','/D_UNICODE',('/I'+(Join-Path $msvc.FullName 'include')))
foreach($part in @('ucrt','shared','um','winrt')){$options+='/I'+(Join-Path $sdk.FullName $part)}
$options+=@((Join-Path $PSScriptRoot 'native-mpv-probe.cpp'),('/Fo'+(Join-Path $output 'native-mpv-probe.obj')),('/Fe'+(Join-Path $output 'native-mpv-probe.exe')),'/link',('/LIBPATH:'+(Join-Path $msvc.FullName 'lib/x64')))
foreach($part in @('ucrt','um')){$options+='/LIBPATH:'+(Join-Path $sdkRoot ('Lib/'+$sdk.Name+'/'+$part+'/x64'))}
$options+=@('user32.lib','gdi32.lib')
& (Join-Path $compiler 'cl.exe') @options
if($LASTEXITCODE -ne 0){throw 'Test-only libmpv comparison compilation failed'}
Get-FileHash -LiteralPath (Join-Path $output 'native-mpv-probe.exe') -Algorithm SHA256
