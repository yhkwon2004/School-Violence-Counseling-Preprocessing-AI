create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'counselor', 'institution_admin', 'platform_admin');
create type public.case_status as enum ('draft', 'analyzing', 'student_review', 'submitted', 'assigned', 'in_review', 'completed', 'reopened', 'deletion_scheduled');
create type public.evidence_kind as enum ('image', 'pdf', 'audio', 'video', 'document', 'other');
create type public.processing_status as enum ('queued', 'processing', 'completed', 'failed', 'manual_review');

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null default '미지정',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete cascade,
  role public.user_role not null,
  display_name text not null,
  student_login_id text unique,
  auth_email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_need_institution check (role = 'platform_admin' or institution_id is not null),
  constraint students_need_login_id check (role <> 'student' or student_login_id is not null)
);

create table public.institution_settings (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  retention_days integer not null default 30 check (retention_days >= 1),
  recovery_days integer not null default 7 check (recovery_days >= 0),
  max_files_per_case integer not null default 50 check (max_files_per_case between 1 and 50),
  max_file_size_bytes bigint not null default 50000000 check (max_file_size_bytes between 1 and 50000000),
  max_audio_seconds integer not null default 900 check (max_audio_seconds between 1 and 900),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  anonymous_label text not null,
  memo text not null default '' check (char_length(memo) <= 1000),
  analyzed_memo_hash text,
  status public.case_status not null default 'draft',
  synthetic boolean not null default false,
  submitted_at timestamptz,
  deletion_requested_at timestamptz,
  purge_at timestamptz,
  purge_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  counselor_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index assignments_one_active_case
  on public.assignments(case_id)
  where active;

create table public.fact_blocks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  sequence integer not null,
  occurred_at timestamptz,
  location text,
  actor text,
  target text,
  action text not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id, sequence)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  anonymous_label text not null,
  relation text not null,
  tone text not null default 'neutral',
  created_at timestamptz not null default now()
);

create table public.relations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  from_person_id uuid not null references public.people(id) on delete cascade,
  to_person_id uuid not null references public.people(id) on delete cascade,
  label text not null,
  indirect boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 0 and 50000000),
  kind public.evidence_kind not null,
  storage_path text not null unique,
  synthetic boolean not null default false,
  processing_status public.processing_status not null default 'queued',
  extracted_text text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.fact_block_evidence (
  fact_block_id uuid not null references public.fact_blocks(id) on delete cascade,
  evidence_id uuid not null references public.evidence_assets(id) on delete cascade,
  primary key (fact_block_id, evidence_id)
);

create table public.missing_questions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  fact_block_id uuid references public.fact_blocks(id) on delete cascade,
  field text not null,
  prompt text not null,
  answer text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.counselor_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence_assets(id) on delete cascade,
  status public.processing_status not null default 'queued',
  attempts integer not null default 0,
  message text not null default '처리 대기 중',
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_student_case_updates()
returns trigger
language plpgsql
as $$
begin
  if public.current_profile_role() is distinct from 'student'::public.user_role then
    return new;
  end if;

  if new.status = 'deletion_scheduled' then
    if new.deletion_requested_at is null or new.purge_at is null then
      raise exception 'Deletion schedule is incomplete';
    end if;
    return new;
  end if;

  if old.status not in ('draft', 'analyzing', 'student_review', 'reopened') then
    raise exception 'Submitted cases are locked';
  end if;

  if new.institution_id <> old.institution_id
    or new.student_id <> old.student_id
    or new.anonymous_label <> old.anonymous_label
    or new.synthetic <> old.synthetic
    or new.deletion_requested_at is distinct from old.deletion_requested_at
    or new.purge_at is distinct from old.purge_at
    or new.purge_started_at is distinct from old.purge_started_at then
    raise exception 'Students cannot change protected case fields';
  end if;

  if new.status <> old.status and not (
    (old.status = 'draft' and new.status = 'analyzing')
    or (old.status = 'analyzing' and new.status = 'student_review')
    or (old.status = 'student_review' and new.status = 'submitted')
    or (old.status = 'reopened' and new.status in ('analyzing', 'student_review', 'submitted'))
  ) then
    raise exception 'Invalid student case transition';
  end if;

  return new;
end;
$$;

create or replace function public.protect_student_question_updates()
returns trigger
language plpgsql
as $$
begin
  if public.current_profile_role() = 'student' and (
    new.case_id <> old.case_id
    or new.fact_block_id is distinct from old.fact_block_id
    or new.field <> old.field
    or new.prompt <> old.prompt
    or new.created_at <> old.created_at
  ) then
    raise exception 'Students can answer questions only';
  end if;
  return new;
end;
$$;

create or replace function public.invalidate_case_analysis()
returns trigger
language plpgsql
as $$
begin
  if new.memo is distinct from old.memo then
    new.analyzed_memo_hash = null;
  end if;
  return new;
end;
$$;

create or replace function public.audit_counselor_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  note_institution_id uuid;
begin
  select institution_id into note_institution_id from public.cases where id = new.case_id;
  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id)
  values (note_institution_id, new.author_id, 'note.created', 'case', new.case_id::text);
  return new;
end;
$$;

create or replace function public.enforce_evidence_limits()
returns trigger
language plpgsql
as $$
declare
  settings public.institution_settings;
  active_file_count integer;
begin
  select s.* into settings
  from public.cases c
  join public.institution_settings s on s.institution_id = c.institution_id
  where c.id = new.case_id
  for update of c;

  if not found then
    raise exception 'Case settings are unavailable';
  end if;

  if new.size_bytes < 0 or new.size_bytes > settings.max_file_size_bytes then
    raise exception 'File size exceeds the institution limit';
  end if;

  select count(*) into active_file_count
  from public.evidence_assets
  where case_id = new.case_id
    and deleted_at is null;

  if active_file_count >= settings.max_files_per_case then
    raise exception 'Case file count exceeds the institution limit';
  end if;

  return new;
end;
$$;

create trigger institutions_touch_updated_at before update on public.institutions for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger institution_settings_touch_updated_at before update on public.institution_settings for each row execute function public.touch_updated_at();
create trigger cases_touch_updated_at before update on public.cases for each row execute function public.touch_updated_at();
create trigger invalidate_case_analysis before update on public.cases for each row execute function public.invalidate_case_analysis();
create trigger fact_blocks_touch_updated_at before update on public.fact_blocks for each row execute function public.touch_updated_at();
create trigger missing_questions_touch_updated_at before update on public.missing_questions for each row execute function public.touch_updated_at();
create trigger processing_jobs_touch_updated_at before update on public.processing_jobs for each row execute function public.touch_updated_at();
create trigger protect_student_case_updates before update on public.cases for each row execute function public.protect_student_case_updates();
create trigger protect_student_question_updates before update on public.missing_questions for each row execute function public.protect_student_question_updates();
create trigger audit_counselor_note after insert on public.counselor_notes for each row execute function public.audit_counselor_note();
create trigger enforce_evidence_limits before insert on public.evidence_assets for each row execute function public.enforce_evidence_limits();

create or replace function public.reserve_evidence_processing(evidence_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_asset public.evidence_assets;
  selected_job public.processing_jobs;
begin
  select * into selected_asset
  from public.evidence_assets
  where id = evidence_id_input
  for update;

  if selected_asset.id is null or selected_asset.deleted_at is not null then
    raise exception 'Evidence is unavailable';
  end if;

  select * into selected_job
  from public.processing_jobs
  where evidence_id = evidence_id_input
  order by updated_at desc
  limit 1;

  if selected_job.id is not null then
    return jsonb_build_object('job', to_jsonb(selected_job), 'created', false);
  end if;

  if selected_asset.processing_status <> 'queued' then
    raise exception 'Evidence is not queued';
  end if;

  insert into public.processing_jobs(evidence_id)
  values (evidence_id_input)
  returning * into selected_job;

  return jsonb_build_object('job', to_jsonb(selected_job), 'created', true);
end;
$$;

revoke all on function public.reserve_evidence_processing(uuid) from public, anon, authenticated;
grant execute on function public.reserve_evidence_processing(uuid) to service_role;

create or replace function public.reserve_retryable_evidence_jobs(limit_input integer default 20)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.processing_jobs j
    join public.evidence_assets e on e.id = j.evidence_id
    where e.deleted_at is null
      and j.attempts < 3
      and (
        j.status = 'failed'
        or (
          j.status in ('queued', 'processing')
          and j.updated_at < now() - interval '10 minutes'
        )
      )
    order by j.updated_at
    for update of j skip locked
    limit greatest(1, least(coalesce(limit_input, 20), 100))
  )
  update public.processing_jobs j
  set status = 'queued',
      message = '재처리 대기 중',
      started_at = null,
      finished_at = null
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.reserve_retryable_evidence_jobs(integer) from public, anon, authenticated;
grant execute on function public.reserve_retryable_evidence_jobs(integer) to service_role;

create or replace function public.begin_evidence_upload_discard(evidence_id_input uuid, student_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_asset public.evidence_assets;
  selected_case public.cases;
begin
  select * into selected_asset
  from public.evidence_assets
  where id = evidence_id_input
  for update;

  if selected_asset.id is null or selected_asset.processing_status <> 'queued' then
    raise exception 'Only queued uploads can be discarded';
  end if;

  select * into selected_case
  from public.cases
  where id = selected_asset.case_id;

  if selected_case.id is null
    or selected_case.student_id <> student_id_input
    or selected_case.status not in ('draft', 'analyzing', 'student_review', 'reopened') then
    raise exception 'Upload discard is unavailable';
  end if;

  if exists (select 1 from public.processing_jobs where evidence_id = evidence_id_input) then
    raise exception 'Processing was already reserved';
  end if;

  update public.evidence_assets
  set deleted_at = coalesce(deleted_at, now())
  where id = evidence_id_input;

  return jsonb_build_object(
    'storagePath', selected_asset.storage_path,
    'institutionId', selected_case.institution_id
  );
end;
$$;

revoke all on function public.begin_evidence_upload_discard(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_evidence_upload_discard(uuid, uuid) to service_role;

create or replace function public.cancel_evidence_upload_discard(evidence_id_input uuid, student_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.evidence_assets e
  set deleted_at = null
  from public.cases c
  where e.id = evidence_id_input
    and c.id = e.case_id
    and c.student_id = student_id_input
    and e.processing_status = 'queued'
    and not exists (select 1 from public.processing_jobs j where j.evidence_id = e.id);
end;
$$;

revoke all on function public.cancel_evidence_upload_discard(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_evidence_upload_discard(uuid, uuid) to service_role;

create or replace function public.finalize_evidence_upload_discard(evidence_id_input uuid, student_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_asset public.evidence_assets;
  selected_case public.cases;
begin
  select * into selected_asset
  from public.evidence_assets
  where id = evidence_id_input
  for update;

  if selected_asset.id is null
    or selected_asset.deleted_at is null
    or selected_asset.processing_status <> 'queued'
    or exists (select 1 from public.processing_jobs where evidence_id = evidence_id_input) then
    raise exception 'Upload discard reservation is unavailable';
  end if;

  select * into selected_case
  from public.cases
  where id = selected_asset.case_id;

  if selected_case.id is null or selected_case.student_id <> student_id_input then
    raise exception 'Upload discard is unavailable';
  end if;

  delete from public.evidence_assets where id = evidence_id_input;
  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id)
  values (selected_case.institution_id, student_id_input, 'evidence.upload_discarded', 'evidence', evidence_id_input::text);
  return true;
end;
$$;

revoke all on function public.finalize_evidence_upload_discard(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_evidence_upload_discard(uuid, uuid) to service_role;

create or replace function public.current_profile_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  left join public.institutions i on i.id = p.institution_id
  where p.id = auth.uid()
    and p.active = true
    and (p.role = 'platform_admin' or i.active = true);
$$;

create or replace function public.current_institution_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.institution_id
  from public.profiles p
  left join public.institutions i on i.id = p.institution_id
  where p.id = auth.uid()
    and p.active = true
    and (p.role = 'platform_admin' or i.active = true);
$$;

create or replace function public.can_access_case(case_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = case_id_input
      and c.status <> 'deletion_scheduled'
      and (
        public.current_profile_role() = 'platform_admin'
        or (
          c.institution_id = public.current_institution_id()
          and (
            public.current_profile_role() in ('counselor', 'institution_admin')
            or c.student_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.claim_case(case_id_input uuid)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.assignments;
begin
  if public.current_profile_role() <> 'counselor' then
    raise exception 'Only counselors can claim cases';
  end if;

  if not exists (
    select 1 from public.cases
    where id = case_id_input
      and institution_id = public.current_institution_id()
      and status in ('submitted', 'assigned')
  ) then
    raise exception 'Case is unavailable';
  end if;

  insert into public.assignments(case_id, counselor_id, assigned_by)
  values (case_id_input, auth.uid(), auth.uid())
  returning * into claimed;

  update public.cases set status = 'assigned' where id = case_id_input and status = 'submitted';
  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id)
  values (public.current_institution_id(), auth.uid(), 'case.claimed', 'case', case_id_input::text);
  return claimed;
exception
  when unique_violation then
    raise exception 'Case was already claimed';
end;
$$;

grant execute on function public.claim_case(uuid) to authenticated;

create or replace function public.assign_case(case_id_input uuid, counselor_id_input uuid)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned public.assignments;
  selected_case public.cases;
  selected_counselor public.profiles;
  actor_role public.user_role := public.current_profile_role();
begin
  if actor_role not in ('institution_admin', 'platform_admin') then
    raise exception 'Only administrators can assign cases';
  end if;

  select * into selected_case
  from public.cases
  where id = case_id_input
  for update;

  if selected_case.id is null
    or selected_case.status not in ('submitted', 'assigned', 'in_review', 'reopened') then
    raise exception 'Case is unavailable';
  end if;

  if actor_role = 'institution_admin'
    and selected_case.institution_id is distinct from public.current_institution_id() then
    raise exception 'Case is unavailable';
  end if;

  select * into selected_counselor
  from public.profiles
  where id = counselor_id_input
    and role = 'counselor'
    and active = true;

  if selected_counselor.id is null
    or selected_counselor.institution_id is distinct from selected_case.institution_id then
    raise exception 'Counselor is unavailable';
  end if;

  update public.assignments
  set active = false,
      released_at = now()
  where case_id = case_id_input
    and active = true;

  insert into public.assignments(case_id, counselor_id, assigned_by)
  values (case_id_input, counselor_id_input, auth.uid())
  returning * into assigned;

  update public.cases
  set status = 'assigned'
  where id = case_id_input
    and status = 'submitted';

  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id, metadata)
  values (
    selected_case.institution_id,
    auth.uid(),
    'case.assigned',
    'case',
    case_id_input::text,
    jsonb_build_object('counselor_id', counselor_id_input)
  );
  return assigned;
end;
$$;

grant execute on function public.assign_case(uuid, uuid) to authenticated;

create or replace function public.submit_case_record(case_id_input uuid, memo_input text)
returns public.cases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  selected_case public.cases;
  submitted_case public.cases;
begin
  select * into selected_case
  from public.cases
  where id = case_id_input
  for update;

  if selected_case.id is null
    or selected_case.student_id <> auth.uid()
    or public.current_profile_role() <> 'student' then
    raise exception 'Only the student owner can submit this case';
  end if;

  if selected_case.status not in ('student_review', 'reopened') then
    raise exception 'Case is not ready for submission';
  end if;

  if selected_case.analyzed_memo_hash is null
    or selected_case.analyzed_memo_hash <> encode(digest(coalesce(memo_input, ''), 'sha256'), 'hex') then
    raise exception 'Case memo changed after analysis';
  end if;

  if not exists (select 1 from public.fact_blocks where case_id = case_id_input) then
    raise exception 'Case has no fact blocks';
  end if;

  if exists (
    select 1
    from public.evidence_assets
    where case_id = case_id_input
      and deleted_at is null
      and processing_status in ('queued', 'processing')
  ) then
    raise exception 'Evidence processing is pending';
  end if;

  update public.fact_blocks
  set confirmed = true
  where case_id = case_id_input;

  update public.cases
  set memo = coalesce(memo_input, ''),
      status = 'submitted',
      submitted_at = now()
  where id = case_id_input
  returning * into submitted_case;

  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id)
  values (selected_case.institution_id, auth.uid(), 'case.submitted', 'case', case_id_input::text);

  return submitted_case;
end;
$$;

grant execute on function public.submit_case_record(uuid, text) to authenticated;

create or replace function public.schedule_case_deletion(case_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_case public.cases;
  selected_recovery_days integer;
begin
  select * into selected_case
  from public.cases
  where id = case_id_input;

  if selected_case.id is null or not public.can_access_case(case_id_input) then
    raise exception 'Case is unavailable';
  end if;

  if public.current_profile_role() not in ('student', 'institution_admin', 'platform_admin') then
    raise exception 'Deletion request is unavailable';
  end if;

  if public.current_profile_role() = 'student' and selected_case.student_id <> auth.uid() then
    raise exception 'Deletion request is unavailable';
  end if;

  select recovery_days into selected_recovery_days
  from public.institution_settings
  where institution_id = selected_case.institution_id;
  if selected_recovery_days is null then
    raise exception 'Deletion policy is unavailable';
  end if;

  update public.cases
  set status = 'deletion_scheduled',
      deletion_requested_at = now(),
      purge_at = now() + make_interval(days => selected_recovery_days),
      purge_started_at = null
  where id = case_id_input;

  update public.evidence_assets
  set deleted_at = now()
  where case_id = case_id_input and deleted_at is null;

  insert into public.audit_logs(institution_id, actor_id, action, target_type, target_id)
  values (selected_case.institution_id, auth.uid(), 'case.deletion_scheduled', 'case', case_id_input::text);
end;
$$;

grant execute on function public.schedule_case_deletion(uuid) to authenticated;

create or replace function public.cases_ready_for_purge(limit_input integer default 20)
returns table(id uuid, institution_id uuid, purge_reason text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as materialized (
    select
      c.id,
      c.institution_id,
      case
        when c.status = 'deletion_scheduled' then 'deletion_request'::text
        else 'retention_expired'::text
      end as purge_reason
    from public.cases c
    join public.institution_settings s on s.institution_id = c.institution_id
    where (
      (c.status = 'deletion_scheduled' and c.purge_at <= now())
      or (
        c.status in ('submitted', 'assigned', 'in_review', 'completed')
        and c.submitted_at is not null
        and c.submitted_at + make_interval(days => s.retention_days) <= now()
      )
    )
      and (c.purge_started_at is null or c.purge_started_at < now() - interval '10 minutes')
    order by coalesce(c.purge_at, c.submitted_at)
    for update of c skip locked
    limit greatest(1, least(coalesce(limit_input, 20), 100))
  ),
  claimed as (
    update public.cases c
    set purge_started_at = now()
    from candidates candidate
    where c.id = candidate.id
    returning c.id, c.institution_id
  )
  select claimed.id, claimed.institution_id, candidates.purge_reason
  from claimed
  join candidates on candidates.id = claimed.id;
end;
$$;

revoke all on function public.cases_ready_for_purge(integer) from public, anon, authenticated;
grant execute on function public.cases_ready_for_purge(integer) to service_role;

create or replace function public.release_case_purge_claim(case_id_input uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cases
  set purge_started_at = null
  where id = case_id_input;
$$;

revoke all on function public.release_case_purge_claim(uuid) from public, anon, authenticated;
grant execute on function public.release_case_purge_claim(uuid) to service_role;

create or replace function public.finalize_case_purge(case_id_input uuid, purge_reason_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_case public.cases;
  purge_action text;
begin
  if purge_reason_input not in ('deletion_request', 'retention_expired') then
    raise exception 'Purge reason is unavailable';
  end if;

  select * into selected_case
  from public.cases
  where id = case_id_input
  for update;

  if selected_case.id is null or selected_case.purge_started_at is null then
    raise exception 'Purge claim is unavailable';
  end if;

  delete from public.audit_logs
  where (
    target_type = 'case'
    and target_id = case_id_input::text
  ) or (
    target_type = 'evidence'
    and target_id in (
      select id::text
      from public.evidence_assets
      where case_id = case_id_input
    )
  );

  delete from public.cases where id = case_id_input;
  purge_action := case when purge_reason_input = 'retention_expired' then 'case.retention_purged' else 'case.purged' end;
  insert into public.audit_logs(institution_id, action, target_type, target_id)
  values (selected_case.institution_id, purge_action, 'case', 'purged');
  return true;
end;
$$;

revoke all on function public.finalize_case_purge(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_case_purge(uuid, text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values ('case-evidence', 'case-evidence', false, 50000000)
on conflict (id) do update set public = false, file_size_limit = 50000000;

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.institution_settings enable row level security;
alter table public.cases enable row level security;
alter table public.assignments enable row level security;
alter table public.fact_blocks enable row level security;
alter table public.people enable row level security;
alter table public.relations enable row level security;
alter table public.evidence_assets enable row level security;
alter table public.fact_block_evidence enable row level security;
alter table public.missing_questions enable row level security;
alter table public.counselor_notes enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.audit_logs enable row level security;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'evidence_assets'
    ) then
    alter publication supabase_realtime add table public.evidence_assets;
  end if;
end;
$$;

create policy "institution members read institutions" on public.institutions for select to authenticated
  using (id = public.current_institution_id() or public.current_profile_role() = 'platform_admin');
create policy "platform admins manage institutions" on public.institutions for all to authenticated
  using (public.current_profile_role() = 'platform_admin') with check (public.current_profile_role() = 'platform_admin');

create policy "users read scoped profiles" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.current_profile_role() = 'platform_admin'
    or (
      public.current_profile_role() in ('counselor', 'institution_admin')
      and institution_id = public.current_institution_id()
    )
  );

create policy "members read institution settings" on public.institution_settings for select to authenticated
  using (institution_id = public.current_institution_id() or public.current_profile_role() = 'platform_admin');
create policy "admins manage institution settings" on public.institution_settings for all to authenticated
  using (public.current_profile_role() = 'platform_admin' or (public.current_profile_role() = 'institution_admin' and institution_id = public.current_institution_id()))
  with check (public.current_profile_role() = 'platform_admin' or (public.current_profile_role() = 'institution_admin' and institution_id = public.current_institution_id()));

create policy "users read accessible cases" on public.cases for select to authenticated using (public.can_access_case(id));
create policy "students create own cases" on public.cases for insert to authenticated
  with check (
    student_id = auth.uid()
    and institution_id = public.current_institution_id()
    and public.current_profile_role() = 'student'
    and synthetic = false
  );
create policy "students update own editable cases" on public.cases for update to authenticated
  using (
    public.can_access_case(id)
    and public.current_profile_role() = 'student'
    and student_id = auth.uid()
    and status in ('draft', 'analyzing', 'student_review', 'reopened')
  )
  with check (
    public.can_access_case(id)
    and public.current_profile_role() = 'student'
    and student_id = auth.uid()
    and status in ('draft', 'analyzing', 'student_review', 'submitted', 'reopened')
  );

create policy "users read scoped assignments" on public.assignments for select to authenticated using (public.can_access_case(case_id));

create policy "users read scoped fact blocks" on public.fact_blocks for select to authenticated using (public.can_access_case(case_id));
create policy "users read scoped people" on public.people for select to authenticated using (public.can_access_case(case_id));
create policy "users read scoped relations" on public.relations for select to authenticated using (public.can_access_case(case_id));
create policy "users read scoped evidence" on public.evidence_assets for select to authenticated using (public.can_access_case(case_id) and deleted_at is null);
create policy "users read scoped fact evidence" on public.fact_block_evidence for select to authenticated
  using (exists (select 1 from public.fact_blocks where fact_blocks.id = fact_block_id and public.can_access_case(fact_blocks.case_id)));
create policy "users read scoped questions" on public.missing_questions for select to authenticated using (public.can_access_case(case_id));
create policy "students answer own review questions" on public.missing_questions for update to authenticated
  using (
    public.current_profile_role() = 'student'
    and exists (
      select 1 from public.cases
      where cases.id = case_id
        and cases.student_id = auth.uid()
        and cases.status in ('student_review', 'reopened')
    )
  )
  with check (
    public.current_profile_role() = 'student'
    and exists (
      select 1 from public.cases
      where cases.id = case_id
        and cases.student_id = auth.uid()
        and cases.status in ('student_review', 'reopened')
    )
  );
create policy "staff read scoped notes" on public.counselor_notes for select to authenticated
  using (public.can_access_case(case_id) and public.current_profile_role() in ('counselor', 'institution_admin', 'platform_admin'));
create policy "staff create scoped notes" on public.counselor_notes for insert to authenticated
  with check (public.can_access_case(case_id) and author_id = auth.uid() and public.current_profile_role() in ('counselor', 'institution_admin', 'platform_admin'));
create policy "users read scoped processing jobs" on public.processing_jobs for select to authenticated
  using (exists (select 1 from public.evidence_assets where evidence_assets.id = evidence_id and public.can_access_case(evidence_assets.case_id)));
create policy "admins read audit logs" on public.audit_logs for select to authenticated
  using (public.current_profile_role() = 'platform_admin' or (public.current_profile_role() = 'institution_admin' and institution_id = public.current_institution_id()));

create policy "users read scoped storage" on storage.objects for select to authenticated
  using (
    bucket_id = 'case-evidence'
    and exists (
      select 1 from public.evidence_assets e
      where e.storage_path = name and public.can_access_case(e.case_id) and e.deleted_at is null
    )
  );
