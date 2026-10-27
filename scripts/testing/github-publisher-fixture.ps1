# Network-free integration fixture for the actual Windows publisher. Every
# unrecognized request throws; GH_TOKEN is a dummy supplied only by the test.
$ErrorActionPreference='Stop'
$case=$env:RHFILES_POLICY_CASE|ConvertFrom-Json
$script:mockWindows=$null;$script:mockEvents=@();$script:mockPublished=$false
function Invoke-WebRequest {
 param($Uri,$OutFile,$TimeoutSec,$Proxy,$Headers)
 if($OutFile){if($Uri -cne $case.releases[1].assets[1].browser_download_url){throw 'Unexpected APK download'};[IO.File]::WriteAllBytes($OutFile,[Text.Encoding]::UTF8.GetBytes($case.apk));return}
 if($Uri -cne $case.releases[1].assets[0].browser_download_url){throw 'Unexpected public request'}
 [pscustomobject]@{Content=$case.feed}
}
function Invoke-RestMethod {
 param($Uri,$Method='Get',$Body,$InFile,$ContentType,$TimeoutSec,$Proxy,$Headers)
 $api='https://api.github.com/repos/example/repo'
 if($Uri -like "$api/releases?per_page=*"){return ,@(@($case.releases)+@($script:mockWindows|Where-Object {$_}))}
 if($Uri -ceq "$api/releases" -and $Method -eq 'Post'){
  $data=$Body|ConvertFrom-Json;if(-not $data.draft -or $data.make_latest -cne 'false'){throw 'Release must begin as a non-Latest draft'}
  $script:mockWindows=[pscustomobject]@{id=99;tag_name=$data.tag_name;html_url="https://github.com/example/repo/releases/tag/$($data.tag_name)";draft=$true;prerelease=$false;assets=@()};return $script:mockWindows
 }
 if($Uri -like 'https://uploads.github.com/repos/example/repo/releases/99/assets?name=*' -and $Method -eq 'Post'){
  $name=[uri]::UnescapeDataString(([uri]$Uri).Query.Substring(6));$file=Get-Item -LiteralPath $InFile
  $asset=[pscustomobject]@{id=(1000+$script:mockEvents.Count);name=$name;size=$file.Length;digest=('sha256:'+(Get-FileHash -LiteralPath $InFile -Algorithm SHA256).Hash.ToLowerInvariant());browser_download_url="https://github.com/example/repo/releases/download/v$($case.windowsVersion)/$name"}
  $script:mockWindows.assets+=,$asset;$script:mockEvents+=('upload:'+$name);return $asset
 }
 if($Uri -ceq "$api/releases/99"){
  if($Method -eq 'Patch'){
   $data=$Body|ConvertFrom-Json
   if($data.make_latest -cne 'true' -or $data.draft){throw 'Unexpected publish transition'}
   foreach($name in @($case.manifest.releases[0].assets[0].fileName,'releases.android.json')){if(-not @($script:mockWindows.assets|Where-Object name -CEQ $name).Count){throw 'Android companion absent at the Latest transition'}}
   $script:mockEvents+='publish';$script:mockPublished=$true;$script:mockWindows.draft=$false
  }
  return $script:mockWindows
 }
 if($Uri -ceq "$api/releases/latest"){if(-not $script:mockPublished){throw 'Latest read before publication'};return $script:mockWindows}
 if($Uri -ceq "https://github.com/example/repo/releases/download/v$($case.windowsVersion)/releases.win.json"){return $case.windowsFeed}
 if($Uri -ceq "https://github.com/example/repo/releases/download/v$($case.windowsVersion)/releases.android.json"){return $case.manifest}
 throw "Unexpected API request: $Method $Uri"
}
. $env:RHFILES_WINDOWS_PUBLISHER -Directory $case.directory -Repository example/repo -Commit ('a'*40)
if(-not $script:mockPublished){throw 'No publication transition'}
@{events=$script:mockEvents;assets=@($script:mockWindows.assets|ForEach-Object name)}|ConvertTo-Json -Depth 5 -Compress
