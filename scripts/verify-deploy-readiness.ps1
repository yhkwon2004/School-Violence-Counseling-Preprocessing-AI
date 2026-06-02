$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Assert-True([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw $Label }
}

function Read-WorkspaceFile([string]$Path) {
  return Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root $Path)
}

$requiredFunctions = @(
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
foreach ($functionName in $requiredFunctions) {
  Assert-True (Test-Path -LiteralPath (Join-Path $root "supabase/functions/$functionName/index.ts")) "Missing Edge Function: $functionName"
}
Write-Output 'edge_function_manifest=ok'

$migration = Read-WorkspaceFile 'supabase/migrations/20260531000100_ieumlog_initial.sql'
foreach ($marker in @('reserve_evidence_processing', 'reserve_retryable_evidence_jobs', 'begin_evidence_upload_discard', 'cancel_evidence_upload_discard', 'finalize_evidence_upload_discard', 'cases_ready_for_purge', 'release_case_purge_claim', 'finalize_case_purge', 'for update of c skip locked', 'for update of j skip locked')) {
  Assert-True ($migration.Contains($marker)) "Evidence processing reservation migration is missing: $marker"
}
foreach ($signature in @('reserve_evidence_processing(uuid)', 'reserve_retryable_evidence_jobs(integer)', 'begin_evidence_upload_discard(uuid, uuid)', 'cancel_evidence_upload_discard(uuid, uuid)', 'finalize_evidence_upload_discard(uuid, uuid)', 'cases_ready_for_purge(integer)', 'release_case_purge_claim(uuid)', 'finalize_case_purge(uuid, text)')) {
  Assert-True ($migration.Contains("revoke all on function public.$signature from public, anon, authenticated;")) "Service-role RPC is still public: $signature"
}
$processEvidence = Read-WorkspaceFile 'supabase/functions/process-evidence/index.ts'
$retryFailedJobs = Read-WorkspaceFile 'supabase/functions/retry-failed-jobs/index.ts'
$discardEvidenceUpload = Read-WorkspaceFile 'supabase/functions/discard-evidence-upload/index.ts'
$purgeDeleted = Read-WorkspaceFile 'supabase/functions/purge-deleted/index.ts'
Assert-True ($processEvidence.Contains("rpc('reserve_evidence_processing'")) 'Evidence processing Edge Function must use its reservation RPC'
Assert-True ($retryFailedJobs.Contains("rpc('reserve_retryable_evidence_jobs'")) 'Retry Edge Function must use its reservation RPC'
Assert-True ($discardEvidenceUpload.Contains("rpc('begin_evidence_upload_discard'") -and $discardEvidenceUpload.Contains("rpc('finalize_evidence_upload_discard'")) 'Discard Edge Function must use its reservation RPCs'
Assert-True ($purgeDeleted.Contains("rpc('cases_ready_for_purge'") -and $purgeDeleted.Contains("rpc('release_case_purge_claim'") -and $purgeDeleted.Contains("rpc('finalize_case_purge'")) 'Purge Edge Function must use its reservation RPCs'
Write-Output 'evidence_processing_reservation=ok'

$config = Read-WorkspaceFile 'supabase/config.toml'
foreach ($publicFunction in @('student-login', 'retry-failed-jobs', 'purge-deleted')) {
  Assert-True ($config -match "(?ms)\[functions\.$publicFunction\]\s+verify_jwt\s*=\s*false") "Missing verify_jwt=false for $publicFunction"
}
Write-Output 'edge_function_auth_config=ok'

$mobileEnv = Read-WorkspaceFile 'apps/mobile/.env.example'
$webEnv = Read-WorkspaceFile 'apps/web/.env.example'
Assert-True ($mobileEnv -notmatch 'SERVICE_ROLE|SECRET_KEYS|OPENAI|CRON_SECRET') 'Mobile env example contains a server secret'
Assert-True ($webEnv -notmatch 'SERVICE_ROLE|SECRET_KEYS|OPENAI|CRON_SECRET') 'Web env example contains a server secret'
Write-Output 'public_env_boundary=ok'

$deploySecrets = Read-WorkspaceFile 'supabase/functions/.env.deploy.example'
foreach ($name in @('OPENAI_API_KEY', 'EXTERNAL_AI_MODE', 'PROCESS_RETRY_CRON_SECRET', 'PURGE_CRON_SECRET')) {
  Assert-True ($deploySecrets -match "(?m)^$name=") "Missing deploy secret template value: $name"
}
Assert-True ($deploySecrets -notmatch '(?m)^SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEYS|SECRET_KEYS)=') 'Hosted Supabase default secrets should not be duplicated'
Assert-True ($deploySecrets -notmatch '(?m)^OPENAI_API_BASE_URL=') 'Hosted deploy template must use the official OpenAI endpoint'
Write-Output 'deploy_secret_template=ok'

$appConfig = Read-WorkspaceFile 'apps/mobile/app.json' | ConvertFrom-Json
$eas = Read-WorkspaceFile 'apps/mobile/eas.json' | ConvertFrom-Json
$package = Read-WorkspaceFile 'package.json' | ConvertFrom-Json
$mobileIgnore = Read-WorkspaceFile 'apps/mobile/.gitignore'
Assert-True ($appConfig.expo.android.package -eq 'kr.ieumlog.student') 'Android package id is missing'
Assert-True ($appConfig.expo.ios.bundleIdentifier -eq 'kr.ieumlog.student') 'iOS bundle id is missing'
Assert-True ($eas.build.preview.android.buildType -eq 'apk') 'EAS preview must produce an APK'
Assert-True ($eas.build.production.android.buildType -eq 'app-bundle') 'EAS production must produce an app bundle'
Assert-True ($package.scripts.'dev:mobile'.EndsWith('--')) 'Mobile dev script must forward Expo CLI options after the npm delimiter'
Assert-True ($package.scripts.'dev:web'.EndsWith('--')) 'Web dev script must forward Vite CLI options after the npm delimiter'
Assert-True ($package.devDependencies.supabase -eq '2.103.0') 'Supabase CLI must stay pinned to 2.103.0'
Assert-True ($mobileIgnore -match '(?m)^expo-env\.d\.ts\r?$') 'Expo-generated type references must stay out of git'
Write-Output 'eas_config=ok'

$studentWizard = Read-WorkspaceFile 'apps/mobile/app/index.tsx'
$studentApiClient = Read-WorkspaceFile 'apps/mobile/src/studentApi.ts'
$studentFlow = Read-WorkspaceFile 'apps/mobile/src/studentFlow.ts'
$memoUpdateQueue = Read-WorkspaceFile 'apps/mobile/src/memoUpdateQueue.ts'
$memoUpdateQueueTest = Read-WorkspaceFile 'apps/mobile/src/memoUpdateQueue.test.ts'
Assert-True ($package.scripts.'test:mobile-core'.Contains('memoUpdateQueue.test.ts')) 'Mobile core tests must include MemoUpdateQueue ordering'
foreach ($marker in @('class MemoUpdateQueue', 'enqueue(update:', 'waitForIdle()')) {
  Assert-True ($memoUpdateQueue.Contains($marker)) "Mobile memo update queue is missing: $marker"
}
foreach ($marker in @('runs memo updates in request order', 'continues with the newest update after an earlier request fails')) {
  Assert-True ($memoUpdateQueueTest.Contains($marker)) "Mobile memo update queue test is missing: $marker"
}
foreach ($marker in @('new MemoUpdateQueue()', 'this.memoUpdates.waitForIdle()')) {
  Assert-True ($studentApiClient.Contains($marker)) "Student API memo ordering is missing: $marker"
}
foreach ($marker in @('questionSaveBlockReason', 'pendingQuestionSave !== null', 'submissionInFlight.current', 'deviceDraftUpdates.enqueue', 'submitBehavior="blurAndSubmit"')) {
  Assert-True ($studentWizard.Contains($marker)) "Student wizard integrity guard is missing: $marker"
}
Assert-True ($studentFlow.Contains("export function questionSaveBlockReason")) 'Student question save blocking policy is missing'
Write-Output 'mobile_submission_integrity=ok'

$vercel = Read-WorkspaceFile 'apps/web/vercel.json' | ConvertFrom-Json
Assert-True ($vercel.framework -eq 'vite') 'Vercel framework must be vite'
Assert-True ($vercel.buildCommand -eq 'npm run build') 'Vercel build command is missing'
Assert-True ($vercel.outputDirectory -eq 'dist') 'Vercel output directory is missing'
Assert-True (@($vercel.rewrites).Count -gt 0 -and $vercel.rewrites[0].destination -eq '/index.html') 'Vercel SPA rewrite is missing'
Write-Output 'vercel_config=ok'

$ci = Read-WorkspaceFile '.github/workflows/verify.yml'
Assert-True ($ci.Contains('runs-on: windows-latest')) 'CI runner must support the PowerShell verification scripts'
foreach ($command in @('npm run test', 'npm run typecheck', 'npm run build', 'npm run verify:deploy', 'npx expo-doctor', 'npx expo export --platform android')) {
  Assert-True ($ci.Contains($command)) "CI workflow is missing: $command"
}
Write-Output 'ci_workflow=ok'

$cron = Read-WorkspaceFile 'supabase/cron.example.sql'
foreach ($marker in @('pg_cron', 'pg_net', 'vault.create_secret', 'ieumlog-retry-failed-jobs', 'ieumlog-purge-deleted')) {
  Assert-True ($cron.Contains($marker)) "Hosted cron template is missing: $marker"
}
Write-Output 'hosted_cron_template=ok'

$hostedEnv = Read-WorkspaceFile 'supabase/.env.hosted.example'
foreach ($name in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'HOSTED_DEMO_PASSWORD')) {
  Assert-True ($hostedEnv -match "(?m)^$name=") "Missing hosted smoke env template value: $name"
}
Assert-True ($hostedEnv -notmatch 'SERVICE_ROLE|SECRET_KEYS|OPENAI|CRON_SECRET') 'Hosted smoke env template contains a server secret'
$bootstrapHosted = Read-WorkspaceFile 'scripts/bootstrap-hosted-demo.ps1'
foreach ($marker in @('ConfirmSyntheticDemo', '-- Fully synthetic demo data.', "crypt('demo1234', gen_salt('bf'))", 'do `$ieumlog`$', 'supabase db query --linked --file')) {
  Assert-True ($bootstrapHosted.Contains($marker)) "Hosted demo bootstrap is missing: $marker"
}
$verifyHosted = Read-WorkspaceFile 'scripts/verify-hosted.ps1'
foreach ($marker in @('/auth/v1/health', '/functions/v1/student-login', '/functions/v1/evidence-upload-url', '/functions/v1/discard-evidence-upload', '/functions/v1/evidence-download-url', '/functions/v1/process-evidence', 'hosted_processing_reservation=ok', '/rest/v1/rpc/schedule_case_deletion', 'Convert-WebContentToText')) {
  Assert-True ($verifyHosted.Contains($marker)) "Hosted verification is missing: $marker"
}
$seed = Read-WorkspaceFile 'supabase/seed.sql'
foreach ($marker in @('-- Fully synthetic demo data.', 'encrypted_password = excluded.encrypted_password', '90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001')) {
  Assert-True ($seed.Contains($marker)) "Synthetic seed idempotency marker is missing: $marker"
}
Write-Output 'hosted_demo_automation=ok'

$verifyMobileLan = Read-WorkspaceFile 'scripts/verify-mobile-lan.ps1'
foreach ($marker in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', '/auth/v1/health', '/status', 'packager-status:running', 'expo_go_url=')) {
  Assert-True ($verifyMobileLan.Contains($marker)) "Mobile LAN verification is missing: $marker"
}
Write-Output 'mobile_lan_automation=ok'

$configureMobileLan = Read-WorkspaceFile 'scripts/configure-mobile-lan.ps1'
$configureWebLocal = Read-WorkspaceFile 'scripts/configure-web-local.ps1'
$verifyWebLocal = Read-WorkspaceFile 'scripts/verify-web-local.ps1'
$verifyWebUiLocal = Read-WorkspaceFile 'scripts/verify-web-ui-local.ps1'
$verifyWebUiLocalNode = Read-WorkspaceFile 'scripts/verify-web-ui-local.mjs'
foreach ($marker in @('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'PUBLISHABLE_KEY', 'ANON_KEY')) {
  Assert-True ($configureMobileLan.Contains($marker)) "Android LAN local configuration is missing: $marker"
}
foreach ($marker in @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'PUBLISHABLE_KEY', 'ANON_KEY', '/auth/v1/health', 'web_env_written=ok')) {
  Assert-True ($configureWebLocal.Contains($marker)) "Connected web local configuration is missing: $marker"
}
foreach ($marker in @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', '/auth/v1/health', '<div id="root"></div>', 'connected_web_url=')) {
  Assert-True ($verifyWebLocal.Contains($marker)) "Connected web local verification is missing: $marker"
}
Write-Output 'connected_web_local_automation=ok'

Assert-True ($package.scripts.'verify:web:ui-local'.Contains('verify-web-ui-local.ps1')) 'Connected web UI smoke command is missing'
foreach ($marker in @('--headless=new', '-WindowStyle Hidden', 'verify-web-ui-local.mjs')) {
  Assert-True ($verifyWebUiLocal.Contains($marker)) "Connected web UI smoke launcher is missing: $marker"
}
foreach ($marker in @('connected_counselor_ui=ok', 'connected_institution_admin_ui=ok', 'connected_platform_ui=ok', 'counselor-evidence-map.png', 'institution-admin-retention.png', 'institution-admin-retention-mobile.png', 'platform-admin-menu.png', 'web-ui-failure.png', 'login failed:', 'Emulation.setDeviceMetricsOverride', 'hasHorizontalOverflow')) {
  Assert-True ($verifyWebUiLocalNode.Contains($marker)) "Connected web UI smoke check is missing: $marker"
}
Write-Output 'connected_web_ui_automation=ok'

$webApiClient = Read-WorkspaceFile 'apps/web/src/state/WebApiClient.ts'
$evidenceMap = Read-WorkspaceFile 'apps/web/src/evidenceMap.ts'
Assert-True ($package.scripts.'test:web-core'.Contains('evidenceMap.test.ts')) 'Web evidence map core test is missing'
Assert-True ($webApiClient.Contains('/fact_block_evidence?select=*')) 'Connected web snapshot must restore FactBlock evidence links'
Assert-True ($evidenceMap.Contains('evidenceIds.includes(evidenceId)')) 'Evidence map must match stored FactBlock links'
Write-Output 'connected_evidence_map=ok'

$verifyLocal = Read-WorkspaceFile 'scripts/verify-local.ps1'
foreach ($marker in @('PUBLISHABLE_KEY', 'ANON_KEY', 'SECRET_KEY', 'SERVICE_ROLE_KEY')) {
  Assert-True ($verifyLocal.Contains($marker)) "Local verification key compatibility is missing: $marker"
}
Write-Output 'local_key_compatibility=ok'

$supabaseHelper = Read-WorkspaceFile 'supabase/functions/_shared/supabase.ts'
Assert-True ($supabaseHelper.Contains('SUPABASE_PUBLISHABLE_KEYS')) 'Hosted publishable key fallback is missing'
Assert-True ($supabaseHelper.Contains('SUPABASE_SECRET_KEYS')) 'Hosted secret key fallback is missing'
Write-Output 'hosted_key_compatibility=ok'

$deployScript = Read-WorkspaceFile 'scripts/deploy-supabase.ps1'
Assert-True ($deployScript.Contains('OPENAI_API_BASE_URL')) 'Hosted deploy script must reject OpenAI endpoint overrides'
Write-Output 'hosted_openai_endpoint_guard=ok'

$trackedFiles = @(& git -C $root ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect tracked git files' }
$privateFiles = @(
  'apps/mobile/.env.local',
  'apps/web/.env.local',
  'supabase/.env.hosted',
  'supabase/functions/.env',
  'supabase/functions/.env.deploy'
)
$trackedPrivateFiles = @($trackedFiles | Where-Object { $privateFiles -contains $_ })
Assert-True ($trackedPrivateFiles.Count -eq 0) "A private env file is tracked by git: $($trackedPrivateFiles -join ', ')"
Write-Output 'private_env_git_boundary=ok'

Write-Output 'deploy_readiness=ok'
