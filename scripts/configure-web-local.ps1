param(
  [string]$ApiUrl = 'http://127.0.0.1:54321',
  [string]$AnonKey,
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'apps/web/.env.local'

function Get-SupabaseStatusValue([string[]]$Names) {
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
      $status = & npx.cmd supabase status -o env 2>$null | Out-String
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    foreach ($name in $Names) {
      $line = $status -split "`r?`n" | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
      if ($line) {
        return ($line -split '=', 2)[1].Trim('"')
      }
    }
    Start-Sleep -Seconds 1
  }
  throw "$($Names -join ' or ') was not found. Start local Supabase first."
}

$apiUrl = $ApiUrl.TrimEnd('/')
$parsedApiUrl = $null
if (-not [uri]::TryCreate($apiUrl, [System.UriKind]::Absolute, [ref]$parsedApiUrl) -or $parsedApiUrl.Scheme -notin @('http', 'https')) {
  throw "A valid local Supabase URL is required: '$ApiUrl'"
}
$anonKey = if ($AnonKey) { $AnonKey.Trim() } else { Get-SupabaseStatusValue -Names @('PUBLISHABLE_KEY', 'ANON_KEY') }
if (-not $anonKey -or $anonKey -like 'replace-with-*') {
  throw 'A local Supabase publishable or anon key is required.'
}
try {
  $health = Invoke-WebRequest -Uri "$apiUrl/auth/v1/health" -UseBasicParsing -TimeoutSec 10
  if ([int]$health.StatusCode -ne 200) { throw "Unexpected status $($health.StatusCode)" }
} catch {
  throw "Local Supabase is not reachable through $apiUrl. $($_.Exception.Message)"
}
$content = @(
  '# Generated for the local connected staff web.',
  "VITE_SUPABASE_URL=$apiUrl",
  "VITE_SUPABASE_ANON_KEY=$anonKey"
) -join "`n"

if ($Preview) {
  Write-Output "web_env_target=$target"
  Write-Output "web_api_url=$apiUrl"
  Write-Output 'web_env_preview=ok'
  exit 0
}

Set-Content -LiteralPath $target -Value $content -Encoding utf8
Write-Output "web_env_target=$target"
Write-Output "web_api_url=$apiUrl"
Write-Output 'web_env_written=ok'
