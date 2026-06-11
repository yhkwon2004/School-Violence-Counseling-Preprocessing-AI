param(
  [string]$SupabaseUrl,
  [string]$AnonKey,
  [string]$EnvFile = 'supabase/.env.hosted',
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'apps/mobile/.env.local'
$envPath = [System.IO.Path]::GetFullPath((Join-Path $root $EnvFile))
$rootPrefix = $root.TrimEnd('\') + '\'

function Read-EnvValues([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -Encoding utf8 -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $values[$name.Trim()] = $value.Trim().Trim('"')
  }
  return $values
}

if (-not $envPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Hosted env file must stay inside the workspace.'
}

$values = Read-EnvValues $envPath
$apiUrl = if ($SupabaseUrl) { $SupabaseUrl.Trim() } else { $values['SUPABASE_URL'] }
$publicKey = if ($AnonKey) { $AnonKey.Trim() } else { $values['SUPABASE_ANON_KEY'] }

if (-not $apiUrl -or $apiUrl -like 'replace-with-*') {
  throw "Set SUPABASE_URL in $EnvFile or pass -SupabaseUrl."
}
if (-not $publicKey -or $publicKey -like 'replace-with-*') {
  throw "Set SUPABASE_ANON_KEY in $EnvFile or pass -AnonKey."
}

$parsed = $null
if (-not [uri]::TryCreate($apiUrl.TrimEnd('/'), [System.UriKind]::Absolute, [ref]$parsed) -or $parsed.Scheme -ne 'https') {
  throw "External Android APK builds require an https Supabase URL: '$apiUrl'"
}
if ($parsed.Host -in @('localhost', '127.0.0.1') -or $parsed.Host.EndsWith('.local')) {
  throw "External Android APK builds cannot use a local-only host: '$($parsed.Host)'"
}

$apiUrl = $apiUrl.TrimEnd('/')
try {
  $health = Invoke-WebRequest -Uri "$apiUrl/auth/v1/health" -Headers @{ apikey = $publicKey } -UseBasicParsing -TimeoutSec 20
  if ([int]$health.StatusCode -ne 200) { throw "Unexpected status $($health.StatusCode)" }
} catch {
  throw "Hosted Supabase is not reachable through $apiUrl. $($_.Exception.Message)"
}

$content = @(
  '# Generated for Android APK builds with an external Supabase endpoint.',
  "EXPO_PUBLIC_SUPABASE_URL=$apiUrl",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY=$publicKey"
) -join "`n"

if ($Preview) {
  Write-Output "mobile_env_target=$target"
  Write-Output "mobile_api_url=$apiUrl"
  Write-Output 'mobile_hosted_env_preview=ok'
  exit 0
}

Set-Content -LiteralPath $target -Value $content -Encoding utf8
Write-Output "mobile_env_target=$target"
Write-Output "mobile_api_url=$apiUrl"
Write-Output 'mobile_hosted_env_written=ok'
