param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$qaDirectory=[IO.Path]::GetFullPath($Directory)
if($qaDirectory -notmatch '^C:\\Users\\40608\\AppData\\Local\\Temp\\rhfiles-windows-qa-[a-f0-9]{32}$'){throw 'Refusing a non-owned QA directory'}
$executable=Join-Path $qaDirectory 'RHFiles.exe'
if(!(Test-Path -LiteralPath $executable -PathType Leaf)){throw 'Missing QA executable'}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$env:RHFILES_TEST_PROFILE_ROOT=Join-Path $qaDirectory 'profile'
# Release builds intentionally ignore debug-only overrides. Isolate Windows
# environment roots BEFORE startup, just like the local release test fixture.
$env:APPDATA=Join-Path $qaDirectory 'profile\roaming'
$env:LOCALAPPDATA=Join-Path $qaDirectory 'profile\local'
$env:RHFILES_TEST_DESKTOP_ID='owned-windows-access-'+[IO.Path]::GetFileName($qaDirectory)
$env:RHFILES_CDP_PORT=[string]$port
$env:RHFILES_AUTORUN_TESTS='0'
$profileId=[guid]::NewGuid().ToString()
$process=Start-Process -FilePath $executable -ArgumentList "--lan-service-startup=$profileId" -WorkingDirectory $qaDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qaDirectory 'app.log') -RedirectStandardError (Join-Path $qaDirectory 'app-error.log')
# Generated readiness evidence only; no settings, credentials or user files.
[pscustomobject]@{pid=$process.Id;port=$port;directory=$qaDirectory;executable=$executable}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $qaDirectory 'ready.json') -Encoding UTF8
