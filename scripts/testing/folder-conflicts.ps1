# Snapshot clipboard data before native-clipboard cases; a live IDataObject
# reference alone can become unusable when its original owner exits.
# Run in an STA: pwsh -STA -File scripts/testing/folder-conflicts.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RhfilesClipboardTest {
    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
}
'@
if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') { throw 'Clipboard preservation requires an STA thread.' }
$rhOriginalClipboard = [Windows.Forms.Clipboard]::GetDataObject()
$rhSavedClipboard = [Windows.Forms.DataObject]::new()
if ($rhOriginalClipboard) {
    foreach ($rhFormat in $rhOriginalClipboard.GetFormats($false)) {
        $rhData = $rhOriginalClipboard.GetData($rhFormat, $false)
        if ($null -eq $rhData) { throw "Cannot snapshot clipboard format: $rhFormat; tests have not started." }
        if ($rhData -is [IO.MemoryStream]) { $rhData = [IO.MemoryStream]::new($rhData.ToArray()) }
        elseif ($rhData -is [Drawing.Image]) { $rhData = $rhData.Clone() }
        $rhSavedClipboard.SetData($rhFormat, $false, $rhData)
    }
}
$rhSequenceFile = New-TemporaryFile
$rhPreviousSequenceFile = $env:RHFILES_CLIPBOARD_SEQUENCE_FILE
try {
    $env:RHFILES_CLIPBOARD_SEQUENCE_FILE = $rhSequenceFile.FullName
    & node --test --test-concurrency=1 scripts/e2e/folder-conflicts.test.mjs
    $rhTestExit = $LASTEXITCODE
} finally {
    [uint32]$rhLastTestSequence = 0
    [uint32]::TryParse((Get-Content -LiteralPath $rhSequenceFile.FullName -Raw), [ref]$rhLastTestSequence) | Out-Null
    try {
        if ($rhLastTestSequence -gt 0 -and [RhfilesClipboardTest]::GetClipboardSequenceNumber() -eq $rhLastTestSequence) {
            [Windows.Forms.Clipboard]::SetDataObject($rhSavedClipboard, $true, 10, 100)
            Write-Output 'Original clipboard restored.'
        }
    } finally {
        $env:RHFILES_CLIPBOARD_SEQUENCE_FILE = $rhPreviousSequenceFile
        Remove-Item -LiteralPath $rhSequenceFile.FullName
    }
}
exit $rhTestExit
