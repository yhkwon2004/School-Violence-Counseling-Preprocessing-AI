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
on conflict (id) do nothing;

insert into public.institution_settings(institution_id)
values ('20000000-0000-0000-0000-000000000001')
on conflict (institution_id) do nothing;

insert into public.profiles(id, institution_id, role, display_name, student_login_id, auth_email)
values
  ('10000000-0000-0000-0000-000000000001', null, 'platform_admin', '플랫폼 관리자', null, 'platform@ieumlog.demo'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'institution_admin', '김 기관관리자', null, 'admin@wee.demo'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'counselor', '박 상담자', null, 'counselor@wee.demo'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'student', '학생 24-0510', 'WEE-24-0510', 'wee-24-0510@students.ieumlog.invalid')
on conflict (id) do nothing;

insert into public.cases(id, institution_id, student_id, anonymous_label, memo, status, synthetic, submitted_at)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004',
  '학생 24-0510',
  '2024년 5월 10일 학교 2층 복도에서 가해 학생 B가 욕설을 했습니다. 이후 계단에서 B와 C가 밀치고 촬영했습니다. 단톡방에 영상이 올라왔습니다.',
  'in_review',
  true,
  now()
) on conflict (id) do nothing;

insert into public.assignments(id, case_id, counselor_id, assigned_by)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.fact_blocks(id, case_id, sequence, occurred_at, location, actor, target, action, confirmed)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, '2024-05-10T14:20:00+09:00', '학교 2층 복도', '가해 학생 B(익명)', '피해 학생(익명)', '욕설을 들었다', true),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 2, '2024-05-10T14:25:00+09:00', '학교 계단', '가해 학생 B, 참여 학생 C(익명)', '피해 학생(익명)', '밀치고 촬영했다', true),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 3, '2024-05-10T14:30:00+09:00', '3학년 단체 채팅방', '참여 학생 C(익명)', '피해 학생(익명)', '촬영 영상을 단체 채팅방에 업로드했다', true)
on conflict (id) do nothing;

insert into public.people(id, case_id, anonymous_label, relation, tone, position_x, position_y, position_locked)
values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', E'피해 학생\n(익명)', '본인', 'primary', 50, 50, true),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', E'가해 학생 B\n(익명)', '가해', 'danger', 78, 38, true),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', E'참여 학생 C\n(익명)', '함께 있음', 'neutral', 76, 70, true),
  ('70000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', E'친구 A\n(익명)', '친구', 'support', 24, 68, true),
  ('70000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', E'학교 선생님\n(익명)', '지도', 'support', 22, 34, true)
on conflict (id) do nothing;

insert into public.relations(id, case_id, from_person_id, to_person_id, label, indirect)
values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '가해', false),
  ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '함께 있음', false),
  ('80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', '친구', false),
  ('80000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', '지도', true)
on conflict (id) do nothing;

insert into public.evidence_assets(id, case_id, file_name, mime_type, size_bytes, kind, storage_path, synthetic, processing_status, extracted_text)
values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '캡처_001.png', 'image/png', 823000, 'image', '30000000-0000-0000-0000-000000000001/캡처_001.png', true, 'completed', '단체 채팅방 욕설 캡처'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '영상_002.mp4', 'video/mp4', 4120000, 'video', '30000000-0000-0000-0000-000000000001/영상_002.mp4', true, 'manual_review', null)
on conflict (id) do nothing;

insert into public.fact_block_evidence(fact_block_id, evidence_id)
values
  ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002')
on conflict (fact_block_id, evidence_id) do nothing;

insert into public.missing_questions(id, case_id, fact_block_id, field, prompt)
values ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'actor', '단체 채팅방에 함께 있던 학생이 더 있었나요?')
on conflict (id) do nothing;

insert into public.audit_logs(id, institution_id, actor_id, action, target_type, target_id)
values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'case.submitted', 'case', '30000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
