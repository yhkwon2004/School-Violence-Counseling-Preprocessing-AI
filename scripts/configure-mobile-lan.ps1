param(
  [string]$LanAddress,
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'apps/mobile/.env.local'

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

if (-not $LanAddress) {
  $LanAddress = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.AddressState -eq 'Preferred'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -ExpandProperty IPAddress -First 1
}

$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne 'InterNetwork') {
  throw "A valid IPv4 LAN address is required: '$LanAddress'"
}
if ([System.Net.IPAddress]::IsLoopback($parsedAddress)) {
  throw 'Loopback addresses cannot be reached from an Android device.'
}

$anonKey = Get-SupabaseStatusValue -Names @('PUBLISHABLE_KEY', 'ANON_KEY')
$apiUrl = "http://${LanAddress}:54321"
try {
  $health = Invoke-WebRequest -Uri "$apiUrl/auth/v1/health" -UseBasicParsing -TimeoutSec 10
  if ([int]$health.StatusCode -ne 200) { throw "Unexpected status $($health.StatusCode)" }
} catch {
  throw "Local Supabase is not reachable through $apiUrl. Check the LAN address and firewall. $($_.Exception.Message)"
}
$content = @(
  "# Generated for Android Expo Go on the local network.",
  "EXPO_PUBLIC_SUPABASE_URL=$apiUrl",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY=$anonKey"
) -join "`n"

if ($Preview) {
  Write-Output "mobile_env_target=$target"
  Write-Output "mobile_api_url=$apiUrl"
  Write-Output 'mobile_env_preview=ok'
  exit 0
}

Set-Content -LiteralPath $target -Value $content -Encoding utf8
Write-Output "mobile_env_target=$target"
Write-Output "mobile_api_url=$apiUrl"
Write-Output 'mobile_env_written=ok'
