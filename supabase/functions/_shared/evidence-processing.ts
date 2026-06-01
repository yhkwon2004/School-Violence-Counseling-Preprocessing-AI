import { analyzeEvidence, type EvidenceRow } from './openai.ts';
import { adminClient } from './supabase.ts';

export async function processEvidenceJob(jobId: string, asset: EvidenceRow) {
  const admin = adminClient();
  const { data: job, error: readError } = await admin
    .from('processing_jobs')
    .select('attempts')
    .eq('id', jobId)
    .single();
  if (readError) throw readError;

  try {
    await admin.from('processing_jobs').update({
      status: 'processing',
      attempts: job.attempts + 1,
      message: '분석 중',
      started_at: new Date().toISOString(),
      finished_at: null,
    }).eq('id', jobId);
    await admin.from('evidence_assets').update({ processing_status: 'processing' }).eq('id', asset.id);
    const { data: signed, error } = await admin.storage.from('case-evidence').createSignedUrl(asset.storage_path, 300);
    if (error) throw error;
    const result = await analyzeEvidence(asset, signed.signedUrl);
    await admin.from('evidence_assets').update({ processing_status: result.status, extracted_text: result.extractedText }).eq('id', asset.id);
    await admin.from('processing_jobs').update({ status: result.status, message: result.message, finished_at: new Date().toISOString() }).eq('id', jobId);
  } catch (error) {
    await admin.from('evidence_assets').update({ processing_status: 'failed' }).eq('id', asset.id);
    await admin.from('processing_jobs').update({
      status: 'failed',
      message: error instanceof Error ? error.message : '분석 실패',
      finished_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}
