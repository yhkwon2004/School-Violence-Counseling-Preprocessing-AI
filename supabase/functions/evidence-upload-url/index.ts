import { handleOptions, json } from '../_shared/http.ts';
import { adminClient, requireActiveProfile, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    if (request.method !== 'POST') return json({ message: 'POST 요청만 지원합니다.' }, 405);
    const user = await requireUser(request);
    const { caseId, fileName, mimeType, sizeBytes, kind, durationSeconds } = await request.json();
    const normalizedFileName = String(fileName ?? '').trim();
    const normalizedMimeType = String(mimeType ?? 'application/octet-stream').trim().toLowerCase();
    const normalizedSize = Number(sizeBytes);
    const normalizedDuration = durationSeconds == null ? null : Number(durationSeconds);
    if (!normalizedFileName) throw new Error('파일 이름이 필요합니다.');
    if (!Number.isFinite(normalizedSize) || normalizedSize < 0) throw new Error('파일 크기를 확인할 수 없습니다.');
    if (normalizedDuration !== null && (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0)) {
      throw new Error('음성 길이를 확인할 수 없습니다.');
    }
    const inferredKind = evidenceKind(normalizedMimeType, normalizedFileName);
    if (kind !== inferredKind) throw new Error('파일 유형이 일치하지 않습니다.');
    const admin = adminClient();
    const { data: caseRecord } = await admin.from('cases').select('id, student_id, institution_id, status, synthetic').eq('id', caseId).single();
    if (!caseRecord) throw new Error('사건을 찾을 수 없습니다.');
    const profile = await requireActiveProfile(admin, user.id);
    const allowed = profile?.role === 'platform_admin'
      || (profile?.institution_id === caseRecord.institution_id && (profile.role !== 'student' || caseRecord.student_id === user.id));
    if (!allowed) throw new Error('업로드 권한이 없습니다.');
    if (caseRecord.status === 'deletion_scheduled') throw new Error('삭제 요청된 사건에는 파일을 추가할 수 없습니다.');
    if (profile?.role === 'student' && !['draft', 'analyzing', 'student_review', 'reopened'].includes(caseRecord.status)) {
      throw new Error('제출된 기록은 상담자가 재개방한 뒤 파일을 추가할 수 있습니다.');
    }
    const { data: settings } = await admin
      .from('institution_settings')
      .select('max_files_per_case, max_file_size_bytes')
      .eq('institution_id', caseRecord.institution_id)
      .single();
    if (!settings) throw new Error('기관 파일 정책을 찾을 수 없습니다.');
    if (normalizedSize > settings.max_file_size_bytes) throw new Error(`파일당 최대 크기는 ${settings.max_file_size_bytes}바이트입니다.`);
    const { count } = await admin.from('evidence_assets').select('*', { count: 'exact', head: true }).eq('case_id', caseId).is('deleted_at', null);
    if ((count ?? 0) >= settings.max_files_per_case) throw new Error(`사건당 파일은 최대 ${settings.max_files_per_case}개입니다.`);
    const path = `${caseId}/${crypto.randomUUID()}-${normalizedFileName.replaceAll('/', '_')}`;
    const { data: upload, error: uploadError } = await admin.storage.from('case-evidence').createSignedUploadUrl(path);
    if (uploadError) throw uploadError;
    const { data: asset, error } = await admin.from('evidence_assets').insert({
      case_id: caseId, file_name: normalizedFileName, mime_type: normalizedMimeType, size_bytes: normalizedSize,
      kind: inferredKind, storage_path: path, synthetic: caseRecord.synthetic, duration_seconds: normalizedDuration,
    }).select().single();
    if (error) throw error;
    return json({ asset, signedUrl: upload.signedUrl, token: upload.token }, 201);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '업로드 URL을 만들 수 없습니다.' }, 400);
  }
});

function evidenceKind(mimeType: string, fileName: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('text/') || mimeType.includes('document') || mimeType.includes('sheet') || mimeType.includes('presentation')) return 'document';
  return 'other';
}
