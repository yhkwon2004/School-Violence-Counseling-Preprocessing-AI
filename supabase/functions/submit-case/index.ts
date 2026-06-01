import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { requestClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    await requireUser(request);
    const { caseId, memo } = await request.json();
    const { data, error } = await requestClient(request).rpc('submit_case_record', {
      case_id_input: caseId,
      memo_input: String(memo ?? ''),
    });
    if (error) throw error;
    return json({ status: data.status, submittedAt: data.submitted_at });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '기록을 제출할 수 없습니다.';
    return json({ message }, 400);
  }
});
