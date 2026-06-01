import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requireActiveProfile, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;
  try {
    const user = await requireUser(request);
    const { evidenceId } = await request.json();
    const admin = adminClient();
    const { data: asset } = await admin.from('evidence_assets').select('storage_path, case_id, deleted_at').eq('id', evidenceId).single();
    if (!asset || asset.deleted_at) throw new Error('증거 파일을 찾을 수 없습니다.');
    const { data: caseRecord } = await admin.from('cases').select('student_id, institution_id').eq('id', asset.case_id).single();
    const profile = await requireActiveProfile(admin, user.id);
    const allowed = profile?.role === 'platform_admin'
      || (profile?.institution_id === caseRecord?.institution_id && (profile.role !== 'student' || caseRecord?.student_id === user.id));
    if (!allowed) throw new Error('다운로드 권한이 없습니다.');
    const { data, error } = await admin.storage.from('case-evidence').createSignedUrl(asset.storage_path, 60);
    if (error) throw error;
    return json({ signedUrl: data.signedUrl });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '다운로드 URL을 만들 수 없습니다.' }, 400);
  }
});
