$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $PSScriptRoot '../libvlc-bundle.ps1')
$taskOutput=Assert-RHFilesLibVlcWorkspacePath (Join-Path $taskRoot 'test-artifacts/owned-native-frame') $taskRoot
$taskSource=Join-Path $PSScriptRoot 'owned-native-frame.cpp'
$taskExe=Assert-RHFilesLibVlcWorkspacePath (Join-Path $taskOutput 'owned-native-frame.exe') $taskRoot
$taskObject=Assert-RHFilesLibVlcWorkspacePath (Join-Path $taskOutput 'owned-native-frame.obj') $taskRoot
$taskVswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$taskInstall=& $taskVswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$taskInstall){throw 'MSVC x64 tools are required for the test-only owned frame reader'}
$taskMsvc=Get-ChildItem -LiteralPath (Join-Path $taskInstall 'VC/Tools/MSVC') -Directory | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
$taskSdkRoot=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$taskSdk=Get-ChildItem -LiteralPath (Join-Path $taskSdkRoot 'Include') -Directory | Where-Object {$_.Name -match '^10\.\d+\.\d+\.\d+$'} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
if(!$taskMsvc -or !$taskSdk){throw 'Windows x64 C++ SDK is unavailable'}
$taskCompiler=Join-Path $taskMsvc.FullName 'bin/Hostx64/x64';$env:PATH=$taskCompiler+';'+$env:PATH
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskOptions=@('/nologo','/std:c++20','/utf-8','/EHsc','/O2','/MT','/W4','/DUNICODE','/D_UNICODE','/D_WIN32_WINNT=0x0A00','/DWINVER=0x0A00',('/I'+(Join-Path $taskMsvc.FullName 'include')))
foreach($part in @('ucrt','shared','um','winrt')){$taskOptions+='/I'+(Join-Path $taskSdk.FullName $part)}
$taskOptions+=@($taskSource,('/Fo'+$taskObject),('/Fe'+$taskExe),'/link',('/LIBPATH:'+(Join-Path $taskMsvc.FullName 'lib/x64')))
foreach($part in @('ucrt','um')){$taskOptions+='/LIBPATH:'+(Join-Path $taskSdkRoot ('Lib/'+$taskSdk.Name+'/'+$part+'/x64'))}
$taskOptions+=@('user32.lib','gdi32.lib')
& (Join-Path $taskCompiler 'cl.exe') @taskOptions
if($LASTEXITCODE -ne 0){throw 'Owned frame reader compilation failed; do not use a cached tool'}
$taskProof=[ordered]@{format='RHFiles.owned-frame-tool';protocol=1;sourceSHA256=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant();exeSHA256=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText($taskExe+'.json',($taskProof|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$taskProof|ConvertTo-Json -Compress
