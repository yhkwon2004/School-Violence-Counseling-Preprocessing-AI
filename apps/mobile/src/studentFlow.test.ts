import { describe, expect, it } from 'vitest';
import {
  isStudentCaseEditable,
  shouldRequireAnalysisAfterRestore,
  shouldShowLockedStudentCase,
  shouldBlockAnalysisStepAdvance,
  studentSubmitBlockReason,
} from './studentFlow';

describe('studentFlow', () => {
  it('keeps drafts and counselor-reopened cases editable for the student', () => {
    expect(isStudentCaseEditable('draft')).toBe(true);
    expect(isStudentCaseEditable('analyzing')).toBe(true);
    expect(isStudentCaseEditable('student_review')).toBe(true);
    expect(isStudentCaseEditable('reopened')).toBe(true);
  });

  it('shows submitted and counselor workflow states as locked', () => {
    expect(shouldShowLockedStudentCase('submitted')).toBe(true);
    expect(shouldShowLockedStudentCase('assigned')).toBe(true);
    expect(shouldShowLockedStudentCase('in_review')).toBe(true);
    expect(shouldShowLockedStudentCase('completed')).toBe(true);
  });

  it('requires fresh analysis when facts are missing or a device draft is newer than the server memo', () => {
    expect(shouldRequireAnalysisAfterRestore('server memo', null, 0)).toBe(true);
    expect(shouldRequireAnalysisAfterRestore('server memo', 'device memo', 2)).toBe(true);
    expect(shouldRequireAnalysisAfterRestore('same memo', 'same memo', 2)).toBe(false);
  });

  it('blocks submission until facts and evidence processing are ready', () => {
    expect(studentSubmitBlockReason(true, 1, ['completed'])).toBe('analysis_required');
    expect(studentSubmitBlockReason(false, 0, ['completed'])).toBe('analysis_required');
    expect(studentSubmitBlockReason(false, 1, ['queued'])).toBe('evidence_processing');
    expect(studentSubmitBlockReason(false, 1, ['processing'])).toBe('evidence_processing');
    expect(studentSubmitBlockReason(false, 1, ['completed', 'manual_review', 'failed'])).toBe(null);
  });

  it('keeps the analysis step in place until FactBlock candidates are ready', () => {
    expect(shouldBlockAnalysisStepAdvance(true, false, 1)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(false, true, 1)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(false, false, 0)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(false, false, 1)).toBe(false);
  });
});
