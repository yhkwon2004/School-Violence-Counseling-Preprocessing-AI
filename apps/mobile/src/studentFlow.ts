const editableStatuses = new Set(['draft', 'analyzing', 'student_review', 'reopened']);

export function isStudentCaseEditable(status: string) {
  return editableStatuses.has(status);
}

export function shouldShowLockedStudentCase(status: string) {
  return !isStudentCaseEditable(status);
}

export function shouldRequireAnalysisAfterRestore(
  serverMemo: string,
  restoredMemo: string | null,
  factCount: number,
) {
  return factCount === 0 || (restoredMemo !== null && restoredMemo !== serverMemo);
}

export function shouldRestoreDeviceDraft(
  serverMemo: string,
  serverUpdatedAt: string,
  draft: { memo: string; updatedAt: string } | null,
) {
  if (!draft) return false;
  if (draft.memo === serverMemo) return true;
  const serverUpdatedAtMs = Date.parse(serverUpdatedAt);
  const draftUpdatedAtMs = Date.parse(draft.updatedAt);
  return !Number.isNaN(serverUpdatedAtMs)
    && !Number.isNaN(draftUpdatedAtMs)
    && draftUpdatedAtMs > serverUpdatedAtMs;
}

export type StudentSubmitBlockReason = 'analysis_required' | 'evidence_processing' | null;

export function studentSubmitBlockReason(
  analysisRequired: boolean,
  factCount: number,
  evidenceStatuses: Array<string | undefined>,
): StudentSubmitBlockReason {
  if (analysisRequired || factCount === 0) return 'analysis_required';
  if (evidenceStatuses.some((status) => status === 'queued' || status === 'processing')) return 'evidence_processing';
  return null;
}

export function shouldBlockAnalysisStepAdvance(
  analysisRequired: boolean,
  analyzing: boolean,
  factCount: number,
) {
  return analyzing || analysisRequired || factCount === 0;
}
