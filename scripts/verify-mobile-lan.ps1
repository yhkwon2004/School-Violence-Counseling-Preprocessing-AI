param(
  [int]$MetroPort = 8081
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $root 'apps/mobile/.env.local'

function Assert-True([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw $Label }
}

function Read-EnvMap([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { continue }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      throw "Invalid environment line in $Path"
    }
    $values[$Matches[1]] = $Matches[2].Trim()
  }
  return $values
}

if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'Run npm.cmd run configure:mobile:lan before verifying the Android Expo Go LAN target.'
}
$values = Read-EnvMap $envPath
$allowedNames = @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY')
$unexpectedNames = @($values.Keys | Where-Object { $_ -notin $allowedNames })
Assert-True ($unexpectedNames.Count -eq 0) "Mobile public env contains unexpected values: $($unexpectedNames -join ', ')"
Assert-True ($values.Keys.Count -eq $allowedNames.Count) 'Mobile public env must contain exactly the Supabase URL and anon key.'
Assert-True ($values['EXPO_PUBLIC_SUPABASE_ANON_KEY'] -and $values['EXPO_PUBLIC_SUPABASE_ANON_KEY'] -notlike 'replace-with-*') 'Mobile anon key is missing.'
Assert-True ($MetroPort -ge 1 -and $MetroPort -le 65535) "Metro port is invalid: $MetroPort"

$apiUrl = $values['EXPO_PUBLIC_SUPABASE_URL'].TrimEnd('/')
$parsedUrl = $null
Assert-True ([uri]::TryCreate($apiUrl, [System.UriKind]::Absolute, [ref]$parsedUrl)) "Mobile Supabase URL is invalid: $apiUrl"
Assert-True ($parsedUrl.Scheme -eq 'http') 'Local Android Expo Go verification expects an HTTP LAN Supabase URL.'
Assert-True ($parsedUrl.Host -notin @('localhost', '127.0.0.1')) 'Android Expo Go cannot reach a loopback Supabase URL.'

$health = Invoke-WebRequest -Uri "$apiUrl/auth/v1/health" -UseBasicParsing -TimeoutSec 10
Assert-True ([int]$health.StatusCode -eq 200) "LAN Supabase health returned $($health.StatusCode)."
Write-Output 'mobile_supabase_lan=ok'

$metroUrl = "http://$($parsedUrl.Host):$MetroPort"
$status = Invoke-WebRequest -Uri "$metroUrl/status" -UseBasicParsing -TimeoutSec 10
$content = if ($status.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($status.Content) } else { [string]$status.Content }
Assert-True ([int]$status.StatusCode -eq 200 -and $content.Trim() -eq 'packager-status:running') 'Expo Metro LAN endpoint is not ready.'
Write-Output 'expo_metro_lan=ok'
Write-Output "expo_go_url=exp://$($parsedUrl.Host):$MetroPort"
