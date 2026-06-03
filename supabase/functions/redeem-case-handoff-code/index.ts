import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { handoffPepper, hashHandoffCode } from '../_shared/handoff.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    const user = await requireUser(request);
    const { code } = await request.json();
    const admin = adminClient();
    await requireRole(admin, user.id, ['counselor', 'institution_admin']);
    const codeHash = await hashHandoffCode(String(code ?? ''), handoffPepper());
    const { data, error } = await admin.rpc('redeem_case_handoff_code', {
      code_hash_input: codeHash,
      actor_id_input: user.id,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.case_id) throw new Error('인계 코드를 확인할 수 없습니다.');
    return json({
      caseId: result.case_id,
      assignmentId: result.assignment_id,
      status: result.status,
    });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '인계 코드를 확인할 수 없습니다.' }, 400);
  }
});
