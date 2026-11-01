# Local publisher primitives. Nothing in this file reads a credential until the
# caller explicitly creates an API client. Public reads never carry a token.
function Assert-RHFilesCnbRepository([string]$Repository) {
    $parts=$Repository.Split('/')
    if($parts.Count -lt 2 -or $parts.Count -gt 10 -or @($parts|Where-Object {$_ -notmatch '^[A-Za-z0-9_.-]+$' -or $_ -in @('.','..','-')}).Count){throw 'Invalid CNB repository path'}
}

function Get-RHFilesCnbPublicUrl([string]$Repository,[string]$Tag,[string]$Name) {
    Assert-RHFilesCnbRepository $Repository
    if($Tag -notmatch '^[A-Za-z0-9_.-]{1,180}$' -or $Tag -in @('.','..') -or $Name -notmatch '^[A-Za-z0-9_.-]{1,180}$' -or $Name -in @('.','..')){throw 'Invalid CNB download path'}
    if($Tag -eq 'latest'){return "https://cnb.cool/$Repository/-/releases/latest/download/$Name"}
    return "https://cnb.cool/$Repository/-/releases/download/$Tag/$Name"
}

function Get-RHFilesCnbChannelVersion([ValidateSet('Windows','Android')][string]$Platform,$Feed) {
    if($Platform -eq 'Windows'){
        $assets=@($Feed.Assets)
        if(-not $assets.Count){throw 'Empty Windows update feed'}
        $seen=@{}
        foreach($asset in $assets){
            if($asset.PackageId -cne 'RHFiles' -or $asset.Version -notmatch '^\d+\.\d+\.\d+$' -or $asset.Type -cnotin @('Full','Delta') -or $asset.FileName -cne "RHFiles-$($asset.Version)-$($asset.Type.ToLowerInvariant()).nupkg" -or $asset.SHA256 -notmatch '^[a-fA-F0-9]{64}$' -or [long]$asset.Size -le 0 -or $seen.ContainsKey($asset.FileName)){throw 'Invalid or duplicate Windows update asset'}
            $seen[$asset.FileName]=$true
        }
        $version=($assets|Sort-Object {[version]$_.Version} -Descending|Select-Object -First 1).Version
        if(-not @($assets|Where-Object {$_.Version -eq $version -and $_.Type -ceq 'Full'}).Count){throw 'Latest Windows release needs a full package'}
        return [string]$version
    }
    if($Feed.schemaVersion -ne 1 -or $Feed.packageId -cne 'com.railgunhamster.rhfiles' -or @($Feed.releases).Count -notin 1..500){throw 'Invalid Android update feed'}
    $codes=@{}
    foreach($release in $Feed.releases){
        if($release.version -notmatch '^\d+\.\d+\.\d+$' -or [long]$release.versionCode -le 0 -or $codes.ContainsKey([string]$release.versionCode) -or $release.draft -or $release.prerelease -or -not @($release.assets).Count){throw 'Invalid or duplicate Android release'}
        $codes[[string]$release.versionCode]=$true
        $abis=@{}
        foreach($asset in $release.assets){
            if($asset.abi -cnotin @('arm64-v8a','armeabi-v7a','x86_64','x86','universal') -or $abis.ContainsKey([string]$asset.abi) -or $asset.fileName -notmatch '^RHFiles-Android-[A-Za-z0-9_.-]+\.apk$' -or $asset.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or [long]$asset.size -le 0 -or [long]$asset.size -gt 1GB){throw 'Invalid or duplicate Android update asset'}
            $abis[[string]$asset.abi]=$true
        }
    }
    return [long](($Feed.releases|Sort-Object {[long]$_.versionCode} -Descending|Select-Object -First 1).versionCode)
}

function Assert-RHFilesCnbHistory($History) {
    if($History.schemaVersion -ne 1 -or -not @($History.releases).Count){throw 'Invalid Windows release history'}
}

function Read-RHFilesCnbJsonFile([string]$Path) {
    $file=Get-Item -LiteralPath $Path
    if($file.Length -notin 1..2MB){throw 'Update metadata is empty or exceeds 2 MiB'}
    return [IO.File]::ReadAllText($file.FullName)|ConvertFrom-Json -Depth 60
}

function New-RHFilesCnbHttpClient {
    $handler=[Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect=$false
    $client=[Net.Http.HttpClient]::new($handler)
    $client.Timeout=[TimeSpan]::FromMinutes(30)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('RHFiles-Local-Publisher')
    return $client
}

function Assert-RHFilesCnbHttps([uri]$Url) {
    if(-not $Url.IsAbsoluteUri -or $Url.Scheme -ne 'https' -or $Url.Port -ne 443 -or $Url.UserInfo -or $Url.Fragment){throw 'Refusing an unsafe publishing/download URL'}
}

# Bounded streaming applies before JSON parsing and before writing an oversized
# response. At most five anonymous HTTPS redirects; no write is auto-replayed.
function Receive-RHFilesCnbPublicFile($Client,[string]$Url,[string]$Output,[long]$Limit,[switch]$AllowMissing) {
    $current=[uri]$Url
    $timeout=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($(if($Limit -le 2MB){45}else{1800})))
    try {
        for($redirects=0;$redirects -le 5;$redirects++){
            Assert-RHFilesCnbHttps $current
            $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get,$current)
            $request.Headers.CacheControl=[Net.Http.Headers.CacheControlHeaderValue]::new()
            $request.Headers.CacheControl.NoCache=$true
            $response=$null
            try {
                $response=$Client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$timeout.Token).GetAwaiter().GetResult()
                $status=[int]$response.StatusCode
                if($status -in @(301,302,303,307,308)){
                    if($redirects -eq 5 -or -not $response.Headers.Location){throw 'Public CNB download redirect limit exceeded'}
                    $current=[uri]::new($current,$response.Headers.Location)
                    continue
                }
                if($status -eq 404 -and $AllowMissing){return $false}
                if(-not $response.IsSuccessStatusCode){throw "Anonymous CNB download failed (HTTP $status)"}
                if($response.Content.Headers.ContentLength -gt $Limit){throw 'CNB download exceeds expected size limit'}
                $stream=$response.Content.ReadAsStreamAsync($timeout.Token).GetAwaiter().GetResult()
                $sink=$null
                try {
                    $sink=[IO.File]::Open($Output,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                    $buffer=[byte[]]::new(128KB);$total=0L
                    while(($count=$stream.ReadAsync($buffer,0,$buffer.Length,$timeout.Token).GetAwaiter().GetResult()) -gt 0){
                        $total+=$count
                        if($total -gt $Limit){throw 'CNB download exceeds expected size limit'}
                        $sink.Write($buffer,0,$count)
                    }
                    $sink.Flush($true)
                } finally {if($sink){$sink.Dispose()};$stream.Dispose()}
                return $true
            } finally {if($response){$response.Dispose()};$request.Dispose()}
        }
    } finally {$timeout.Dispose()}
}

function Invoke-RHFilesCnbApi($Client,[string]$Token,[string]$Path,[ValidateSet('GET','POST','PATCH')][string]$Method='GET',$Body=$null,[switch]$AllowMissing) {
    $url=[uri]::new([uri]'https://api.cnb.cool/',$Path)
    Assert-RHFilesCnbHttps $url
    if($url.Host -cne 'api.cnb.cool'){throw 'Publishing credential may only be sent to api.cnb.cool'}
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),$url)
    $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$Token)
    $request.Headers.Accept.ParseAdd('application/vnd.cnb.api+json')
    if($null -ne $Body){$request.Content=[Net.Http.StringContent]::new(($Body|ConvertTo-Json -Depth 30 -Compress),[Text.Encoding]::UTF8,'application/json')}
    $timeout=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(45))
    $response=$null
    try {
        $response=$Client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$timeout.Token).GetAwaiter().GetResult()
        if([int]$response.StatusCode -eq 404 -and $AllowMissing){return $null}
        if(-not $response.IsSuccessStatusCode){throw "CNB API $Method failed (HTTP $([int]$response.StatusCode)); no write was retried"}
        if($response.Content.Headers.ContentLength -gt 2MB){throw 'CNB API response exceeds 2 MiB'}
        $stream=$response.Content.ReadAsStreamAsync($timeout.Token).GetAwaiter().GetResult()
        $memory=[IO.MemoryStream]::new()
        try {
            $buffer=[byte[]]::new(16KB)
            while(($count=$stream.ReadAsync($buffer,0,$buffer.Length,$timeout.Token).GetAwaiter().GetResult()) -gt 0){if($memory.Length+$count -gt 2MB){throw 'CNB API response exceeds 2 MiB'};$memory.Write($buffer,0,$count)}
            $text=[Text.Encoding]::UTF8.GetString($memory.ToArray())
            if($text.Trim()){return $text|ConvertFrom-Json -Depth 60}
        } finally {$stream.Dispose();$memory.Dispose()}
    } finally {if($response){$response.Dispose()};$request.Dispose();$timeout.Dispose()}
}

function Get-RHFilesCnbConfirmationPath([string]$Repository,[string]$ReleaseId,[string]$Url) {
    Assert-RHFilesCnbRepository $Repository
    if($ReleaseId -notmatch '^[A-Za-z0-9_-]+$'){throw 'Invalid CNB release ID'}
    $parsed=[uri]::new([uri]'https://api.cnb.cool/',$Url)
    Assert-RHFilesCnbHttps $parsed
    $prefix="/$Repository/-/releases/$ReleaseId/asset-upload-confirmation/"
    if($parsed.Host -cne 'api.cnb.cool' -or -not $parsed.AbsolutePath.StartsWith($prefix,[StringComparison]::Ordinal) -or $parsed.AbsolutePath.Length -le $prefix.Length -or ($parsed.Query -and $parsed.Query -cne '?ttl=0')){throw 'Upload confirmation does not belong to the expected repository/release with permanent retention'}
    return $parsed.PathAndQuery
}

function Send-RHFilesCnbAsset($Client,[string]$Token,[string]$Repository,[string]$ReleaseId,[IO.FileInfo]$File) {
    $upload=Invoke-RHFilesCnbApi $Client $Token "/$Repository/-/releases/$ReleaseId/asset-upload-url" POST @{asset_name=$File.Name;size=$File.Length;overwrite=$false;ttl=0}
    $confirmation=Get-RHFilesCnbConfirmationPath $Repository $ReleaseId $upload.verify_url
    $url=[uri]$upload.upload_url
    Assert-RHFilesCnbHttps $url
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put,$url)
    $response=$null
    try {
        # Signed object-storage URL: never add the API Authorization header.
        $request.Content=[Net.Http.StreamContent]::new([IO.File]::OpenRead($File.FullName))
        $request.Content.Headers.ContentType=[Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
        $request.Content.Headers.ContentLength=$File.Length
        $response=$Client.SendAsync($request).GetAwaiter().GetResult()
        if(-not $response.IsSuccessStatusCode){throw "CNB asset PUT failed (HTTP $([int]$response.StatusCode)); not retried"}
    } finally {if($response){$response.Dispose()};$request.Dispose()}
    # The OpenAPI specifies POST. Do not infer GET from an older plugin version.
    $null=Invoke-RHFilesCnbApi $Client $Token $confirmation POST
}

function Assert-RHFilesCnbFile([IO.FileInfo]$File,[long]$Size,[string]$Hash) {
    if($File.Length -ne $Size -or (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash -ine $Hash){throw "Payload checksum/size mismatch: $($File.Name)"}
}

function Assert-RHFilesCnbSnapshotUnchanged($Client,[string]$Repository,$Snapshot,[string]$Directory) {
    foreach($name in @('releases.win.json','release-history.json','releases.android.json')){
        $file=Join-Path $Directory ([guid]::NewGuid().ToString('N')+'-'+$name)
        $exists=Receive-RHFilesCnbPublicFile $Client (Get-RHFilesCnbPublicUrl $Repository latest $name) $file 2MB -AllowMissing
        $hash=if($exists){(Get-FileHash -LiteralPath $file).Hash}else{$null}
        if($hash -cne $Snapshot[$name]){throw 'Latest channel changed during upload; kept prerelease. Start a new verified publication with current companion indexes.'}
    }
}
