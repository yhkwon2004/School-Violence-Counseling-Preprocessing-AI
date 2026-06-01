param(
  [string]$EnvFile = 'supabase/.env.hosted'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $root.TrimEnd('\') + '\'

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

function Invoke-ApiJson([string]$Method, [string]$Path, [hashtable]$Headers, $Body = $null) {
  $parameters = @{
    Method = $Method
    Uri = "$baseUrl$Path"
    Headers = $Headers
    ContentType = 'application/json'
  }
  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }
  return Invoke-RestMethod @parameters
}

function Get-StatusCode([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, $Body = $null) {
  $parameters = @{ Method = $Method; Uri = $Uri; Headers = $Headers }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }
  try {
    return [int](Invoke-WebRequest @parameters).StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

function Normalize-SignedUrl([string]$Url) {
  if ($Url.StartsWith('/')) { return "$baseUrl$Url" }
  return $Url
}

function Encode-StoragePath([string]$Path) {
  return (($Path -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
}

function Convert-WebContentToText($Content) {
  if ($Content -is [byte[]]) {
    return [System.Text.Encoding]::UTF8.GetString($Content)
  }
  return [string]$Content
}

$envPath = [System.IO.Path]::GetFullPath((Join-Path $root $EnvFile))
if (-not $envPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Hosted env file must stay inside the workspace.'
}
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Create $EnvFile from supabase/.env.hosted.example first."
}
$values = Read-EnvMap $envPath
$configuredUrl = $values['SUPABASE_URL']
$anonKey = $values['SUPABASE_ANON_KEY']
$demoPassword = $values['HOSTED_DEMO_PASSWORD']
Assert-True ([bool]$configuredUrl) 'SUPABASE_URL is missing.'
$baseUrl = $configuredUrl.TrimEnd('/')
Assert-True ($baseUrl -match '^https://[a-z0-9]{20}\.supabase\.co$') 'SUPABASE_URL must be a hosted Supabase project URL.'
Assert-True ($anonKey -and $anonKey -notlike 'replace-with-*') 'SUPABASE_ANON_KEY is missing.'
Assert-True ($demoPassword -and $demoPassword -notlike 'replace-with-*' -and $demoPassword.Length -ge 12) 'HOSTED_DEMO_PASSWORD is missing.'

$publicHeaders = @{ apikey = $anonKey }
$createdCaseId = $null
$deletionScheduled = $false
$studentHeaders = $null
try {
  Assert-True ((Get-StatusCode 'GET' "$baseUrl/auth/v1/health") -eq 200) 'Hosted Auth health check failed.'
  Write-Output 'hosted_health=ok'

  Assert-True ((Get-StatusCode 'GET' "$baseUrl/functions/v1/student-login" $publicHeaders) -eq 405) 'student-login HTTP method guard failed.'
  Assert-True ((Get-StatusCode 'POST' "$baseUrl/functions/v1/retry-failed-jobs" $publicHeaders @{}) -eq 401) 'retry cron secret guard failed.'
  Assert-True ((Get-StatusCode 'POST' "$baseUrl/functions/v1/purge-deleted" $publicHeaders @{}) -eq 401) 'purge cron secret guard failed.'
  Write-Output 'hosted_edge_guard=ok'

  $studentLogin = Invoke-ApiJson 'POST' '/functions/v1/student-login' $publicHeaders @{
    loginId = 'WEE-24-0510'
    password = $demoPassword
  }
  Assert-True ([bool]$studentLogin.session.access_token) 'Hosted student login did not issue a session.'
  $studentHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($studentLogin.session.access_token)" }
  $studentProfiles = @(Invoke-ApiJson 'GET' '/rest/v1/profiles?select=id,institution_id' $studentHeaders)
  Assert-True ($studentProfiles.Count -eq 1) 'Hosted student profile RLS scope is incorrect.'
  Write-Output 'hosted_student_login=ok'

  $staffLogin = Invoke-ApiJson 'POST' '/auth/v1/token?grant_type=password' $publicHeaders @{
    email = 'counselor@wee.demo'
    password = $demoPassword
  }
  Assert-True ([bool]$staffLogin.access_token) 'Hosted counselor login did not issue a session.'
  $staffHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($staffLogin.access_token)" }
  $staffCases = @(Invoke-ApiJson 'GET' '/rest/v1/cases?id=eq.30000000-0000-0000-0000-000000000001&select=id' $staffHeaders)
  Assert-True ($staffCases.Count -eq 1) 'Hosted counselor cannot read the assigned synthetic seed case.'
  Write-Output 'hosted_staff_rls=ok'

  $createdCaseId = [guid]::NewGuid().ToString()
  Invoke-ApiJson 'POST' '/rest/v1/cases' $studentHeaders @{
    id = $createdCaseId
    institution_id = $studentProfiles[0].institution_id
    student_id = $studentProfiles[0].id
    anonymous_label = 'Hosted smoke student'
    memo = 'Hosted smoke test only'
    synthetic = $false
  } | Out-Null

  $discardUpload = Invoke-ApiJson 'POST' '/functions/v1/evidence-upload-url' $studentHeaders @{
    caseId = $createdCaseId
    fileName = 'hosted-discard-smoke.txt'
    mimeType = 'text/plain'
    sizeBytes = 7
    kind = 'document'
  }
  Invoke-WebRequest -Method Put -Uri (Normalize-SignedUrl $discardUpload.signedUrl) -ContentType 'text/plain' -Body ([System.Text.Encoding]::UTF8.GetBytes('PARTIAL')) | Out-Null
  $discardResult = Invoke-ApiJson 'POST' '/functions/v1/discard-evidence-upload' $studentHeaders @{ evidenceId = $discardUpload.asset.id }
  Assert-True ([bool]$discardResult.discarded) 'Hosted partial upload reservation was not discarded.'
  $discardedAssets = @(Invoke-ApiJson 'GET' "/rest/v1/evidence_assets?id=eq.$($discardUpload.asset.id)&select=id" $studentHeaders)
  Assert-True ($discardedAssets.Count -eq 0) 'Hosted discarded upload metadata is still visible.'
  Write-Output 'hosted_discard_partial_upload=ok'

  $smokeText = 'hosted signed storage smoke test'
  $smokeBytes = [System.Text.Encoding]::UTF8.GetBytes($smokeText)
  $upload = Invoke-ApiJson 'POST' '/functions/v1/evidence-upload-url' $studentHeaders @{
    caseId = $createdCaseId
    fileName = 'hosted-smoke.txt'
    mimeType = 'text/plain'
    sizeBytes = $smokeBytes.Length
    kind = 'document'
  }
  $uploadUrl = Normalize-SignedUrl $upload.signedUrl
  Invoke-WebRequest -Method Put -Uri $uploadUrl -ContentType 'text/plain' -Body $smokeBytes | Out-Null

  $encodedStoragePath = Encode-StoragePath $upload.asset.storage_path
  $directStatus = Get-StatusCode 'GET' "$baseUrl/storage/v1/object/case-evidence/$encodedStoragePath"
  Assert-True ($directStatus -in @(400, 401, 403, 404)) "Private Storage direct URL returned unexpected status $directStatus."
  $download = Invoke-ApiJson 'POST' '/functions/v1/evidence-download-url' $studentHeaders @{ evidenceId = $upload.asset.id }
  $downloaded = Invoke-WebRequest -Method Get -Uri (Normalize-SignedUrl $download.signedUrl)
  Assert-True ((Convert-WebContentToText $downloaded.Content).Trim() -eq $smokeText) 'Signed Storage download did not return the uploaded smoke payload.'
  Write-Output 'hosted_private_storage=ok'

  $processing = Invoke-ApiJson 'POST' '/functions/v1/process-evidence' $studentHeaders @{ evidenceId = $upload.asset.id }
  $duplicateProcessing = Invoke-ApiJson 'POST' '/functions/v1/process-evidence' $studentHeaders @{ evidenceId = $upload.asset.id }
  Assert-True ($duplicateProcessing.job.id -eq $processing.job.id) 'Hosted duplicate evidence processing created another job.'
  Write-Output 'hosted_processing_reservation=ok'
  $processingStatus = 'queued'
  for ($attempt = 0; $attempt -lt 10 -and $processingStatus -in @('queued', 'processing'); $attempt++) {
    Start-Sleep -Seconds 1
    $assets = @(Invoke-ApiJson 'GET' "/rest/v1/evidence_assets?id=eq.$($upload.asset.id)&select=processing_status" $studentHeaders)
    $processingStatus = $assets[0].processing_status
  }
  Assert-True ($processingStatus -eq 'manual_review') "Hosted document processing should finish as manual_review, got '$processingStatus'."
  Write-Output 'hosted_processing=ok'

  Invoke-ApiJson 'POST' '/rest/v1/rpc/schedule_case_deletion' $studentHeaders @{ case_id_input = $createdCaseId } | Out-Null
  $deletionScheduled = $true
  $hiddenCases = @(Invoke-ApiJson 'GET' "/rest/v1/cases?id=eq.$createdCaseId&select=id" $studentHeaders)
  Assert-True ($hiddenCases.Count -eq 0) 'Scheduled deletion case is still visible in hosted RLS.'
  Write-Output 'hosted_deletion_schedule=ok'
} finally {
  if ($createdCaseId -and -not $deletionScheduled -and $studentHeaders) {
    try {
      Invoke-ApiJson 'POST' '/rest/v1/rpc/schedule_case_deletion' $studentHeaders @{ case_id_input = $createdCaseId } | Out-Null
    } catch {
      Write-Warning "Unable to schedule cleanup for hosted smoke case $createdCaseId"
    }
  }
}

Write-Output 'hosted_verification=ok'
