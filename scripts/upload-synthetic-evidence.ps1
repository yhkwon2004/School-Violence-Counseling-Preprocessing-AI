param(
  [string]$EnvFile = 'supabase/.env.hosted',
  [string]$ProjectRef = '',
  [switch]$UseCliApiKey,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $root.TrimEnd('\') + '\'
$bucket = 'case-evidence'
$caseId = '30000000-0000-0000-0000-000000000001'
$assetRoot = Join-Path $root 'apps/web/public/demo-evidence/case-synthetic-001'

function Read-EnvMap([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { continue }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      throw "Invalid environment line in $Path"
    }
    $values[$Matches[1]] = $Matches[2].Trim()
  }
  return $values
}

function Get-EnvValue([hashtable]$Values, [string[]]$Names) {
  foreach ($name in $Names) {
    if ($Values.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($Values[$name])) {
      return $Values[$name]
    }
  }
  return $null
}

function Get-ProjectRefFromUrl([string]$Url) {
  if ($Url -match '^https://([a-z0-9]{20})\.supabase\.co/?$') {
    return $Matches[1]
  }
  return ''
}

function Find-ApiKeyInJson($Node) {
  if ($null -eq $Node -or $Node -is [string]) { return $null }
  if ($Node -is [System.Array]) {
    foreach ($item in $Node) {
      $found = Find-ApiKeyInJson $item
      if ($found) { return $found }
    }
    return $null
  }
  $props = @{}
  foreach ($prop in $Node.PSObject.Properties) {
    $props[$prop.Name] = $prop.Value
  }
  $label = ''
  foreach ($labelName in @('name', 'key_name', 'type', 'role')) {
    if ($props.ContainsKey($labelName)) { $label = [string]$props[$labelName]; break }
  }
  $value = $null
  foreach ($valueName in @('api_key', 'apikey', 'key', 'value')) {
    if ($props.ContainsKey($valueName)) { $value = [string]$props[$valueName]; break }
  }
  if ($value -and $label -match '(service|secret)') {
    return $value
  }
  foreach ($prop in $Node.PSObject.Properties) {
    $found = Find-ApiKeyInJson $prop.Value
    if ($found) { return $found }
  }
  return $null
}

function Get-CliApiKey([string]$Ref) {
  if ($Ref -notmatch '^[a-z0-9]{20}$') {
    throw "Supabase project ref must be 20 lowercase letters or digits: '$Ref'"
  }
  $jsonText = & npx.cmd supabase projects api-keys --project-ref $Ref --output json
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read Supabase API keys through the CLI.' }
  $json = $jsonText | ConvertFrom-Json
  $key = Find-ApiKeyInJson $json
  if (-not $key) {
    throw 'The CLI returned API keys, but no service/secret key shape was recognized.'
  }
  return $key
}

function Encode-StoragePath([string]$Path) {
  return (($Path -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
}

function Upload-Asset([string]$BaseUrl, [string]$Key, [hashtable]$Asset) {
  $file = Join-Path $assetRoot $Asset.File
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Synthetic evidence file is missing: $($Asset.File)"
  }
  $storagePath = "$caseId/$($Asset.File)"
  if ($DryRun) {
    Write-Output "synthetic_evidence_dry_run=$storagePath"
    return
  }
  $uri = "$BaseUrl/storage/v1/object/$bucket/$(Encode-StoragePath $storagePath)"
  $headers = @{
    Authorization = "Bearer $Key"
    apikey = $Key
    'x-upsert' = 'true'
  }
  Invoke-WebRequest -Method Post -Uri $uri -Headers $headers -ContentType $Asset.Mime -InFile $file -UseBasicParsing -TimeoutSec 120 | Out-Null
}

$envPath = [System.IO.Path]::GetFullPath((Join-Path $root $EnvFile))
if (-not $envPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Hosted env file must stay inside the workspace.'
}
$values = Read-EnvMap $envPath
$baseUrl = Get-EnvValue $values @('SUPABASE_URL', 'VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL')
if (-not $baseUrl) { throw 'SUPABASE_URL is required.' }
$baseUrl = $baseUrl.TrimEnd('/')

$secretKey = Get-EnvValue $values @('SUPABASE_SECRET_KEY', 'SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY')
if (-not $secretKey -and $UseCliApiKey) {
  if (-not $ProjectRef) { $ProjectRef = Get-ProjectRefFromUrl $baseUrl }
  $secretKey = Get-CliApiKey $ProjectRef
}
if (-not $secretKey -and -not $DryRun) {
  throw 'A Supabase secret/service-role key is required. Add SUPABASE_SECRET_KEY to the ignored env file or run with -UseCliApiKey after supabase login.'
}

$assets = @(
  @{ File = 'chat-capture-001.svg'; Mime = 'image/svg+xml' },
  @{ File = 'stair-location-map-002.svg'; Mime = 'image/svg+xml' },
  @{ File = 'stair-video-003.webm'; Mime = 'video/webm' },
  @{ File = 'chat-share-003.svg'; Mime = 'image/svg+xml' },
  @{ File = 'teacher-note-004.txt'; Mime = 'text/plain; charset=utf-8' },
  @{ File = 'witness-memo-005.txt'; Mime = 'text/plain; charset=utf-8' },
  @{ File = 'timeline-board-006.svg'; Mime = 'image/svg+xml' }
)

foreach ($asset in $assets) {
  Upload-Asset $baseUrl $secretKey $asset
}

Write-Output "synthetic_evidence_uploaded=$($assets.Count)"
