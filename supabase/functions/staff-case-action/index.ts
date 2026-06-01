import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

const targetStatus = {
  review: 'in_review',
  reopen: 'reopened',
  complete: 'completed',
} as const;

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    const user = await requireUser(request);
    const { caseId, action } = await request.json();
    const admin = adminClient();
    const actor = await requireRole(admin, user.id, ['counselor', 'institution_admin', 'platform_admin']);
    if (!(action in targetStatus)) return json({ message: '지원하지 않는 사건 작업입니다.' }, 400);
    const { data: caseRecord, error } = await admin.from('cases').select('id, institution_id, status').eq('id', caseId).single();
    if (error || !caseRecord) throw error ?? new Error('사건을 찾을 수 없습니다.');
    if (actor.role !== 'platform_admin' && actor.institution_id !== caseRecord.institution_id) {
      return json({ message: '사건을 변경할 권한이 없습니다.' }, 403);
    }
    if (actor.role === 'counselor') {
      const { count } = await admin
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('counselor_id', user.id)
        .eq('active', true);
      if (!count) return json({ message: '배정된 상담자만 사건을 변경할 수 있습니다.' }, 403);
    }
    if (action === 'review' && caseRecord.status !== 'assigned') {
      return json({ message: '배정된 사건만 검토를 시작할 수 있습니다.' }, 409);
    }
    if (action === 'complete' && caseRecord.status !== 'in_review') {
      return json({ message: '검토 중인 사건만 완료할 수 있습니다.' }, 409);
    }
    if (action === 'reopen' && !['submitted', 'assigned', 'in_review', 'completed'].includes(caseRecord.status)) {
      return json({ message: '삭제 예약 또는 이미 재개방된 사건은 재개방할 수 없습니다.' }, 409);
    }

    const status = targetStatus[action as keyof typeof targetStatus];
    const { error: updateError } = await admin.from('cases').update({ status }).eq('id', caseId);
    if (updateError) throw updateError;
    await admin.from('audit_logs').insert({
      institution_id: caseRecord.institution_id,
      actor_id: user.id,
      action: action === 'review' ? 'case.review_started' : action === 'reopen' ? 'case.reopened' : 'case.completed',
      target_type: 'case',
      target_id: caseId,
    });
    return json({ status });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '사건 작업을 처리할 수 없습니다.' }, 400);
  }
});
