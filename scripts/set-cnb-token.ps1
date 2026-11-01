# Run locally in an interactive PowerShell terminal. Token input is hidden;
# only a current-user Windows DPAPI blob is saved, never a plaintext token.
param([string]$TokenFile=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RHFiles-Publishing\cnb-token.xml'))
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'This helper uses Windows current-user DPAPI.'}
if(Test-Path -LiteralPath $TokenFile){throw 'A saved CNB credential already exists. Use its existing path instead of overwriting it.'}
$secureToken=Read-Host 'CNB access token (hidden input)' -AsSecureString
try {
    if($secureToken.Length -lt 16){throw 'The access token is empty or incomplete.'}
    $tokenDirectory=Split-Path -Parent ([IO.Path]::GetFullPath($TokenFile))
    [IO.Directory]::CreateDirectory($tokenDirectory)|Out-Null
    $secureToken | Export-Clixml -LiteralPath $TokenFile -NoClobber
    Write-Output "Encrypted CNB credential saved: $TokenFile"
} finally {$secureToken.Dispose()}
