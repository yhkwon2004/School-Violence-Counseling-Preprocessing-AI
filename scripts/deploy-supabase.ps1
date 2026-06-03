param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [string]$SecretsFile = 'supabase/functions/.env.deploy'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$secretsPath = [System.IO.Path]::GetFullPath((Join-Path $root $SecretsFile))
if ($ProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw "Supabase project ref must be 20 lowercase letters or digits: '$ProjectRef'"
}
$rootPrefix = $root.TrimEnd('\') + '\'
if (-not $secretsPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Secrets file must stay inside the workspace.'
}
if (-not (Test-Path -LiteralPath $secretsPath)) {
  throw "Create $SecretsFile from supabase/functions/.env.deploy.example first."
}
$secrets = Get-Content -Raw -Encoding utf8 -LiteralPath $secretsPath
if ($secrets -match '(?m)^SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEYS|SECRET_KEYS)=') {
  throw 'Do not duplicate hosted Supabase default secrets in the deploy secrets file.'
}
if ($secrets -match '(?m)^OPENAI_API_BASE_URL=') {
  throw 'Do not override the official OpenAI endpoint in hosted deployment secrets.'
}
foreach ($requiredSecret in @('PROCESS_RETRY_CRON_SECRET', 'PURGE_CRON_SECRET', 'HANDOFF_CODE_PEPPER')) {
  $line = $secrets -split "`r?`n" | Where-Object { $_ -match "^$requiredSecret=" } | Select-Object -First 1
  $value = if ($line) { ($line -split '=', 2)[1].Trim() } else { '' }
  if (-not $value -or $value -like 'replace-with-*') {
    throw "Set a random value for $requiredSecret before deployment."
  }
}
$externalAiMode = $secrets -split "`r?`n" | Where-Object { $_ -match '^EXTERNAL_AI_MODE=' } | Select-Object -First 1
if (-not $externalAiMode -or ($externalAiMode -split '=', 2)[1].Trim() -ne 'synthetic_only') {
  throw 'EXTERNAL_AI_MODE must stay synthetic_only for the MVP deployment.'
}

$functions = @(
  'student-login',
  'admin-users',
  'admin-institutions',
  'evidence-upload-url',
  'discard-evidence-upload',
  'evidence-download-url',
  'process-evidence',
  'process-case',
  'submit-case',
  'staff-case-action',
  'retry-failed-jobs',
  'purge-deleted'
)

& npx.cmd supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw 'Supabase link failed' }
& npx.cmd supabase db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Supabase db push failed' }
& npx.cmd supabase secrets set --project-ref $ProjectRef --env-file $secretsPath
if ($LASTEXITCODE -ne 0) { throw 'Supabase secrets set failed' }

foreach ($functionName in $functions) {
  & npx.cmd supabase functions deploy $functionName --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw "Deploying $functionName failed" }
}

Write-Output 'supabase_deploy=ok'
Write-Output 'For an isolated synthetic demo project, run npm.cmd run bootstrap:hosted-demo -- -ProjectRef yourprojectref1234567 -ConfirmSyntheticDemo.'
Write-Output 'Run supabase/cron.example.sql in the hosted SQL editor after replacing placeholders.'
