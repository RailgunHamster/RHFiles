param([string]$InputFile,[string]$OutputFile,[string]$HtmlFile,[string]$Mode)
$ErrorActionPreference='Stop'
if ([IO.Path]::GetFullPath((Get-Location).Path) -ne [IO.Path]::GetFullPath((Split-Path -Parent $InputFile))) { throw "Converter working directory is incorrect: $((Get-Location).Path) / $InputFile" }
if (-not (Test-Path -LiteralPath $HtmlFile)) { throw 'Generated HTML is missing' }
if ($Mode -eq 'fail') { [Console]::Error.WriteLine('fixture-converter-error'); exit 23 }
if ($Mode -eq 'invalid') { [IO.File]::WriteAllText($OutputFile,'not a PDF'); exit 0 }
if ($Mode -eq 'wait') { Start-Sleep -Seconds 25 }
Copy-Item -LiteralPath ($InputFile+'.reference.pdf') -Destination $OutputFile
