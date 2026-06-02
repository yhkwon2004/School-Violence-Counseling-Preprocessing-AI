import { describe, expect, it } from 'vitest';
import {
  isStudentCaseEditable,
  mergeQuestionAnswerDrafts,
  nextQuestionSaveVersion,
  questionSaveBlockReason,
  retainQuestionValues,
  shouldApplyQuestionSaveResult,
  shouldRequireAnalysisAfterRestore,
  shouldRestoreDeviceDraft,
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

  it('restores same-content progress or a newer device memo without replacing a newer server memo', () => {
    const serverUpdatedAt = '2026-06-01T12:00:00.000Z';
    expect(shouldRestoreDeviceDraft('server memo', serverUpdatedAt, null)).toBe(false);
    expect(shouldRestoreDeviceDraft('same memo', serverUpdatedAt, {
      memo: 'same memo',
      updatedAt: '2026-06-01T11:00:00.000Z',
    })).toBe(true);
    expect(shouldRestoreDeviceDraft('server memo', serverUpdatedAt, {
      memo: 'newer device memo',
      updatedAt: '2026-06-01T12:00:01.000Z',
    })).toBe(true);
    expect(shouldRestoreDeviceDraft('server memo', serverUpdatedAt, {
      memo: 'stale device memo',
      updatedAt: '2026-06-01T11:59:59.000Z',
    })).toBe(false);
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

  it('hydrates question answers without overwriting an in-progress local draft', () => {
    expect(mergeQuestionAnswerDrafts({}, [
      { id: 'question-1', answer: '서버 답변' },
      { id: 'question-2', answer: null },
    ])).toEqual({
      'question-1': '서버 답변',
      'question-2': '',
    });
    expect(mergeQuestionAnswerDrafts({
      'question-1': '입력 중인 답변',
      'removed-question': '정리 대상',
    }, [
      { id: 'question-1', answer: '이전 서버 답변' },
      { id: 'question-2', answer: '새 서버 답변' },
    ])).toEqual({
      'question-1': '입력 중인 답변',
      'question-2': '새 서버 답변',
    });
  });

  it('retains save metadata for visible questions only', () => {
    expect(retainQuestionValues({
      'question-1': 'saved',
      'removed-question': 'error',
    }, [
      { id: 'question-1' },
      { id: 'question-2' },
    ])).toEqual({
      'question-1': 'saved',
    });
  });

  it('applies only the latest question save result', () => {
    expect(nextQuestionSaveVersion(undefined)).toBe(1);
    expect(nextQuestionSaveVersion(2)).toBe(3);
    expect(shouldApplyQuestionSaveResult(2, 1)).toBe(false);
    expect(shouldApplyQuestionSaveResult(2, 2)).toBe(true);
    expect(shouldApplyQuestionSaveResult(undefined, 1)).toBe(false);
  });

  it('blocks question step advance until edited answers are saved or discarded', () => {
    expect(questionSaveBlockReason({})).toBe(null);
    expect(questionSaveBlockReason({ 'question-1': 'saved' })).toBe(null);
    expect(questionSaveBlockReason({ 'question-1': 'dirty' })).toBe('dirty');
    expect(questionSaveBlockReason({ 'question-1': 'dirty', 'question-2': 'saving' })).toBe('saving');
    expect(questionSaveBlockReason({ 'question-1': 'saving', 'question-2': 'error' })).toBe('error');
  });
});
