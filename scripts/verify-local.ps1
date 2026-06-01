$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
  if ($Actual -ne $Expected) {
    throw "$Label expected '$Expected' but got '$Actual'"
  }
}

function Assert-Match([string]$Actual, [string]$Pattern, [string]$Label) {
  if ($Actual -notmatch $Pattern) {
    throw "$Label did not match '$Pattern': '$Actual'"
  }
}

function Invoke-Psql([string]$Sql) {
  $result = & docker exec supabase_db_ieumlog-school-safety psql -v ON_ERROR_STOP=1 -U postgres -d postgres -tAc $Sql
  if ($LASTEXITCODE -ne 0) {
    throw 'psql command failed'
  }
  return ($result | Out-String).Trim()
}

function Reset-Database {
  & npx.cmd supabase db reset
  if ($LASTEXITCODE -ne 0) {
    throw 'supabase db reset failed'
  }
}

function Get-StatusValue([string[]]$Names) {
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
  throw "$($Names -join ' or ') was not found"
}

function Get-AnonKey {
  return Get-StatusValue -Names @('PUBLISHABLE_KEY', 'ANON_KEY')
}

function Get-ServiceRoleKey {
  return Get-StatusValue -Names @('SECRET_KEY', 'SERVICE_ROLE_KEY')
}

function Normalize-LocalUrl([string]$Url) {
  $normalized = $Url -replace '^http://kong:8000', 'http://127.0.0.1:54321'
  if ($normalized.StartsWith('/')) {
    return "http://127.0.0.1:54321$normalized"
  }
  return $normalized
}

function Apply-SyntheticSeed([string]$Seed) {
  $seedTempPath = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($seedTempPath, "do `$ieumlog`$`nbegin`n$Seed`nend`n`$ieumlog`$;", [System.Text.UTF8Encoding]::new($false))
    & npx.cmd supabase db query --local --file $seedTempPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'synthetic seed application failed'
    }
  } finally {
    Remove-Item -LiteralPath $seedTempPath -Force -ErrorAction SilentlyContinue
  }
}

Reset-Database

try {
  $anonKey = Get-AnonKey
  $purgeCronSecret = 'local-purge-verification-secret'
  $retryCronSecret = 'local-retry-verification-secret'
  $seedGraph = Invoke-Psql "select (select count(*) from public.people) || '|' || (select count(*) from public.relations) || '|' || (select count(*) from public.fact_block_evidence);"
  Assert-Equal $seedGraph '5|4|3' 'synthetic seed graph'
  Write-Output 'synthetic_seed_graph=ok'
  $seed = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot '../supabase/seed.sql')
  Apply-SyntheticSeed $seed
  $seedIdempotency = Invoke-Psql "select (select count(*) from public.missing_questions where id = '90000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.audit_logs where id = 'a0000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.people) || '|' || (select count(*) from public.relations) || '|' || (select count(*) from public.fact_block_evidence);"
  Assert-Equal $seedIdempotency '1|1|5|4|3' 'synthetic seed idempotency'
  Write-Output 'synthetic_seed_idempotency=ok'
  $rotatedSeed = $seed.Replace("crypt('demo1234', gen_salt('bf'))", "crypt('hosted-demo-rotation-check', gen_salt('bf'))")
  if ($rotatedSeed -eq $seed) {
    throw 'synthetic seed password rotation fixture was not applied'
  }
  Apply-SyntheticSeed $rotatedSeed
  $rotatedPasswords = Invoke-Psql "select count(*) from auth.users where id::text like '10000000-0000-0000-0000-00000000000%' and encrypted_password = crypt('hosted-demo-rotation-check', encrypted_password);"
  Assert-Equal $rotatedPasswords '4' 'synthetic seed password rotation'
  Apply-SyntheticSeed $seed
  $restoredPasswords = Invoke-Psql "select count(*) from auth.users where id::text like '10000000-0000-0000-0000-00000000000%' and encrypted_password = crypt('demo1234', encrypted_password);"
  Assert-Equal $restoredPasswords '4' 'synthetic seed password restoration'
  Write-Output 'synthetic_seed_password_rotation=ok'

  $loginBody = @{ loginId = 'WEE-24-0510'; password = 'demo1234' } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/student-login' -ContentType 'application/json' -Body $loginBody
  if (-not $login.session.access_token) {
    throw 'student session was not issued'
  }
  $studentApiHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($login.session.access_token)" }
  $studentVisibleProfiles = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:54321/rest/v1/profiles?select=id' -Headers $studentApiHeaders
  if (@($studentVisibleProfiles).Count -ne 1 -or $studentVisibleProfiles[0].id -ne '10000000-0000-0000-0000-000000000004') {
    throw 'student profile RLS exposed institution members'
  }
  Write-Output 'student_login=ok'

  $methodGuardChecks = @(
    @{ Name = 'student-login'; Method = 'Get' },
    @{ Name = 'process-case'; Method = 'Get' },
    @{ Name = 'process-evidence'; Method = 'Get' },
    @{ Name = 'evidence-upload-url'; Method = 'Get' },
    @{ Name = 'discard-evidence-upload'; Method = 'Get' },
    @{ Name = 'evidence-download-url'; Method = 'Get' },
    @{ Name = 'staff-case-action'; Method = 'Get' },
    @{ Name = 'submit-case'; Method = 'Get' },
    @{ Name = 'retry-failed-jobs'; Method = 'Get' },
    @{ Name = 'purge-deleted'; Method = 'Get' },
    @{ Name = 'admin-users'; Method = 'Put' },
    @{ Name = 'admin-institutions'; Method = 'Put' }
  )
  foreach ($check in $methodGuardChecks) {
    $method = $check.Method.ToUpperInvariant()
    $statusCode = & curl.exe --silent --output NUL --write-out '%{http_code}' --request $method "http://127.0.0.1:54321/functions/v1/$($check.Name)" --header 'Content-Type: application/json' --header "apikey: $anonKey" --header "Authorization: Bearer $($login.session.access_token)" --data '{}'
    if ($LASTEXITCODE -ne 0 -or $statusCode -ne '405') {
      throw "$($check.Name) accepted unsupported HTTP method $method with status $statusCode"
    }
  }
  Write-Output 'http_method_guard=ok'

  $env:VERIFY_SUPABASE_URL = 'http://127.0.0.1:54321'
  $env:VERIFY_SUPABASE_ANON_KEY = $anonKey
  $env:VERIFY_SUPABASE_SERVICE_ROLE_KEY = Get-ServiceRoleKey
  try {
    & node scripts/verify-realtime.mjs
    if ($LASTEXITCODE -ne 0) {
      throw 'realtime verification failed'
    }
  } finally {
    Remove-Item Env:VERIFY_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VERIFY_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:VERIFY_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  }

  $retryBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/retry-failed-jobs' -ContentType 'application/json' -Body '{}' | Out-Null
  } catch {
    $retryBlocked = [int]$_.Exception.Response.StatusCode -eq 401
  }
  if (-not $retryBlocked) {
    throw 'retry endpoint accepted a request without its cron secret'
  }
  Write-Output 'retry_secret_guard=ok'

  $purgeBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/purge-deleted' -ContentType 'application/json' -Body '{}' | Out-Null
  } catch {
    $purgeBlocked = [int]$_.Exception.Response.StatusCode -eq 401
  }
  if (-not $purgeBlocked) {
    throw 'purge endpoint accepted a request without its cron secret'
  }
  Write-Output 'purge_secret_guard=ok'

  $rlsSql = @'
begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000099');
insert into public.institutions(id, name, region) values ('20000000-0000-0000-0000-000000000099', 'RLS verification institution', 'Seoul');
insert into public.profiles(id, institution_id, role, display_name, auth_email) values ('10000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000099', 'counselor', 'RLS verification counselor', 'other@wee.demo');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000099', true);
select 'isolated_case_count=' || count(*) from public.cases;
rollback;
'@
  Assert-Match (Invoke-Psql $rlsSql) 'isolated_case_count=0' 'institution RLS'
  Write-Output 'institution_rls=ok'

  $claimSql = @'
begin;
insert into public.cases(id, institution_id, student_id, anonymous_label, status, synthetic)
values ('30000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'claim verification case', 'submitted', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select public.claim_case('30000000-0000-0000-0000-000000000099');
do $$
begin
  perform public.claim_case('30000000-0000-0000-0000-000000000099');
  raise exception 'Expected claim collision';
exception
  when others then
    if sqlerrm <> 'Case was already claimed' then
      raise;
    end if;
end;
$$;
select 'claim_collision=blocked';
rollback;
'@
  Assert-Match (Invoke-Psql $claimSql) 'claim_collision=blocked' 'claim collision'
  Write-Output 'claim_collision=ok'

  $evidenceLimitSql = @'
begin;
insert into public.cases(id, institution_id, student_id, anonymous_label, status, synthetic)
values ('30000000-0000-0000-0000-000000000095', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'evidence limit verification', 'submitted', true);
insert into public.evidence_assets(case_id, file_name, mime_type, size_bytes, kind, storage_path, synthetic)
select '30000000-0000-0000-0000-000000000095', 'limit-' || item || '.png', 'image/png', 1, 'image', 'limit/' || item || '.png', true
from generate_series(1, 50) item;
do $$
begin
  insert into public.evidence_assets(case_id, file_name, mime_type, size_bytes, kind, storage_path, synthetic)
  values ('30000000-0000-0000-0000-000000000095', 'limit-51.png', 'image/png', 1, 'image', 'limit/51.png', true);
  raise exception 'Expected evidence count rejection';
exception
  when others then
    if sqlerrm <> 'Case file count exceeds the institution limit' then
      raise;
    end if;
end;
$$;
select 'evidence_limit=blocked';
rollback;
'@
  Assert-Match (Invoke-Psql $evidenceLimitSql) 'evidence_limit=blocked' 'database evidence limit'
  Write-Output 'evidence_limit=ok'

  $memoLimitSql = @'
begin;
do $$
begin
  insert into public.cases(id, institution_id, student_id, anonymous_label, memo, status, synthetic)
  values ('30000000-0000-0000-0000-000000000096', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'memo limit verification', repeat('x', 1001), 'draft', true);
  raise exception 'Expected memo length rejection';
exception
  when check_violation then null;
end;
$$;
select 'memo_limit=blocked';
rollback;
'@
  Assert-Match (Invoke-Psql $memoLimitSql) 'memo_limit=blocked' 'database memo limit'
  Write-Output 'memo_limit=ok'

  $staffLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = 'counselor@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  if (-not $staffLogin.access_token) {
    throw 'staff session was not issued'
  }
  $staffRefresh = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=refresh_token' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ refresh_token = $staffLogin.refresh_token } | ConvertTo-Json)
  if (-not $staffRefresh.access_token) {
    throw 'staff session was not refreshed'
  }
  $staffLogin = $staffRefresh
  Write-Output 'staff_refresh=ok'
  $staffHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($staffLogin.access_token)" }
  foreach ($mutation in @(
    @{ Path = 'fact_blocks?id=eq.50000000-0000-0000-0000-000000000001'; Body = @{ action = 'tampered fact' } },
    @{ Path = 'people?id=eq.70000000-0000-0000-0000-000000000002'; Body = @{ relation = 'tampered person' } },
    @{ Path = 'relations?id=eq.80000000-0000-0000-0000-000000000001'; Body = @{ label = 'tampered relation' } },
    @{ Path = 'evidence_assets?id=eq.60000000-0000-0000-0000-000000000001'; Body = @{ file_name = 'tampered.png' } },
    @{ Path = 'missing_questions?fact_block_id=eq.50000000-0000-0000-0000-000000000003'; Body = @{ prompt = 'tampered question' } }
  )) {
    try {
      Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:54321/rest/v1/$($mutation.Path)" -Headers $staffHeaders -ContentType 'application/json' -Body ($mutation.Body | ConvertTo-Json) | Out-Null
    } catch {
    }
  }
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/fact_block_evidence' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ fact_block_id = '50000000-0000-0000-0000-000000000001'; evidence_id = '60000000-0000-0000-0000-000000000002' } | ConvertTo-Json) | Out-Null
  } catch {
  }
  $staffDirectMutationState = Invoke-Psql "select (select action <> 'tampered fact' from public.fact_blocks where id = '50000000-0000-0000-0000-000000000001') || '|' || (select relation <> 'tampered person' from public.people where id = '70000000-0000-0000-0000-000000000002') || '|' || (select label <> 'tampered relation' from public.relations where id = '80000000-0000-0000-0000-000000000001') || '|' || (select file_name <> 'tampered.png' from public.evidence_assets where id = '60000000-0000-0000-0000-000000000001') || '|' || (select prompt <> 'tampered question' from public.missing_questions where fact_block_id = '50000000-0000-0000-0000-000000000003') || '|' || (select count(*) from public.fact_block_evidence where fact_block_id = '50000000-0000-0000-0000-000000000001' and evidence_id = '60000000-0000-0000-0000-000000000002');"
  Assert-Equal $staffDirectMutationState 'true|true|true|true|true|0' 'staff direct structured data mutation'
  Write-Output 'staff_structured_data_guard=ok'
  Invoke-Psql "insert into public.cases(id, institution_id, student_id, anonymous_label, status, synthetic) values ('30000000-0000-0000-0000-000000000094', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'staff review verification', 'assigned', true); insert into public.assignments(case_id, counselor_id, assigned_by) values ('30000000-0000-0000-0000-000000000094', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002'); insert into public.cases(id, institution_id, student_id, anonymous_label, status, synthetic) values ('30000000-0000-0000-0000-000000000093', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'unassigned staff verification', 'assigned', true);" | Out-Null
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000094'; action = 'review' } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000094'; action = 'complete' } | ConvertTo-Json) | Out-Null
  $unassignedStaffActionBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000093'; action = 'reopen' } | ConvertTo-Json) | Out-Null
  } catch {
    $unassignedStaffActionBlocked = [int]$_.Exception.Response.StatusCode -eq 403
  }
  if (-not $unassignedStaffActionBlocked) {
    throw 'unassigned counselor changed a case'
  }
  $directAssignmentBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/assignments' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ case_id = '30000000-0000-0000-0000-000000000093'; counselor_id = '10000000-0000-0000-0000-000000000003'; assigned_by = '10000000-0000-0000-0000-000000000003' } | ConvertTo-Json) | Out-Null
  } catch {
    $directAssignmentBlocked = [int]$_.Exception.Response.StatusCode -eq 403
  }
  if (-not $directAssignmentBlocked) {
    throw 'counselor bypassed claim RPC with a direct assignment insert'
  }
  Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:54321/rest/v1/cases?id=eq.30000000-0000-0000-0000-000000000093' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ status = 'completed' } | ConvertTo-Json) | Out-Null
  $directCasePatchState = Invoke-Psql "select status from public.cases where id = '30000000-0000-0000-0000-000000000093';"
  Assert-Equal $directCasePatchState 'assigned' 'staff direct case patch'
  $staffReviewState = Invoke-Psql "select status || '|' || (select count(*) from public.audit_logs where target_id = cases.id::text and action = 'case.review_started') || '|' || (select count(*) from public.audit_logs where target_id = cases.id::text and action = 'case.completed') from public.cases where id = '30000000-0000-0000-0000-000000000094';"
  Assert-Equal $staffReviewState 'completed|1|1' 'staff review state flow'
  $staffCases = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:54321/rest/v1/cases?select=id,status' -Headers $staffHeaders
  if (-not ($staffCases | Where-Object { $_.id -eq '30000000-0000-0000-0000-000000000001' })) {
    throw 'staff RLS case query did not return the assigned seed case'
  }
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/counselor_notes' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ case_id = '30000000-0000-0000-0000-000000000001'; author_id = '10000000-0000-0000-0000-000000000003'; body = 'Connected web note verification' } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000001'; action = 'reopen' } | ConvertTo-Json) | Out-Null
  $staffState = Invoke-Psql "select status || '|' || (select count(*) from public.counselor_notes where case_id = cases.id and body = 'Connected web note verification') || '|' || (select count(*) from public.audit_logs where target_id = cases.id::text and action = 'note.created') || '|' || (select count(*) from public.audit_logs where target_id = cases.id::text and action = 'case.reopened') from public.cases where id = '30000000-0000-0000-0000-000000000001';"
  Assert-Equal $staffState 'reopened|1|1|1' 'connected staff web flow'
  $staffProcessCaseBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-case' -Headers $staffHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000001' } | ConvertTo-Json) | Out-Null
  } catch {
    $staffProcessCaseBlocked = [int]$_.Exception.Response.StatusCode -eq 403
  }
  if (-not $staffProcessCaseBlocked) {
    throw 'counselor reprocessed a student case'
  }
  Write-Output 'staff_process_case_guard=ok'
  Write-Output 'staff_web_flow=ok'

  $platformLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = 'platform@ieumlog.demo'; password = 'demo1234' } | ConvertTo-Json)
  $platformHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($platformLogin.access_token)" }
  $institution = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-institutions' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ name = 'Verification Institution'; region = 'Seoul' } | ConvertTo-Json)
  Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:54321/functions/v1/admin-institutions' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ id = $institution.institution.id; name = 'Updated Verification Institution'; region = 'Busan' } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ institutionId = $institution.institution.id; role = 'institution_admin'; displayName = 'Verification Admin'; email = 'verification-admin@wee.demo'; password = 'demo1234' } | ConvertTo-Json) | Out-Null
  $otherInstitutionCounselor = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ institutionId = $institution.institution.id; role = 'counselor'; displayName = 'Other Institution Counselor'; email = 'other-institution-counselor@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ institutionId = $institution.institution.id; role = 'student'; displayName = 'Archived Institution Student'; loginId = 'ARCHIVED-STUDENT'; password = 'demo1234' } | ConvertTo-Json) | Out-Null
  $archivedAdminLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = 'verification-admin@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  $archivedAdminHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($archivedAdminLogin.access_token)" }
  Invoke-RestMethod -Method Delete -Uri 'http://127.0.0.1:54321/functions/v1/admin-institutions' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ id = $institution.institution.id } | ConvertTo-Json) | Out-Null
  $archivedAdminBlocked = $false
  try {
    Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $archivedAdminHeaders | Out-Null
  } catch {
    $archivedAdminBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $archivedAdminBlocked) {
    throw 'archived institution admin retained Edge Function access'
  }
  $archivedStudentLoginBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/student-login' -ContentType 'application/json' -Body (@{ loginId = 'ARCHIVED-STUDENT'; password = 'demo1234' } | ConvertTo-Json) | Out-Null
  } catch {
    $archivedStudentLoginBlocked = [int]$_.Exception.Response.StatusCode -eq 401
  }
  if (-not $archivedStudentLoginBlocked) {
    throw 'archived institution student could still log in'
  }
  $archivedInstitutionUserCreationBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $platformHeaders -ContentType 'application/json' -Body (@{ institutionId = $institution.institution.id; role = 'student'; displayName = 'Blocked Archived Student'; loginId = 'BLOCKED-ARCHIVED'; password = 'demo1234' } | ConvertTo-Json) | Out-Null
  } catch {
    $archivedInstitutionUserCreationBlocked = [int]$_.Exception.Response.StatusCode -eq 409
  }
  if (-not $archivedInstitutionUserCreationBlocked) {
    throw 'archived institution accepted a new user'
  }
  Write-Output 'archived_institution_guard=ok'

  $adminLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = 'admin@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  $adminHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($adminLogin.access_token)" }
  $verificationStudent = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ role = 'student'; displayName = 'Verification Student'; loginId = 'VERIFY-STUDENT'; password = 'demo1234' } | ConvertTo-Json)
  Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ id = $verificationStudent.profile.id; active = $false } | ConvertTo-Json) | Out-Null
  $inactiveStudentLoginBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/student-login' -ContentType 'application/json' -Body (@{ loginId = 'VERIFY-STUDENT'; password = 'demo1234' } | ConvertTo-Json) | Out-Null
  } catch {
    $inactiveStudentLoginBlocked = [int]$_.Exception.Response.StatusCode -eq 401
  }
  if (-not $inactiveStudentLoginBlocked) {
    throw 'inactive student account could still log in'
  }
  Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$($verificationStudent.profile.id)" -Headers $adminHeaders -ContentType 'application/json' -Body (@{ role = 'platform_admin' } | ConvertTo-Json) | Out-Null
  $directProfilePatchState = Invoke-Psql "select role from public.profiles where id = '$($verificationStudent.profile.id)';"
  Assert-Equal $directProfilePatchState 'student' 'admin direct profile privilege escalation'
  $verificationCounselor = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ role = 'counselor'; displayName = 'Verification Counselor'; email = 'verification-counselor@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  $crossInstitutionAssignmentBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/assign_case' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ case_id_input = '30000000-0000-0000-0000-000000000001'; counselor_id_input = $otherInstitutionCounselor.profile.id } | ConvertTo-Json) | Out-Null
  } catch {
    $crossInstitutionAssignmentBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $crossInstitutionAssignmentBlocked) {
    throw 'cross-institution case assignment was not blocked'
  }
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/assign_case' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ case_id_input = '30000000-0000-0000-0000-000000000001'; counselor_id_input = $verificationCounselor.profile.id } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:54321/rest/v1/institution_settings?institution_id=eq.20000000-0000-0000-0000-000000000001' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ retention_days = 45 } | ConvertTo-Json) | Out-Null
  $adminState = Invoke-Psql "select (select active || '|' || name || '|' || region from public.institutions where id = '$($institution.institution.id)') || '|' || (select count(*) from public.audit_logs where target_id = '$($institution.institution.id)' and action in ('institution.created', 'institution.updated', 'institution.archived')) || '|' || (select count(*) from public.profiles where role = 'institution_admin' and auth_email = 'verification-admin@wee.demo') || '|' || (select count(*) from public.profiles where role = 'student' and student_login_id = 'VERIFY-STUDENT' and active = false) || '|' || (select count(*) from public.audit_logs where target_id = '$($verificationStudent.profile.id)' and action = 'profile.active_updated') || '|' || (select retention_days from public.institution_settings where institution_id = '20000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.assignments where case_id = '30000000-0000-0000-0000-000000000001' and active = true and counselor_id = '$($verificationCounselor.profile.id)') || '|' || (select count(*) from public.assignments where case_id = '30000000-0000-0000-0000-000000000001' and active = false and released_at is not null) || '|' || (select count(*) from public.audit_logs where target_id = '30000000-0000-0000-0000-000000000001' and action = 'case.assigned');"
  Assert-Equal $adminState 'false|Updated Verification Institution|Busan|3|1|1|1|45|1|1|1' 'connected admin web flow'
  $verificationCounselorLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = 'verification-counselor@wee.demo'; password = 'demo1234' } | ConvertTo-Json)
  $verificationCounselorHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($verificationCounselorLogin.access_token)" }
  Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:54321/functions/v1/admin-users' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ id = $verificationCounselor.profile.id; active = $false } | ConvertTo-Json) | Out-Null
  $inactiveCounselorCases = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:54321/rest/v1/cases?select=id' -Headers $verificationCounselorHeaders
  if (@($inactiveCounselorCases).Count -ne 0) {
    throw 'inactive counselor retained RLS case access'
  }
  $inactiveCounselorEdgeBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $verificationCounselorHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000001'; action = 'reopen' } | ConvertTo-Json) | Out-Null
  } catch {
    $inactiveCounselorEdgeBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $inactiveCounselorEdgeBlocked) {
    throw 'inactive counselor retained Edge Function access'
  }
  Write-Output 'inactive_staff_guard=ok'
  Write-Output 'admin_web_flow=ok'

  $apiHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($login.session.access_token)" }
  $casesUrl = 'http://127.0.0.1:54321/rest/v1/cases'
  $syntheticInsertBlocked = $false
  $syntheticCase = @{
    id = '30000000-0000-0000-0000-000000000098'
    institution_id = '20000000-0000-0000-0000-000000000001'
    student_id = '10000000-0000-0000-0000-000000000004'
    anonymous_label = 'synthetic bypass verification'
    synthetic = $true
  } | ConvertTo-Json
  try {
    Invoke-RestMethod -Method Post -Uri $casesUrl -Headers $apiHeaders -ContentType 'application/json' -Body $syntheticCase | Out-Null
  } catch {
    $syntheticInsertBlocked = [int]$_.Exception.Response.StatusCode -eq 403
  }
  if (-not $syntheticInsertBlocked) {
    throw 'student-created synthetic case was not blocked'
  }

  $studentCaseId = '30000000-0000-0000-0000-000000000097'
  $studentCase = @{
    id = $studentCaseId
    institution_id = '20000000-0000-0000-0000-000000000001'
    student_id = '10000000-0000-0000-0000-000000000004'
    anonymous_label = 'student lock verification'
    memo = 'original memo'
    synthetic = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $casesUrl -Headers $apiHeaders -ContentType 'application/json' -Body $studentCase | Out-Null

  $syntheticPatchBlocked = $false
  try {
    Invoke-RestMethod -Method Patch -Uri "${casesUrl}?id=eq.$studentCaseId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ synthetic = $true } | ConvertTo-Json) | Out-Null
  } catch {
    $syntheticPatchBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $syntheticPatchBlocked) {
    throw 'student synthetic update was not blocked'
  }
  $purgeLeasePatchBlocked = $false
  try {
    Invoke-RestMethod -Method Patch -Uri "${casesUrl}?id=eq.$studentCaseId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ purge_started_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json) | Out-Null
  } catch {
    $purgeLeasePatchBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $purgeLeasePatchBlocked) {
    throw 'student purge lease update was not blocked'
  }

  foreach ($nextStatus in @('analyzing', 'student_review', 'submitted')) {
    Invoke-RestMethod -Method Patch -Uri "${casesUrl}?id=eq.$studentCaseId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ status = $nextStatus } | ConvertTo-Json) | Out-Null
  }
  Invoke-RestMethod -Method Patch -Uri "${casesUrl}?id=eq.$studentCaseId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ memo = 'tampered memo' } | ConvertTo-Json) | Out-Null
  $lockedState = Invoke-Psql "select status || '|' || (memo = 'original memo') || '|' || synthetic from public.cases where id = '$studentCaseId';"
  Assert-Equal $lockedState 'submitted|true|false' 'student case lock'
  $lockedUploadBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $apiHeaders -ContentType 'application/json' -Body (@{ caseId = $studentCaseId; fileName = 'locked.png'; mimeType = 'image/png'; sizeBytes = 1; kind = 'image' } | ConvertTo-Json) | Out-Null
  } catch {
    $lockedUploadBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $lockedUploadBlocked) {
    throw 'submitted student case accepted an evidence upload URL request'
  }
  Write-Output 'student_case_lock=ok'

  $authHeaders = @{ Authorization = "Bearer $($login.session.access_token)" }
  $processCaseId = '30000000-0000-0000-0000-000000000096'
  $processCase = @{
    id = $processCaseId
    institution_id = '20000000-0000-0000-0000-000000000001'
    student_id = '10000000-0000-0000-0000-000000000004'
    anonymous_label = 'process case verification'
    memo = 'Verification sentence for fact extraction. Another event happened online.'
    synthetic = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $casesUrl -Headers $apiHeaders -ContentType 'application/json' -Body $processCase | Out-Null
  foreach ($invalidUpload in @(
    @{ caseId = $processCaseId; fileName = 'too-large.png'; mimeType = 'image/png'; sizeBytes = 50000001; kind = 'image' },
    @{ caseId = $processCaseId; fileName = 'kind-mismatch.mp4'; mimeType = 'video/mp4'; sizeBytes = 1; kind = 'image' }
  )) {
    $invalidUploadBlocked = $false
    try {
      Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body ($invalidUpload | ConvertTo-Json) | Out-Null
    } catch {
      $invalidUploadBlocked = [int]$_.Exception.Response.StatusCode -eq 400
    }
    if (-not $invalidUploadBlocked) {
      throw 'invalid evidence upload URL request was accepted'
    }
  }
  Write-Output 'upload_policy=ok'

  $discardUpload = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; fileName = 'discard-partial.png'; mimeType = 'image/png'; sizeBytes = 7; kind = 'image' } | ConvertTo-Json)
  foreach ($serviceRoleRpc in @(
    @{ Name = 'reserve_evidence_processing'; Body = @{ evidence_id_input = $discardUpload.asset.id } },
    @{ Name = 'reserve_retryable_evidence_jobs'; Body = @{ limit_input = 20 } },
    @{ Name = 'begin_evidence_upload_discard'; Body = @{ evidence_id_input = $discardUpload.asset.id; student_id_input = '10000000-0000-0000-0000-000000000004' } },
    @{ Name = 'cancel_evidence_upload_discard'; Body = @{ evidence_id_input = $discardUpload.asset.id; student_id_input = '10000000-0000-0000-0000-000000000004' } },
    @{ Name = 'finalize_evidence_upload_discard'; Body = @{ evidence_id_input = $discardUpload.asset.id; student_id_input = '10000000-0000-0000-0000-000000000004' } },
    @{ Name = 'cases_ready_for_purge'; Body = @{ limit_input = 20 } },
    @{ Name = 'release_case_purge_claim'; Body = @{ case_id_input = $processCaseId } },
    @{ Name = 'finalize_case_purge'; Body = @{ case_id_input = $processCaseId; purge_reason_input = 'deletion_request' } }
  )) {
    $serviceRoleRpcBlocked = $false
    try {
      Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/rest/v1/rpc/$($serviceRoleRpc.Name)" -Headers $apiHeaders -ContentType 'application/json' -Body ($serviceRoleRpc.Body | ConvertTo-Json) | Out-Null
    } catch {
      $serviceRoleRpcBlocked = [int]$_.Exception.Response.StatusCode -in @(401, 403, 404)
    }
    if (-not $serviceRoleRpcBlocked) {
      throw "student directly invoked service-role RPC $($serviceRoleRpc.Name)"
    }
  }
  Write-Output 'service_role_rpc_guard=ok'
  $discardSignedUpload = Normalize-LocalUrl $discardUpload.signedUrl
  $discardUploadStatus = & curl.exe -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: image/png' --data-binary 'PARTIAL' $discardSignedUpload
  Assert-Equal $discardUploadStatus '200' 'discard verification signed upload'
  $discardResult = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/discard-evidence-upload' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $discardUpload.asset.id } | ConvertTo-Json)
  Assert-Equal ([string]$discardResult.discarded) 'True' 'discard upload response'
  $discardState = Invoke-Psql "select (select count(*) from public.evidence_assets where id = '$($discardUpload.asset.id)') || '|' || (select count(*) from storage.objects where name = '$($discardUpload.asset.storage_path)') || '|' || (select count(*) from public.processing_jobs where evidence_id = '$($discardUpload.asset.id)') || '|' || (select count(*) from public.audit_logs where action = 'evidence.upload_discarded' and target_type = 'evidence' and target_id = '$($discardUpload.asset.id)');"
  Assert-Equal $discardState '0|0|0|1' 'discard partial evidence upload'
  Write-Output 'discard_partial_upload=ok'

  $realEvidenceUpload = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; fileName = 'real-student.png'; mimeType = 'image/png'; sizeBytes = 7; kind = 'image' } | ConvertTo-Json)
  $realEvidenceSignedUpload = Normalize-LocalUrl $realEvidenceUpload.signedUrl
  $realEvidenceUploadStatus = & curl.exe -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: image/png' --data-binary 'REALPNG' $realEvidenceSignedUpload
  Assert-Equal $realEvidenceUploadStatus '200' 'real student signed upload'
  $realEvidenceProcess = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-evidence' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $realEvidenceUpload.asset.id } | ConvertTo-Json)
  $duplicateEvidenceProcess = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-evidence' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $realEvidenceUpload.asset.id } | ConvertTo-Json)
  Assert-Equal $duplicateEvidenceProcess.job.id $realEvidenceProcess.job.id 'duplicate evidence processing reservation'
  $processingReservationCount = Invoke-Psql "select count(*) from public.processing_jobs where evidence_id = '$($realEvidenceUpload.asset.id)';"
  Assert-Equal $processingReservationCount '1' 'single evidence processing reservation'
  $processingDiscardBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/discard-evidence-upload' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $realEvidenceUpload.asset.id } | ConvertTo-Json) | Out-Null
  } catch {
    $processingDiscardBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $processingDiscardBlocked) {
    throw 'processing reservation was discarded'
  }
  Write-Output 'evidence_processing_reservation=ok'
  $realEvidenceDeadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $realEvidenceState = Invoke-Psql "select processing_jobs.status || '|' || evidence_assets.processing_status from public.processing_jobs join public.evidence_assets on evidence_assets.id = processing_jobs.evidence_id where processing_jobs.id = '$($realEvidenceProcess.job.id)';"
  } while ($realEvidenceState -notmatch '^manual_review\|' -and (Get-Date) -lt $realEvidenceDeadline)
  Assert-Equal $realEvidenceState 'manual_review|manual_review' 'real student external AI guard'
  Write-Output 'real_student_ai_guard=ok'

  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-case' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId } | ConvertTo-Json) | Out-Null
  $processCaseState = Invoke-Psql "select status || '|' || (select count(*) from public.fact_blocks where case_id = cases.id) || '|' || (select count(*) from public.missing_questions where case_id = cases.id) from public.cases where id = '$processCaseId';"
  Assert-Match $processCaseState '^student_review\|[1-9][0-9]*\|[1-9][0-9]*$' 'process case'
  $pendingSubmitUpload = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; fileName = 'pending-submit.png'; mimeType = 'image/png'; sizeBytes = 7; kind = 'image' } | ConvertTo-Json)
  $pendingEvidenceSubmitBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/submit-case' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; memo = 'Verification sentence for fact extraction. Another event happened online.' } | ConvertTo-Json) | Out-Null
  } catch {
    $pendingEvidenceSubmitBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $pendingEvidenceSubmitBlocked) {
    throw 'student submitted a case while evidence processing was pending'
  }
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/discard-evidence-upload' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $pendingSubmitUpload.asset.id } | ConvertTo-Json) | Out-Null
  Write-Output 'pending_evidence_submit_guard=ok'
  $processFactId = Invoke-Psql "select id from public.fact_blocks where case_id = '$processCaseId' order by sequence limit 1;"
  $processQuestionId = Invoke-Psql "select id from public.missing_questions where case_id = '$processCaseId' order by created_at limit 1;"
  Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:54321/rest/v1/missing_questions?id=eq.$processQuestionId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ answer = 'student verification answer'; resolved = $true } | ConvertTo-Json) | Out-Null
  $questionAnswerState = Invoke-Psql "select resolved || '|' || answer from public.missing_questions where id = '$processQuestionId';"
  Assert-Equal $questionAnswerState 'true|student verification answer' 'student question answer'
  Write-Output 'student_question_answer=ok'
  $directFactEvidenceBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/fact_block_evidence' -Headers $apiHeaders -ContentType 'application/json' -Body (@{ fact_block_id = $processFactId; evidence_id = $realEvidenceUpload.asset.id } | ConvertTo-Json) | Out-Null
  } catch {
    $directFactEvidenceBlocked = [int]$_.Exception.Response.StatusCode -eq 403
  }
  if (-not $directFactEvidenceBlocked) {
    throw 'student directly edited FactBlock evidence links'
  }
  $updatedMemo = 'Verification sentence for fact extraction. Another event happened online. A changed memo requires fresh analysis.'
  Invoke-RestMethod -Method Patch -Uri "${casesUrl}?id=eq.$processCaseId" -Headers $apiHeaders -ContentType 'application/json' -Body (@{ memo = $updatedMemo } | ConvertTo-Json) | Out-Null
  $staleSubmitBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/submit-case' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; memo = $updatedMemo } | ConvertTo-Json) | Out-Null
  } catch {
    $staleSubmitBlocked = [int]$_.Exception.Response.StatusCode -eq 400
  }
  if (-not $staleSubmitBlocked) {
    throw 'case memo changed after analysis but stale FactBlocks were submitted'
  }
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-case' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/submit-case' -Headers $authHeaders -ContentType 'application/json' -Body (@{ caseId = $processCaseId; memo = $updatedMemo } | ConvertTo-Json) | Out-Null
  $submitCaseState = Invoke-Psql "select status || '|' || (select count(*) from public.fact_blocks where case_id = cases.id and confirmed = true) || '|' || (select count(*) from public.audit_logs where target_id = cases.id::text and action = 'case.submitted') from public.cases where id = '$processCaseId';"
  Assert-Match $submitCaseState '^submitted\|[1-9][0-9]*\|1$' 'submit case'
  Write-Output 'process_case=ok'
  Write-Output 'direct_rest_guard=ok'
  Write-Output 'stale_fact_submit_guard=ok'
  Write-Output 'submit_case=ok'

  $uploadBody = @{
    caseId = '30000000-0000-0000-0000-000000000001'
    fileName = 'integration-storage.png'
    mimeType = 'image/png'
    sizeBytes = 7
    kind = 'image'
    durationSeconds = $null
  } | ConvertTo-Json
  $upload = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body $uploadBody
  $signedUpload = Normalize-LocalUrl $upload.signedUrl
  $uploadStatus = & curl.exe -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: image/png' --data-binary 'PNGDATA' $signedUpload
  Assert-Equal $uploadStatus '200' 'signed upload'
  $directStorageUrl = "http://127.0.0.1:54321/storage/v1/object/case-evidence/$($upload.asset.storage_path)"
  $directStorageStatus = & curl.exe -sS -o NUL -w '%{http_code}' $directStorageUrl
  Assert-Match $directStorageStatus '^(400|401|403|404)$' 'private storage direct access'
  Write-Output 'private_storage=ok'

  $downloadBody = @{ evidenceId = $upload.asset.id } | ConvertTo-Json
  $download = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-download-url' -Headers $authHeaders -ContentType 'application/json' -Body $downloadBody
  $signedDownload = Normalize-LocalUrl $download.signedUrl
  $downloadStatus = & curl.exe -sS -o NUL -w '%{http_code}|%{size_download}' $signedDownload
  Assert-Equal $downloadStatus '200|7' 'signed download'

  $process = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-evidence' -Headers $authHeaders -ContentType 'application/json' -Body $downloadBody
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $jobState = Invoke-Psql "select status || '|' || attempts from public.processing_jobs where id = '$($process.job.id)';"
  } while ($jobState -notmatch '^(completed|manual_review)\|' -and (Get-Date) -lt $deadline)
  Assert-Match $jobState '^(completed|manual_review)\|1$' 'processing job'
  Write-Output 'storage_and_processing=ok'

  Invoke-Psql "update public.processing_jobs set status = 'failed', attempts = 1, message = 'retry verification failure' where id = '$($process.job.id)';" | Out-Null
  $retry = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/retry-failed-jobs' -Headers @{ 'x-cron-secret' = $retryCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$retry.retried) '1' 'retried job count'
  $duplicateRetry = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/retry-failed-jobs' -Headers @{ 'x-cron-secret' = $retryCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$duplicateRetry.retried) '0' 'duplicate retry reservation count'
  $retryDeadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $retriedJobState = Invoke-Psql "select status || '|' || attempts from public.processing_jobs where id = '$($process.job.id)';"
  } while ($retriedJobState -notmatch '^(completed|manual_review)\|2$' -and (Get-Date) -lt $retryDeadline)
  Assert-Match $retriedJobState '^(completed|manual_review)\|2$' 'retried processing job'
  Write-Output 'retry_failed_job=ok'
  Invoke-Psql "alter table public.processing_jobs disable trigger processing_jobs_touch_updated_at; update public.processing_jobs set status = 'processing', attempts = 2, message = 'interrupted worker verification', updated_at = now() - interval '11 minutes' where id = '$($process.job.id)'; alter table public.processing_jobs enable trigger processing_jobs_touch_updated_at;" | Out-Null
  $interruptedRetry = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/retry-failed-jobs' -Headers @{ 'x-cron-secret' = $retryCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$interruptedRetry.retried) '1' 'interrupted job retry count'
  $interruptedRetryDeadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $interruptedJobState = Invoke-Psql "select status || '|' || attempts from public.processing_jobs where id = '$($process.job.id)';"
  } while ($interruptedJobState -notmatch '^(completed|manual_review)\|3$' -and (Get-Date) -lt $interruptedRetryDeadline)
  Assert-Match $interruptedJobState '^(completed|manual_review)\|3$' 'interrupted processing job'
  Write-Output 'interrupted_job_retry=ok'
  Invoke-Psql "update public.processing_jobs set status = 'failed', attempts = 3, message = 'retry cap verification failure' where id = '$($process.job.id)';" | Out-Null
  $retryAtCap = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/retry-failed-jobs' -Headers @{ 'x-cron-secret' = $retryCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$retryAtCap.retried) '0' 'retry cap job count'
  $retryCapState = Invoke-Psql "select status || '|' || attempts from public.processing_jobs where id = '$($process.job.id)';"
  Assert-Equal $retryCapState 'failed|3' 'retry cap state'
  Write-Output 'retry_attempt_cap=ok'

  $audioUploadBody = @{
    caseId = '30000000-0000-0000-0000-000000000001'
    fileName = 'duration-unknown.m4a'
    mimeType = 'audio/mp4'
    sizeBytes = 7
    kind = 'audio'
    durationSeconds = $null
  } | ConvertTo-Json
  $audioUpload = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/evidence-upload-url' -Headers $authHeaders -ContentType 'application/json' -Body $audioUploadBody
  $signedAudioUpload = Normalize-LocalUrl $audioUpload.signedUrl
  $audioUploadStatus = & curl.exe -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: audio/mp4' --data-binary 'AUDIODA' $signedAudioUpload
  Assert-Equal $audioUploadStatus '200' 'signed audio upload'
  $audioProcess = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/process-evidence' -Headers $authHeaders -ContentType 'application/json' -Body (@{ evidenceId = $audioUpload.asset.id } | ConvertTo-Json)
  $audioDeadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $audioJobState = Invoke-Psql "select processing_jobs.status || '|' || processing_jobs.attempts || '|' || evidence_assets.processing_status from public.processing_jobs join public.evidence_assets on evidence_assets.id = processing_jobs.evidence_id where processing_jobs.id = '$($audioProcess.job.id)';"
  } while ($audioJobState -notmatch '^manual_review\|' -and (Get-Date) -lt $audioDeadline)
  Assert-Equal $audioJobState 'manual_review|1|manual_review' 'unknown duration audio handling'
  Write-Output 'audio_stt_guard=ok'

  $apiKeyHeader = "apikey: $anonKey"
  $authorizationHeader = "Authorization: Bearer $($login.session.access_token)"
  $beforeDelete = (& curl.exe -sS -H $apiKeyHeader -H $authorizationHeader 'http://127.0.0.1:54321/rest/v1/cases?select=id').Trim()
  $deleteBody = @{ case_id_input = '30000000-0000-0000-0000-000000000001' } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/schedule_case_deletion' -Headers $apiHeaders -ContentType 'application/json' -Body $deleteBody | Out-Null
  $afterDelete = (& curl.exe -sS -H $apiKeyHeader -H $authorizationHeader 'http://127.0.0.1:54321/rest/v1/cases?select=id').Trim()
  Assert-Match $beforeDelete '30000000-0000-0000-0000-000000000001' 'visible case before deletion'
  if ($afterDelete -match '30000000-0000-0000-0000-000000000001') {
    throw 'scheduled deletion case is still visible'
  }
  $scheduledDeletionReopenBlocked = $false
  try {
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/staff-case-action' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ caseId = '30000000-0000-0000-0000-000000000001'; action = 'reopen' } | ConvertTo-Json) | Out-Null
  } catch {
    $scheduledDeletionReopenBlocked = [int]$_.Exception.Response.StatusCode -eq 409
  }
  if (-not $scheduledDeletionReopenBlocked) {
    throw 'scheduled deletion case was reopened'
  }
  Write-Output 'deletion_reopen_guard=ok'
  $deletionState = Invoke-Psql "select status || '|' || (purge_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour') from public.cases where id = '30000000-0000-0000-0000-000000000001';"
  Assert-Equal $deletionState 'deletion_scheduled|true' 'deletion schedule'
  Write-Output 'deletion_schedule=ok'

  Invoke-Psql "update public.cases set purge_at = now() - interval '1 minute' where id = '30000000-0000-0000-0000-000000000001';" | Out-Null
  $firstPurgeClaim = Invoke-Psql "select count(*) from public.cases_ready_for_purge(20) where id = '30000000-0000-0000-0000-000000000001';"
  Assert-Equal $firstPurgeClaim '1' 'first purge claim count'
  $duplicatePurgeClaim = Invoke-Psql "select count(*) from public.cases_ready_for_purge(20) where id = '30000000-0000-0000-0000-000000000001';"
  Assert-Equal $duplicatePurgeClaim '0' 'duplicate purge claim count'
  Invoke-Psql "update public.cases set purge_started_at = now() - interval '11 minutes' where id = '30000000-0000-0000-0000-000000000001';" | Out-Null
  $stalePurgeClaim = Invoke-Psql "select count(*) from public.cases_ready_for_purge(20) where id = '30000000-0000-0000-0000-000000000001';"
  Assert-Equal $stalePurgeClaim '1' 'stale purge claim recovery count'
  Invoke-Psql "select public.release_case_purge_claim('30000000-0000-0000-0000-000000000001'); insert into public.audit_logs(institution_id, action, target_type, target_id) values ('20000000-0000-0000-0000-000000000001', 'evidence.test_trace', 'evidence', '60000000-0000-0000-0000-000000000001');" | Out-Null
  Write-Output 'purge_claim_lease=ok'
  $purge = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/purge-deleted' -Headers @{ 'x-cron-secret' = $purgeCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$purge.purged) '1' 'purged case count'
  $purgeState = Invoke-Psql "select (select count(*) from public.cases where id = '30000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.evidence_assets where case_id = '30000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.audit_logs where target_id = '30000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.audit_logs where target_type = 'evidence' and target_id = '60000000-0000-0000-0000-000000000001') || '|' || (select count(*) from public.audit_logs where action = 'case.purged' and target_type = 'case' and target_id = 'purged' and actor_id is null and metadata = '{}'::jsonb);"
  Assert-Equal $purgeState '0|0|0|0|1' 'purge lifecycle'
  $downloadAfterPurgeStatus = & curl.exe -sS -o NUL -w '%{http_code}' $signedDownload
  Assert-Match $downloadAfterPurgeStatus '^(400|404)$' 'purged storage object'
  Write-Output 'purge_deleted=ok'

  Invoke-Psql "insert into public.cases(id, institution_id, student_id, anonymous_label, status, synthetic, submitted_at) values ('30000000-0000-0000-0000-000000000092', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'retention purge verification', 'completed', true, now() - interval '46 days'), ('30000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'reopened retention verification', 'reopened', true, now() - interval '46 days'); insert into public.evidence_assets(case_id, file_name, mime_type, size_bytes, kind, storage_path, synthetic) values ('30000000-0000-0000-0000-000000000092', 'retention.png', 'image/png', 1, 'image', 'retention/missing.png', true);" | Out-Null
  $retentionPurge = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/purge-deleted' -Headers @{ 'x-cron-secret' = $purgeCronSecret } -ContentType 'application/json' -Body '{}'
  Assert-Equal ([string]$retentionPurge.purged) '1' 'retention purged case count'
  $retentionPurgeState = Invoke-Psql "select (select count(*) from public.cases where id = '30000000-0000-0000-0000-000000000092') || '|' || (select count(*) from public.evidence_assets where case_id = '30000000-0000-0000-0000-000000000092') || '|' || (select count(*) from public.audit_logs where action = 'case.retention_purged' and target_type = 'case' and target_id = 'purged' and actor_id is null and metadata = '{}'::jsonb) || '|' || (select count(*) from public.cases where id = '30000000-0000-0000-0000-000000000091' and status = 'reopened');"
  Assert-Equal $retentionPurgeState '0|0|1|1' 'retention purge lifecycle'
  Write-Output 'retention_purge=ok'
} finally {
  Reset-Database
}

Write-Output 'local_verification=ok'
