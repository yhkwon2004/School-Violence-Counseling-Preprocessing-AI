param(
  [string]$WebUrl = 'http://127.0.0.1:5173'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $root 'apps/web/.env.local'

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
  throw 'Run npm.cmd run configure:web:local before verifying the connected staff web.'
}
$values = Read-EnvMap $envPath
$allowedNames = @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY')
$unexpectedNames = @($values.Keys | Where-Object { $_ -notin $allowedNames })
Assert-True ($unexpectedNames.Count -eq 0) "Web public env contains unexpected values: $($unexpectedNames -join ', ')"
Assert-True ($values.Keys.Count -eq $allowedNames.Count) 'Web public env must contain exactly the Supabase URL and anon key.'
Assert-True ($values['VITE_SUPABASE_ANON_KEY'] -and $values['VITE_SUPABASE_ANON_KEY'] -notlike 'replace-with-*') 'Web anon key is missing.'

$apiUrl = $values['VITE_SUPABASE_URL'].TrimEnd('/')
$parsedApiUrl = $null
Assert-True ([uri]::TryCreate($apiUrl, [System.UriKind]::Absolute, [ref]$parsedApiUrl)) "Web Supabase URL is invalid: $apiUrl"
Assert-True ($parsedApiUrl.Scheme -in @('http', 'https')) 'Web Supabase URL must use HTTP or HTTPS.'
$health = Invoke-WebRequest -Uri "$apiUrl/auth/v1/health" -UseBasicParsing -TimeoutSec 10
Assert-True ([int]$health.StatusCode -eq 200) "Web Supabase health returned $($health.StatusCode)."
Write-Output 'web_supabase_local=ok'

$parsedWebUrl = $null
Assert-True ([uri]::TryCreate($WebUrl, [System.UriKind]::Absolute, [ref]$parsedWebUrl)) "Connected web URL is invalid: $WebUrl"
Assert-True ($parsedWebUrl.Scheme -in @('http', 'https')) 'Connected web URL must use HTTP or HTTPS.'
$web = Invoke-WebRequest -Uri $parsedWebUrl.AbsoluteUri -UseBasicParsing -TimeoutSec 10
$content = if ($web.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($web.Content) } else { [string]$web.Content }
Assert-True ([int]$web.StatusCode -eq 200 -and $content -match '<div id="root"></div>') 'Connected staff web entry HTML is not ready.'
Write-Output 'connected_web_html=ok'
Write-Output "connected_web_url=$($parsedWebUrl.AbsoluteUri.TrimEnd('/'))"
