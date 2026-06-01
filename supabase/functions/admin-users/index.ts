import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['GET', 'POST', 'PATCH']);
  if (unsupportedMethod) return unsupportedMethod;
  try {
    const user = await requireUser(request);
    const admin = adminClient();
    const actor = await requireRole(admin, user.id, ['institution_admin', 'platform_admin']);
    if (request.method === 'GET') {
      const query = admin.from('profiles').select('id, institution_id, role, display_name, student_login_id, auth_email, active');
      const { data, error } = actor.role === 'platform_admin' ? await query : await query.eq('institution_id', actor.institution_id);
      if (error) throw error;
      return json({ profiles: data });
    }

    const body = await request.json();
    if (request.method === 'PATCH') {
      const { data: target, error: targetError } = await admin
        .from('profiles')
        .select('id, institution_id, role, active')
        .eq('id', body.id)
        .single();
      if (targetError || !target) throw targetError ?? new Error('사용자를 찾을 수 없습니다.');
      if (actor.role !== 'platform_admin' && (
        target.institution_id !== actor.institution_id || !['student', 'counselor'].includes(target.role)
      )) {
        return json({ message: '이 사용자의 상태를 변경할 권한이 없습니다.' }, 403);
      }
      if (typeof body.active !== 'boolean') return json({ message: '활성 상태가 필요합니다.' }, 400);
      const { data, error } = await admin.from('profiles').update({ active: body.active }).eq('id', body.id).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({
        institution_id: target.institution_id,
        actor_id: user.id,
        action: 'profile.active_updated',
        target_type: 'profile',
        target_id: body.id,
        metadata: { active: body.active },
      });
      return json({ profile: data });
    }
    const institutionId = actor.role === 'platform_admin' ? body.institutionId : actor.institution_id;
    const role = body.role as string;
    if (actor.role !== 'platform_admin' && !['student', 'counselor'].includes(role)) {
      return json({ message: '기관 관리자는 학생과 상담자 계정만 만들 수 있습니다.' }, 403);
    }
    const { data: institution } = await admin.from('institutions').select('active').eq('id', institutionId).eq('active', true).single();
    if (!institution) return json({ message: '활성 기관에만 사용자를 발급할 수 있습니다.' }, 409);
    const loginId = role === 'student' ? String(body.loginId).trim().toUpperCase() : null;
    const email = role === 'student'
      ? `${loginId.toLowerCase()}@students.ieumlog.invalid`
      : String(body.email).trim().toLowerCase();
    const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error('계정을 만들 수 없습니다.');
    const { data, error } = await admin.from('profiles').insert({
      id: created.data.user.id,
      institution_id: institutionId,
      role,
      display_name: body.displayName,
      student_login_id: loginId,
      auth_email: email,
    }).select().single();
    if (error) throw error;
    return json({ profile: data }, 201);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '사용자 처리에 실패했습니다.' }, 400);
  }
});
