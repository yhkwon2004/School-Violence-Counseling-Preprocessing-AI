import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

type PositionInput = {
  id?: string;
  x?: number;
  y?: number;
  locked?: boolean;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    const user = await requireUser(request);
    const { caseId, positions } = await request.json() as { caseId?: string; positions?: PositionInput[] };
    if (!caseId || !Array.isArray(positions)) return json({ message: '저장할 관계도 위치가 없습니다.' }, 400);
    const admin = adminClient();
    const actor = await requireRole(admin, user.id, ['counselor', 'institution_admin', 'platform_admin']);
    const { data: caseRecord, error } = await admin
      .from('cases')
      .select('id, institution_id, status')
      .eq('id', caseId)
      .single();
    if (error || !caseRecord) throw error ?? new Error('사건을 찾을 수 없습니다.');
    if (actor.role !== 'platform_admin' && actor.institution_id !== caseRecord.institution_id) {
      return json({ message: '관계도 배치를 저장할 권한이 없습니다.' }, 403);
    }
    if (caseRecord.status === 'deletion_scheduled') {
      return json({ message: '삭제 예정 사건은 관계도 배치를 저장할 수 없습니다.' }, 409);
    }

    for (const position of positions.slice(0, 100)) {
      if (!position.id || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
      const { error: updateError } = await admin
        .from('people')
        .update({
          position_x: clamp(position.x),
          position_y: clamp(position.y),
          position_locked: position.locked ?? true,
        })
        .eq('id', position.id)
        .eq('case_id', caseId);
      if (updateError) throw updateError;
    }

    await admin.from('audit_logs').insert({
      institution_id: caseRecord.institution_id,
      actor_id: user.id,
      action: 'relation.layout_saved',
      target_type: 'case',
      target_id: caseId,
      metadata: { node_count: positions.length },
    });
    return json({ saved: positions.length });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '관계도 배치를 저장할 수 없습니다.' }, 400);
  }
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}
