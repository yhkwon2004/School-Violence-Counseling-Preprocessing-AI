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
    const profile = await requireActiveProfile(admin, user.id);
    if (profile.role !== 'student') throw new Error('업로드 정리 권한이 없습니다.');

    const { data: reservation, error: reservationError } = await admin.rpc('begin_evidence_upload_discard', {
      evidence_id_input: evidenceId,
      student_id_input: user.id,
    });
    if (reservationError || !reservation?.storagePath) {
      throw reservationError ?? new Error('업로드 정리 예약을 만들 수 없습니다.');
    }

    const { error: storageError } = await admin.storage.from('case-evidence').remove([reservation.storagePath]);
    if (storageError) {
      await admin.rpc('cancel_evidence_upload_discard', {
        evidence_id_input: evidenceId,
        student_id_input: user.id,
      });
      throw storageError;
    }

    const { data: discarded, error: discardError } = await admin.rpc('finalize_evidence_upload_discard', {
      evidence_id_input: evidenceId,
      student_id_input: user.id,
    });
    if (discardError) throw discardError;
    return json({ discarded });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '업로드 예약을 정리할 수 없습니다.' }, 400);
  }
});
