# Read-only public asset transport. API credentials never follow binary/CDN
# redirects. Asset names, source URLs, lengths and SHA-256 remain mandatory.
function Get-RHFilesGithubPublicRelease([string]$Repository,[string]$Tag,[string]$Proxy='') {
    if($Repository -cnotmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $Tag -cnotmatch '^(latest|(?:android-|macos-|linux-)?v\d+\.\d+\.\d+)$'){throw 'Invalid public release identity'}
    $path=if($Tag -eq 'latest'){'latest'}else{'tags/'+$Tag}
    $headers=@{Accept='application/vnd.github+json'}
    if($env:GH_TOKEN){$headers.Authorization='Bearer '+$env:GH_TOKEN}
    $options=@{Headers=$headers;TimeoutSec=45;MaximumRedirection=0};if($Proxy){$options.Proxy=$Proxy}
    $clock=[Diagnostics.Stopwatch]::StartNew()
    try {
        for($attempt=0;$attempt -lt 3;$attempt++){
            $options.TimeoutSec=[Math]::Max(1,[int][Math]::Ceiling(45-$clock.Elapsed.TotalSeconds))
            try { return Invoke-RestMethod "https://api.github.com/repos/$Repository/releases/$path" @options }
            catch {
                $responseProperty=$_.Exception.PSObject.Properties['Response']
                $response=if($responseProperty){$responseProperty.Value}else{$null}
                $status=if($null -ne $response){[int]$response.StatusCode}else{0}
                $transient=$status -in 408,429,500,502,503,504 -or ($status -eq 0 -and ($_.Exception -is [Net.Http.HttpRequestException] -or $_.Exception -is [TimeoutException] -or $_.Exception -is [Threading.Tasks.TaskCanceledException] -or $_.Exception -is [Net.WebException]))
                if(-not $transient -or $attempt -ge 2){throw}
                $delay=$attempt+1
                $retryAfter=if($null -ne $response){$response.Headers.RetryAfter}else{$null}
                if($null -ne $retryAfter -and $null -ne $retryAfter.Delta){$delay=[Math]::Max($delay,[Math]::Ceiling($retryAfter.Delta.TotalSeconds))}
                elseif($null -ne $retryAfter -and $null -ne $retryAfter.Date){$delay=[Math]::Max($delay,[Math]::Ceiling(($retryAfter.Date-[DateTimeOffset]::UtcNow).TotalSeconds))}
                if($clock.Elapsed.TotalSeconds+$delay -ge 45){throw}
                Write-Warning "GitHub release metadata temporarily unavailable (HTTP $status); bounded read retry $($attempt+2)/3 in $delay seconds."
                Start-Sleep -Seconds $delay
            }
        }
    }
    finally {$headers.Clear()}
}
function Read-RHFilesGithubPublicAsset {
    param([string]$Repository,$Release,[string]$FileName,[string]$OutFile='',[string]$Proxy='',[long]$MaxBytes=2097152,[int]$TimeoutSec=120)
    if($Repository -cnotmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $FileName -cnotmatch '^[A-Za-z0-9_.-]{1,180}$' -or $FileName -in @('.','..')){throw 'Invalid public asset identity'}
    if($Release.draft -or $Release.prerelease -or $Release.tag_name -cnotmatch '^(?:android-|macos-|linux-)?v\d+\.\d+\.\d+$'){throw 'Expected a public stable release'}
    $assets=@($Release.assets|Where-Object name -CEQ $FileName)
    if($assets.Count -ne 1){throw 'Public release has no unique requested asset'}
    $asset=$assets[0]
    if([long]$asset.size -le 0 -or [long]$asset.size -gt $MaxBytes -or $asset.digest -cnotmatch '^sha256:[a-f0-9]{64}$' -or [string]$asset.id -notmatch '^\d+$' -or
       $asset.url -cne "https://api.github.com/repos/$Repository/releases/assets/$($asset.id)" -or
       $asset.browser_download_url -cne "https://github.com/$Repository/releases/download/$($Release.tag_name)/$FileName"){throw 'Public asset metadata mismatch'}
    $options=@{Uri=($asset.url+'?rhfiles='+[guid]::NewGuid().ToString('N'));Headers=@{Accept='application/octet-stream'};TimeoutSec=$TimeoutSec}
    if($Proxy){$options.Proxy=$Proxy};if($OutFile){$options.OutFile=$OutFile}
    # Three read-only paths share one deadline; writes are never retried here.
    # Deliberately no Authorization header in any download request.
    $routes=@($options.Uri,$asset.browser_download_url,$asset.url)
    $clock=[Diagnostics.Stopwatch]::StartNew();$response=$null;$received=$false
    for($attempt=0;$attempt -lt $routes.Count;$attempt++){
        $remaining=[int][Math]::Ceiling($TimeoutSec-$clock.Elapsed.TotalSeconds)
        if($remaining -le 0){break}
        $options.Uri=$routes[$attempt];$options.TimeoutSec=$remaining
        try{$response=Invoke-WebRequest @options;$received=$true;break}
        catch{
            $status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{0}
            if($status -in 400,401,410){throw}
            if($attempt -eq $routes.Count-1){throw}
            Write-Warning "GitHub public asset read failed (HTTP $status); trying the next bounded read path: $FileName"
            if($clock.Elapsed.TotalSeconds+1 -lt $TimeoutSec){Start-Sleep -Seconds 1}
        }
    }
    if(-not $received){throw 'GitHub public asset read exhausted its time budget'}
    if($OutFile){$size=(Get-Item -LiteralPath $OutFile).Length;$hash=(Get-FileHash -LiteralPath $OutFile -Algorithm SHA256).Hash.ToLowerInvariant()}
    else{
        [byte[]]$bytes=if($response.Content -is [byte[]]){$response.Content}else{[Text.Encoding]::UTF8.GetBytes([string]$response.Content)}
        $size=$bytes.Length;$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    }
    if($size -ne [long]$asset.size -or ('sha256:'+$hash) -cne $asset.digest){throw 'Public asset download checksum/size mismatch'}
    if(-not $OutFile){return ,$bytes}
}
function Read-RHFilesGithubJsonAsset {
    param([string]$Repository,$Release,[string]$FileName,[string]$Proxy='',[long]$MaxBytes=2097152)
    $bytes=Read-RHFilesGithubPublicAsset -Repository $Repository -Release $Release -FileName $FileName -Proxy $Proxy -MaxBytes $MaxBytes
    [Text.UTF8Encoding]::new($false,$true).GetString($bytes)|ConvertFrom-Json -Depth 40
}
