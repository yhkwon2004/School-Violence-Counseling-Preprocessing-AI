param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [string]$EnvFile = 'supabase/.env.hosted',
  [switch]$ConfirmSyntheticDemo
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $root.TrimEnd('\') + '\'

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

if (-not $ConfirmSyntheticDemo) {
  throw 'Hosted demo bootstrap requires -ConfirmSyntheticDemo because it creates fixed synthetic accounts and records.'
}
if ($ProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw "Supabase project ref must be 20 lowercase letters or digits: '$ProjectRef'"
}

$envPath = [System.IO.Path]::GetFullPath((Join-Path $root $EnvFile))
if (-not $envPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Hosted env file must stay inside the workspace.'
}
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Create $EnvFile from supabase/.env.hosted.example first."
}
$values = Read-EnvMap $envPath
$expectedUrl = "https://$ProjectRef.supabase.co"
if ($values['SUPABASE_URL'] -ne $expectedUrl) {
  throw "SUPABASE_URL must match the requested hosted project: $expectedUrl"
}
$demoPassword = $values['HOSTED_DEMO_PASSWORD']
if (-not $demoPassword -or $demoPassword -like 'replace-with-*' -or $demoPassword.Length -lt 12) {
  throw 'HOSTED_DEMO_PASSWORD must be a non-placeholder value with at least 12 characters.'
}
if ($demoPassword -match "[`r`n]") {
  throw 'HOSTED_DEMO_PASSWORD must stay on one line.'
}

$seedPath = Join-Path $root 'supabase/seed.sql'
$seed = Get-Content -Raw -Encoding utf8 -LiteralPath $seedPath
if (-not $seed.Contains('-- Fully synthetic demo data.')) {
  throw 'Refusing to bootstrap a seed file without the synthetic-only marker.'
}
$escapedPassword = $demoPassword.Replace("'", "''")
$localPasswordSql = "crypt('demo1234', gen_salt('bf'))"
$hostedPasswordSql = "crypt('$escapedPassword', gen_salt('bf'))"
$hostedSeed = $seed.Replace($localPasswordSql, $hostedPasswordSql)
if ($hostedSeed -eq $seed -or $hostedSeed.Contains($localPasswordSql)) {
  throw 'Unable to replace the local-only demo password before hosted bootstrap.'
}
$hostedSeed = "do `$ieumlog`$`nbegin`n$hostedSeed`nend`n`$ieumlog`$;"

$tempPath = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($tempPath, $hostedSeed, [System.Text.UTF8Encoding]::new($false))
  & npx.cmd supabase link --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw 'Supabase link failed' }
  & npx.cmd supabase db query --linked --file $tempPath
  if ($LASTEXITCODE -ne 0) { throw 'Hosted synthetic demo bootstrap failed' }
} finally {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}

Write-Output 'hosted_demo_bootstrap=ok'
