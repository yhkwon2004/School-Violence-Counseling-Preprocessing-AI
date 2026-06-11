-- Fully synthetic demo data. Do not replace with real student records.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'platform@ieumlog.demo', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin@wee.demo', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'counselor@wee.demo', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'wee-24-0510@students.ieumlog.invalid', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do update
set encrypted_password = excluded.encrypted_password,
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = excluded.updated_at;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select gen_random_uuid(), id, jsonb_build_object('sub', id::text, 'email', email), 'email', email, now(), now()
from auth.users
where id::text like '10000000-0000-0000-0000-00000000000%'
on conflict (provider_id, provider) do nothing;

insert into public.institutions(id, name, region)
values ('20000000-0000-0000-0000-000000000001', '부산 이음 Wee센터', '부산')
on conflict (id) do update set name = excluded.name, region = excluded.region, active = true;

insert into public.institution_settings(institution_id)
values ('20000000-0000-0000-0000-000000000001')
on conflict (institution_id) do nothing;

insert into public.profiles(id, institution_id, role, display_name, student_login_id, auth_email, active)
values
  ('10000000-0000-0000-0000-000000000001', null, 'platform_admin', '플랫폼 관리자', null, 'platform@ieumlog.demo', true),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'institution_admin', '김 기관관리자', null, 'admin@wee.demo', true),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'counselor', '박 상담자', null, 'counselor@wee.demo', true),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'student', '학생 24-0510', 'WEE-24-0510', 'wee-24-0510@students.ieumlog.invalid', true)
on conflict (id) do update
set institution_id = excluded.institution_id,
    role = excluded.role,
    display_name = excluded.display_name,
    student_login_id = excluded.student_login_id,
    auth_email = excluded.auth_email,
    active = excluded.active;

insert into public.cases(id, institution_id, student_id, anonymous_label, memo, status, synthetic, submitted_at)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004',
  '학생 24-0510',
  '2024년 5월 10일 14시 20분쯤 학교 2층 복도에서 B가 모욕성 발언을 했고, 14시 25분 계단 앞에서 B가 가까이 다가오고 C가 휴대폰으로 촬영하는 상황이 있었습니다. 14시 30분쯤 단체 채팅방에 영상이 공유되었고, 친구 A에게 말한 뒤 담임 선생님에게 상담을 요청했습니다. 목격자 D가 계단 위쪽에서 일부 장면을 봤다고 합니다.',
  'in_review',
  true,
  now()
) on conflict (id) do update
set memo = excluded.memo,
    status = excluded.status,
    synthetic = excluded.synthetic,
    submitted_at = excluded.submitted_at,
    deletion_requested_at = null,
    purge_at = null,
    updated_at = now();

insert into public.assignments(id, case_id, counselor_id, assigned_by)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002')
on conflict (id) do update
set case_id = excluded.case_id,
    counselor_id = excluded.counselor_id,
    assigned_by = excluded.assigned_by;

insert into public.fact_blocks(id, case_id, sequence, occurred_at, location, actor, target, action, confirmed)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, '2024-05-10T14:20:00+09:00', '학교 2층 복도', '가해 학생 B(익명)', '피해 학생(익명)', '모욕성 발언을 했다는 진술', true),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 2, '2024-05-10T14:25:00+09:00', '학교 계단 앞', '가해 학생 B, 참여 학생 C(익명)', '피해 학생(익명)', 'B가 접근하고 C가 촬영한 정황', true),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 3, '2024-05-10T14:30:00+09:00', '3학년 단체 채팅방', '참여 학생 C, 방장 E(익명)', '피해 학생(익명)', '촬영 영상이 단체 채팅방에 공유된 정황', true),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 4, '2024-05-10T14:36:00+09:00', '교실 뒤쪽', '피해 학생(익명)', '친구 A(익명)', '피해 학생이 친구 A에게 상황을 설명', true),
  ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 5, '2024-05-10T15:10:00+09:00', '계단 위쪽', '목격자 D(익명)', '피해 학생, B, C(익명)', '목격자 D가 계단 앞 상황 일부를 봤다고 진술', true),
  ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 6, '2024-05-10T15:35:00+09:00', '상담실', '피해 학생, 친구 A(익명)', '담임 선생님(익명)', '상담 요청과 보호자 공유 필요 사항 기록', true)
on conflict (id) do update
set sequence = excluded.sequence,
    occurred_at = excluded.occurred_at,
    location = excluded.location,
    actor = excluded.actor,
    target = excluded.target,
    action = excluded.action,
    confirmed = excluded.confirmed;

insert into public.people(id, case_id, anonymous_label, relation, tone, position_x, position_y, position_locked)
values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', E'피해 학생\n(익명)', '본인', 'primary', 50, 54, true),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', E'가해 학생 B\n(익명)', '주요 행위자', 'danger', 78, 34, true),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', E'참여 학생 C\n(익명)', '촬영·전달 후보', 'danger', 78, 62, true),
  ('70000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', E'방장 E\n(익명)', '채팅방 관리', 'neutral', 62, 82, true),
  ('70000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', E'목격자 D\n(익명)', '목격 후보', 'neutral', 34, 24, true),
  ('70000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', E'친구 A\n(익명)', '동행·지지', 'support', 24, 68, true),
  ('70000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', E'담임 선생님\n(익명)', '상담·보호', 'support', 22, 42, true),
  ('70000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', E'보호자 G\n(익명)', '보호자 공유', 'support', 46, 88, true)
on conflict (id) do update
set anonymous_label = excluded.anonymous_label,
    relation = excluded.relation,
    tone = excluded.tone,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    position_locked = excluded.position_locked;

insert into public.relations(id, case_id, from_person_id, to_person_id, label, indirect)
values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '모욕 발언 주장', false),
  ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', '촬영 지시·동조 후보', false),
  ('80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '촬영 정황', false),
  ('80000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004', '영상 전달 후보', false),
  ('80000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', '단체방 유포 경로', true),
  ('80000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', '피해 사실 공유', false),
  ('80000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000007', '상담 동행', false),
  ('80000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', '목격 진술 후보', true),
  ('80000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000001', '보호 조치 안내', false),
  ('80000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000008', '보호자 공유 필요', true)
on conflict (id) do update
set from_person_id = excluded.from_person_id,
    to_person_id = excluded.to_person_id,
    label = excluded.label,
    indirect = excluded.indirect;

insert into public.evidence_assets(id, case_id, file_name, mime_type, size_bytes, kind, storage_path, synthetic, processing_status, extracted_text)
values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'chat-capture-001.svg', 'image/svg+xml', 2650, 'image', '30000000-0000-0000-0000-000000000001/chat-capture-001.svg', true, 'completed', '단체 채팅방 대화 캡처 OCR 후보: B, C, 방장 E, 14:29-14:31'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'stair-location-map-002.svg', 'image/svg+xml', 2419, 'image', '30000000-0000-0000-0000-000000000001/stair-location-map-002.svg', true, 'completed', '2층 복도와 계단 앞 동선 도면'),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'stair-video-003.webm', 'video/webm', 309595, 'video', '30000000-0000-0000-0000-000000000001/stair-video-003.webm', true, 'manual_review', '합성 영상 자료: B 접근, C 촬영 정황, 채팅방 공유 후보'),
  ('60000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'chat-share-003.svg', 'image/svg+xml', 2267, 'image', '30000000-0000-0000-0000-000000000001/chat-share-003.svg', true, 'completed', '영상 공유 메시지 캡처 OCR 후보'),
  ('60000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'teacher-note-004.txt', 'text/plain', 748, 'document', '30000000-0000-0000-0000-000000000001/teacher-note-004.txt', true, 'manual_review', '상담 교사 메모: 확인할 자료와 보호 조치 후보'),
  ('60000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'witness-memo-005.txt', 'text/plain', 517, 'document', '30000000-0000-0000-0000-000000000001/witness-memo-005.txt', true, 'manual_review', '목격자 D 메모 후보'),
  ('60000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', 'timeline-board-006.svg', 'image/svg+xml', 3271, 'image', '30000000-0000-0000-0000-000000000001/timeline-board-006.svg', true, 'completed', '사건 타임라인 보드')
on conflict (id) do update
set file_name = excluded.file_name,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    kind = excluded.kind,
    storage_path = excluded.storage_path,
    synthetic = excluded.synthetic,
    processing_status = excluded.processing_status,
    extracted_text = excluded.extracted_text,
    deleted_at = null;

delete from public.fact_block_evidence
where fact_block_id in (
  select id from public.fact_blocks
  where case_id = '30000000-0000-0000-0000-000000000001'
);

insert into public.fact_block_evidence(fact_block_id, evidence_id)
values
  ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000007'),
  ('50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000007'),
  ('50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000007'),
  ('50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000005'),
  ('50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000006'),
  ('50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000007'),
  ('50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000005'),
  ('50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000007')
on conflict (fact_block_id, evidence_id) do nothing;

insert into public.missing_questions(id, case_id, fact_block_id, field, prompt, answer, resolved)
values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'actor', '단체 채팅방에 함께 있던 학생이 더 있었나요? 방장 E 외 확인 가능한 참여자가 있나요?', null, false),
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'evidence', '촬영된 영상의 원본 파일을 누가 보관하고 있나요?', '합성 영상 증거 stair-video-003.webm 연결 완료', true),
  ('90000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'location', '목격자 D가 서 있던 정확한 위치와 주변 학생 수를 확인할 수 있나요?', null, false),
  ('90000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000006', 'evidence', '상담실 방문 뒤 보호자에게 공유된 시각이나 추가 메모가 있나요?', null, false)
on conflict (id) do update
set fact_block_id = excluded.fact_block_id,
    field = excluded.field,
    prompt = excluded.prompt,
    answer = excluded.answer,
    resolved = excluded.resolved;

insert into public.audit_logs(id, institution_id, actor_id, action, target_type, target_id)
values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'case.submitted', 'case', '30000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
