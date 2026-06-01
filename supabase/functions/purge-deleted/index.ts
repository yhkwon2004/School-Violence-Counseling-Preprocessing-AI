import { handleOptions, json } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return json({ message: 'POST 요청만 지원합니다.' }, 405);
  const cronSecret = Deno.env.get('PURGE_CRON_SECRET');
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) return json({ message: '권한이 없습니다.' }, 401);

  const admin = adminClient();
  const { data: cases, error } = await admin.rpc('cases_ready_for_purge', { limit_input: 20 });
  if (error) return json({ message: error.message }, 400);

  for (const caseRecord of cases ?? []) {
    const { data: assets, error: assetError } = await admin.from('evidence_assets').select('storage_path').eq('case_id', caseRecord.id);
    if (assetError) {
      await releasePurgeClaim(caseRecord.id);
      return json({ message: assetError.message }, 400);
    }
    const paths = (assets ?? []).map((asset) => asset.storage_path);
    if (paths.length) {
      const { error: storageError } = await admin.storage.from('case-evidence').remove(paths);
      if (storageError) {
        await releasePurgeClaim(caseRecord.id);
        return json({ message: storageError.message }, 400);
      }
    }
    const { error: finalizeError } = await admin.rpc('finalize_case_purge', {
      case_id_input: caseRecord.id,
      purge_reason_input: caseRecord.purge_reason,
    });
    if (finalizeError) {
      await releasePurgeClaim(caseRecord.id);
      return json({ message: finalizeError.message }, 400);
    }
  }
  return json({ purged: cases?.length ?? 0 });

  async function releasePurgeClaim(caseId: string) {
    await admin.rpc('release_case_purge_claim', { case_id_input: caseId });
  }
});
