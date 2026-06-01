import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, publishableKey } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;
  try {
    const { loginId, password } = await request.json();
    const admin = adminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, institution_id, display_name, auth_email, active')
      .eq('student_login_id', String(loginId).trim().toUpperCase())
      .eq('role', 'student')
      .single();
    if (error || !profile?.active) return json({ message: '학생 ID 또는 비밀번호를 확인해 주세요.' }, 401);
    const { data: institution } = await admin.from('institutions').select('active').eq('id', profile.institution_id).eq('active', true).single();
    if (!institution) return json({ message: '학생 ID 또는 비밀번호를 확인해 주세요.' }, 401);

    const auth = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey());
    const result = await auth.auth.signInWithPassword({ email: profile.auth_email, password });
    if (result.error) return json({ message: '학생 ID 또는 비밀번호를 확인해 주세요.' }, 401);
    return json({
      session: result.data.session,
      profile: {
        id: profile.id,
        institutionId: profile.institution_id,
        displayName: profile.display_name,
        role: 'student',
      },
    });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '로그인 처리에 실패했습니다.' }, 400);
  }
});
