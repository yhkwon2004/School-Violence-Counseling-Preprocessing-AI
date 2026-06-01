import { processEvidenceJob } from '../_shared/evidence-processing.ts';
import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requestClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    await requireUser(request);
    const { evidenceId } = await request.json();
    const admin = adminClient();
    const { data: asset, error } = await requestClient(request)
      .from('evidence_assets')
      .select('*')
      .eq('id', evidenceId)
      .single();
    if (error || !asset) throw error ?? new Error('증거 파일을 찾을 수 없습니다.');

    const { data: reservation, error: reservationError } = await admin
      .rpc('reserve_evidence_processing', { evidence_id_input: evidenceId });
    if (reservationError || !reservation?.job) throw reservationError ?? new Error('분석 작업을 접수할 수 없습니다.');

    if (reservation.created) EdgeRuntime.waitUntil(processEvidenceJob(reservation.job.id, asset));
    return json({ job: reservation.job }, 202);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '분석 작업을 접수할 수 없습니다.' }, 400);
  }
});
