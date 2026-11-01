# Git credential protocol helper. Git consumes stdout privately; do not run
# it manually. It never stores credentials or responds to another host.
param([ValidateSet('get','store','erase')][string]$Operation='get')
$ErrorActionPreference='Stop'
if($Operation -ne 'get'){exit 0}
$request=@{}
while($null -ne ($credentialLine=[Console]::In.ReadLine())){
    if($credentialLine.Length -eq 0){break}
    $separator=$credentialLine.IndexOf('=')
    if($separator -gt 0){$request[$credentialLine.Substring(0,$separator)]=$credentialLine.Substring($separator+1)}
}
if($request.protocol -cne 'https' -or $request.host -cne 'cnb.cool'){exit 0}
$tokenFile=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RHFiles-Publishing\cnb-token.xml'
$secret=Import-Clixml -LiteralPath $tokenFile
if($secret -isnot [Security.SecureString]){throw 'Expected an encrypted CNB credential'}
$pointer=[IntPtr]::Zero
try {
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if($value -match '[\r\n\x00]'){throw 'Invalid credential'}
    [Console]::Out.WriteLine('username=cnb')
    [Console]::Out.WriteLine('password='+$value)
    [Console]::Out.WriteLine()
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $value=$null;$secret.Dispose()
}
