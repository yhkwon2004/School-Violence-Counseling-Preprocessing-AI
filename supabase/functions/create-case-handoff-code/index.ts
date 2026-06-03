import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { createPlainHandoffCode, handoffPepper, hashHandoffCode } from '../_shared/handoff.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

const HANDOFF_TTL_HOURS = 24;
const allowedStatuses = new Set(['submitted', 'assigned', 'in_review', 'completed']);

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    const user = await requireUser(request);
    const { caseId } = await request.json();
    const admin = adminClient();
    const profile = await requireRole(admin, user.id, ['student']);
    const { data: caseRecord, error } = await admin
      .from('cases')
      .select('id, institution_id, student_id, status')
      .eq('id', caseId)
      .single();
    if (error || !caseRecord) throw error ?? new Error('사건을 찾을 수 없습니다.');
    if (caseRecord.student_id !== user.id || caseRecord.institution_id !== profile.institution_id) {
      return json({ message: '본인 사건에 대해서만 인계 코드를 만들 수 있습니다.' }, 403);
    }
    if (!allowedStatuses.has(caseRecord.status)) {
      return json({ message: '제출 완료 후에만 인계 코드를 만들 수 있습니다.' }, 409);
    }

    await admin
      .from('case_handoff_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('case_id', caseId)
      .is('redeemed_at', null)
      .is('revoked_at', null);

    const code = createPlainHandoffCode();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: inserted, error: insertError } = await admin
      .from('case_handoff_codes')
      .insert({
        case_id: caseId,
        institution_id: caseRecord.institution_id,
        created_by: user.id,
        code_hash: await hashHandoffCode(code, handoffPepper()),
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (insertError || !inserted) throw insertError ?? new Error('인계 코드를 만들 수 없습니다.');

    await admin.from('audit_logs').insert({
      institution_id: caseRecord.institution_id,
      actor_id: user.id,
      action: 'case.handoff_code_created',
      target_type: 'case',
      target_id: caseId,
      metadata: { handoff_code_id: inserted.id, expires_at: expiresAt },
    });
    return json({ code, expiresAt });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '인계 코드를 만들 수 없습니다.' }, 400);
  }
});
