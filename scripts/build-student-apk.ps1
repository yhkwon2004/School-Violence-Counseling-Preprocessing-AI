param(
  [string]$SupabaseUrl,
  [string]$AnonKey,
  [string]$EnvFile = 'supabase/.env.hosted',
  [string]$ProjectId,
  [string]$OutputDir = 'artifacts/android'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mobileDir = Join-Path $root 'apps/mobile'
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $root $OutputDir))
$rootPrefix = $root.TrimEnd('\') + '\'

if (-not $outputPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'APK output directory must stay inside the workspace.'
}

function Read-EnvValues([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content -Encoding utf8 -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $values[$name.Trim()] = $value.Trim().Trim('"')
  }
  return $values
}

$configureArguments = @(
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Join-Path $PSScriptRoot 'configure-mobile-hosted.ps1'),
  '-EnvFile',
  $EnvFile
)
if ($SupabaseUrl) { $configureArguments += @('-SupabaseUrl', $SupabaseUrl) }
if ($AnonKey) { $configureArguments += @('-AnonKey', $AnonKey) }
& powershell @configureArguments
if ($LASTEXITCODE -ne 0) { throw 'Mobile hosted env configuration failed.' }

Push-Location $mobileDir
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $whoami = & npx.cmd eas-cli whoami 2>&1
  $whoamiExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($whoamiExitCode -ne 0) {
    throw "Expo/EAS login is required. Run 'npx.cmd eas-cli login' in apps/mobile or set EXPO_TOKEN, then retry."
  }
  Write-Output "eas_account=$($whoami | Select-Object -First 1)"

  if ($ProjectId) {
    & npx.cmd eas-cli init --id $ProjectId --force --non-interactive
    if ($LASTEXITCODE -ne 0) { throw 'EAS project link failed.' }
  }

  $appConfig = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $mobileDir 'app.json') | ConvertFrom-Json
  $existingProjectId = $appConfig.expo.extra.eas.projectId
  if (-not $ProjectId -and -not $existingProjectId) {
    throw "EAS project id is missing. Pass -ProjectId for the first build or run 'npx.cmd eas-cli init' once."
  }

  $mobileEnv = Read-EnvValues (Join-Path $mobileDir '.env.local')
  foreach ($name in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY')) {
    $value = $mobileEnv[$name]
    if (-not $value) { throw "$name is missing from apps/mobile/.env.local." }
    & npx.cmd eas-cli env:create preview --scope project --name $name --value $value --visibility plaintext --force --non-interactive
    if ($LASTEXITCODE -ne 0) { throw "EAS preview env creation failed for $name." }
  }

  New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
  $env:EXPO_NO_TELEMETRY = '1'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $buildOutput = & npx.cmd eas-cli build --platform android --profile preview --non-interactive --wait --json 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
} finally {
  Pop-Location
}
$rawOutput = ($buildOutput | Out-String).Trim()
if ($exitCode -ne 0) {
  Write-Output $rawOutput
  throw 'EAS Android preview APK build failed.'
}

$jsonMatch = [regex]::Match($rawOutput, '(?s)(\[\s*\{.*?\}\s*\]|\{\s*.*?\s*\})\s*$')
if (-not $jsonMatch.Success) {
  Write-Output $rawOutput
  throw 'EAS did not return JSON build metadata.'
}
$metadata = $jsonMatch.Groups[1].Value | ConvertFrom-Json
$build = @($metadata)[0]

function Get-NestedValue($Object, [string]$Path) {
  $current = $Object
  foreach ($part in $Path.Split('.')) {
    if ($null -eq $current) { return $null }
    $property = $current.PSObject.Properties[$part]
    if (-not $property) { return $null }
    $current = $property.Value
  }
  return $current
}

$artifactUrl = $null
foreach ($path in @('artifacts.buildUrl', 'artifacts.applicationArchiveUrl', 'artifacts.url')) {
  $artifactUrl = Get-NestedValue $build $path
  if ($artifactUrl) { break }
}
$buildId = $build.id
$buildUrl = $build.buildDetailsPageUrl
if (-not $artifactUrl) {
  Write-Output "student_apk_build_id=$buildId"
  Write-Output "student_apk_build_url=$buildUrl"
  throw 'EAS build completed but no APK artifact URL was returned.'
}

$safeBuildId = if ($buildId) { $buildId } else { (Get-Date -Format 'yyyyMMddHHmmss') }
$apkPath = Join-Path $outputPath "ieumlog-student-preview-$safeBuildId.apk"
Invoke-WebRequest -Uri $artifactUrl -OutFile $apkPath -UseBasicParsing -TimeoutSec 300

Write-Output "student_apk_build_id=$buildId"
Write-Output "student_apk_build_url=$buildUrl"
Write-Output "student_apk_download_url=$artifactUrl"
Write-Output "student_apk_file=$apkPath"
