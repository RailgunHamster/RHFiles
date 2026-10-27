# GitHub-only companion policy. No Gitee account, token or API is involved.
function Get-RHFilesGithubAndroidSnapshot([string]$Repository,$Options,$PublicOptions){
 if($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'){throw 'Invalid GitHub repository'}
 $releases=@();for($page=1;$page -le 5;$page++){
  $batch=Invoke-RestMethod "https://api.github.com/repos/$Repository/releases?per_page=100&page=$page" @Options
  $releases+=@($batch);if(@($batch).Count -lt 100){break};if($page -eq 5){throw 'Release inventory exceeds the bounded companion budget'}
 }
 $source=$releases|Where-Object {-not $_.draft -and -not $_.prerelease -and $_.tag_name -cmatch '^android-v\d+\.\d+\.\d+$'}|Sort-Object {[version]$_.tag_name.Substring(9)} -Descending|Select-Object -First 1
 if(-not $source){return $null} # Initial Windows-only repository.
 $index=@($source.assets|Where-Object name -CEQ 'releases.android.json');if($index.Count -ne 1){throw 'Published Android release has no unique companion index'}
 $expected="https://github.com/$Repository/releases/download/$($source.tag_name)/releases.android.json"
 if($index[0].browser_download_url -cne $expected){throw 'Unexpected Android companion URL'}
 $response=Invoke-WebRequest $expected @PublicOptions
 $text=if($response.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($response.Content)}else{[string]$response.Content}
 if([Text.Encoding]::UTF8.GetByteCount($text) -gt 2MB){throw 'Android companion index is too large'}
 $manifest=$text|ConvertFrom-Json;$code=Get-RHFilesAndroidChannelCode $manifest
 $current=@($manifest.releases|Sort-Object {[long]$_.versionCode} -Descending)[0]
 if($source.tag_name -cne "android-v$($current.version)" -or @($current.assets).Count -gt 8){throw 'Android companion tag/version mismatch'}
 $names=@();foreach($asset in $current.assets){
  if($asset.fileName -cnotmatch '^RHFiles-Android-[A-Za-z0-9_.-]+\.apk$' -or $asset.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or [long]$asset.size -le 0 -or [long]$asset.size -gt 512MB -or $asset.fileName -cin $names){throw 'Invalid Android companion payload'}
  $names+=$asset.fileName;$match=@($source.assets|Where-Object name -CEQ $asset.fileName)
  if($match.Count -ne 1 -or [long]$match[0].size -ne [long]$asset.size -or $match[0].digest -cne ('sha256:'+$asset.sha256.ToLowerInvariant()) -or $match[0].browser_download_url -cne "https://github.com/$Repository/releases/download/$($source.tag_name)/$($asset.fileName)"){throw 'Android companion payload metadata mismatch'}
 }
 $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($text))).ToLowerInvariant()
 [pscustomobject]@{release=$source;manifest=$manifest;current=$current;code=$code;text=$text;hash=$hash}
}
function Save-RHFilesGithubAndroidCompanion([string]$Repository,[string]$Directory,$Options,$PublicOptions){
 $snapshot=Get-RHFilesGithubAndroidSnapshot $Repository $Options $PublicOptions
 if(-not $snapshot){return $null}
 New-Item -ItemType Directory -Path $Directory -Force|Out-Null;$files=@()
 foreach($asset in $snapshot.current.assets){
  $file=Join-Path $Directory $asset.fileName
  Invoke-WebRequest "https://github.com/$Repository/releases/download/$($snapshot.release.tag_name)/$($asset.fileName)" -OutFile $file @PublicOptions
  if((Get-Item -LiteralPath $file).Length -ne [long]$asset.size -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $asset.sha256){throw 'Android companion download checksum/size mismatch'}
  $files+=Get-Item -LiteralPath $file
 }
 $index=Join-Path $Directory 'releases.android.json';[IO.File]::WriteAllText($index,$snapshot.text,[Text.UTF8Encoding]::new($false));$files+=Get-Item -LiteralPath $index
 [pscustomobject]@{snapshot=$snapshot;files=$files}
}
function Assert-RHFilesGithubAndroidUnchanged([string]$Repository,$Companion,$Options,$PublicOptions){
 $current=Get-RHFilesGithubAndroidSnapshot $Repository $Options $PublicOptions
 if(($null -eq $Companion) -ne ($null -eq $current) -or ($Companion -and ($Companion.snapshot.release.id -ne $current.release.id -or $Companion.snapshot.hash -cne $current.hash))){throw 'Android publication changed during Windows upload; keep draft and refresh companion files'}
}
