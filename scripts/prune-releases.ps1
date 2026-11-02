# Local-only, explicitly requested release cleanup. Default is a read-only plan.
# Backs up release metadata, not package bytes. Git tags/source are never deleted.
[CmdletBinding()]
param(
    [ValidateSet('CNB','GitHub')][string]$Provider,
    [ValidateRange(1,20)][int]$Keep=3,
    [switch]$Apply,
    [string]$Proxy='http://127.0.0.1:7890',
    [string]$TokenFile="$env:LOCALAPPDATA\RHFiles-Publishing\cnb-token.xml"
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/cnb-release.ps1"
. "$PSScriptRoot/release-retention.ps1"
$repository=if($Provider -eq 'CNB'){'railgunhamster/RHFiles'}else{'RailgunHamster/RHFiles'}
$audit=Join-Path "$PSScriptRoot/../test-artifacts" ('release-retention-'+$Provider+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $audit|Out-Null
$client=$null;$pointer=[IntPtr]::Zero;$token=$null
try {
    if($Provider -eq 'CNB'){
        $client=New-RHFilesCnbHttpClient;$secret=Import-Clixml -LiteralPath $TokenFile
        if($secret -isnot [Security.SecureString]){throw 'Expected locally encrypted CNB credential'}
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret);$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }else{
        $lines="protocol=https`nhost=github.com`n`n"|git -c http.proxy= -c https.proxy= credential fill
        if($LASTEXITCODE -ne 0){throw 'GitHub credential unavailable'}
        $line=$lines|Where-Object {$_.StartsWith('password=')}|Select-Object -First 1;if(-not $line){throw 'GitHub credential unavailable'}
        $token=$line.Substring(9)
    }
    function Api([string]$Path,[string]$Method='GET',[switch]$Missing){
        if($Provider -eq 'CNB'){return Invoke-RHFilesCnbApi $client $token "/$repository/-/$Path" $Method -AllowMissing:$Missing}
        if($Path -notmatch '^releases(?:/|\?|$)'){throw 'Unexpected GitHub cleanup path'}
        $opts=@{Headers=@{Authorization="Bearer $token";Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'};TimeoutSec=45;Method=$Method}
        if($Proxy){$opts.Proxy=$Proxy}
        try {$value=Invoke-RestMethod "https://api.github.com/repos/$repository/$Path" @opts;foreach($entry in @($value)){Write-Output $entry}}
        catch {if($Missing -and [int]$_.Exception.Response.StatusCode -eq 404){return $null};throw "GitHub cleanup $Method failed; no automatic write retry"}
    }
    $all=@()
    for($page=1;$page -le 10;$page++){
        $query=if($Provider -eq 'CNB'){"releases?page=$page&page_size=100"}else{"releases?page=$page&per_page=100"}
        $batch=@(Api $query);$all+=$batch;if($batch.Count -lt 100){break};if($page -eq 10){throw 'Release inventory exceeded bounded page budget'}
    }
    $latest=Api 'releases/latest';$protected=@([string]$latest.tag_name)
    $public=@{TimeoutSec=45};if($Provider -eq 'GitHub' -and $Proxy){$public.Proxy=$Proxy}
    foreach($name in @('releases.win.json','releases.android.json')){
        $url=if($Provider -eq 'CNB'){Get-RHFilesCnbPublicUrl $repository latest $name}else{"https://github.com/$repository/releases/latest/download/$name"}
        $feed=Invoke-RestMethod $url @public;if($feed -is [string]){$feed=$feed|ConvertFrom-Json -Depth 30}
        # Keep every currently advertised payload's canonical release, not just
        # a numerically recent tag; an old client must still find its package.
        if($name -eq 'releases.win.json'){$protected+=@($feed.Assets|ForEach-Object {'v'+$_.Version})}
        else{$protected+=@($feed.releases|ForEach-Object {'android-v'+$_.version})}
    }
    $plan=Get-RHFilesRetentionPlan $all $Keep $protected
    [IO.File]::WriteAllText((Join-Path $audit 'before.json'),($all|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $audit 'plan.json'),($plan|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    Write-Output ($plan.keep|ConvertTo-Json -Depth 8 -Compress)
    Write-Output "Provider=$Provider; remove=$(@($plan.delete).Count) releases; trim=$(@($plan.trim).Count) combined releases; metadata backup=$audit"
    if(-not $Apply){return}
    $done=@();$count=0
    foreach($release in $plan.delete){
        if((Api 'releases/latest').id -ne $latest.id){throw 'Latest release changed; stopped before further deletions'}
        $current=Api "releases/$($release.id)" -Missing;if(-not $current){continue}
        if($current.tag_name -cne $release.tag_name -or $current.updated_at -ne $release.updated_at -or $current.draft -or $current.prerelease){throw 'A planned release changed; stopped'}
        $null=Api "releases/$($release.id)" DELETE
        $done+=,[pscustomobject]@{id=$release.id;tag=$release.tag_name;removed=$true}
        [IO.File]::WriteAllText((Join-Path $audit 'deleted.json'),($done|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
        $count++;if($count%10 -eq 0){Write-Output "Removed $count / $(@($plan.delete).Count) releases"}
        Start-Sleep -Milliseconds 1100
    }
    foreach($row in $plan.trim){foreach($asset in $row.assets){
        if($Provider -ne 'GitHub'){throw 'Unexpected combined CNB release; manual asset review required'}
        $current=Api "releases/$($row.release.id)";if($current.tag_name -cne $row.release.tag_name){throw 'Combined release identity changed'}
        if(-not @($current.assets|Where-Object {$_.id -eq $asset.id -and $_.name -ceq $asset.name}).Count){throw 'Combined release asset changed'}
        $null=Api "releases/assets/$($asset.id)" DELETE
        Write-Output "Removed obsolete Windows asset from retained macOS/Linux container: $($asset.name)"
        Start-Sleep -Milliseconds 1100
    }}
    $after=@(Api 'releases?per_page=100&page_size=100&page=1')
    [IO.File]::WriteAllText((Join-Path $audit 'after.json'),($after|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    if((Api 'releases/latest').id -ne $latest.id){throw 'Latest changed during cleanup; inspect audit'}
    Write-Output "Completed; Git tags and source unchanged. Old package assets cannot be undeleted from this metadata backup."
}finally{if($client){$client.Dispose()};if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};$token=$null}
