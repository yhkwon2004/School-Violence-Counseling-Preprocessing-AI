import { processEvidenceJob } from '../_shared/evidence-processing.ts';
import { handleOptions, json } from '../_shared/http.ts';
import type { EvidenceRow } from '../_shared/openai.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    if (request.method !== 'POST') return json({ message: 'POST 요청만 지원합니다.' }, 405);
    if (!Deno.env.get('PROCESS_RETRY_CRON_SECRET') || request.headers.get('x-cron-secret') !== Deno.env.get('PROCESS_RETRY_CRON_SECRET')) {
      return json({ message: '권한이 없습니다.' }, 401);
    }

    const admin = adminClient();
    const { data: jobs, error } = await admin
      .rpc('reserve_retryable_evidence_jobs', { limit_input: 20 });
    if (error) throw error;

    for (const job of jobs ?? []) {
      const { data: asset, error: assetError } = await admin
        .from('evidence_assets')
        .select('*')
        .eq('id', job.evidence_id)
        .single();
      if (assetError || !asset) throw assetError ?? new Error('증거 파일을 찾을 수 없습니다.');
      EdgeRuntime.waitUntil(processEvidenceJob(job.id, asset as EvidenceRow));
    }
    return json({ retried: jobs?.length ?? 0 }, 202);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '재시도 접수에 실패했습니다.' }, 400);
  }
});
