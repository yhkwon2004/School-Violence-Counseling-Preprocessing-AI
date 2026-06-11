import { describe, expect, it } from 'vitest';
import {
  questionSaveBlockReason,
  shouldBlockAnalysisStepAdvance,
  shouldShowLockedStudentCase,
  studentSubmitBlockReason,
} from './studentFlow';

describe('student web flow rules', () => {
  it('keeps submitted records locked for students', () => {
    expect(shouldShowLockedStudentCase('submitted')).toBe(true);
    expect(shouldShowLockedStudentCase('reopened')).toBe(false);
  });

  it('blocks submit until analysis exists and evidence processing is done', () => {
    expect(studentSubmitBlockReason(true, 0, [])).toBe('analysis_required');
    expect(studentSubmitBlockReason(false, 0, [])).toBe('analysis_required');
    expect(studentSubmitBlockReason(false, 2, ['completed', 'processing'])).toBe('evidence_processing');
    expect(studentSubmitBlockReason(false, 2, ['completed', 'manual_review'])).toBeNull();
  });

  it('blocks analysis step advance while work is missing or running', () => {
    expect(shouldBlockAnalysisStepAdvance(false, true, 1)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(true, false, 1)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(false, false, 0)).toBe(true);
    expect(shouldBlockAnalysisStepAdvance(false, false, 1)).toBe(false);
  });

  it('surfaces the strongest question save blocker first', () => {
    expect(questionSaveBlockReason({ a: 'dirty' })).toBe('dirty');
    expect(questionSaveBlockReason({ a: 'dirty', b: 'saving' })).toBe('saving');
    expect(questionSaveBlockReason({ a: 'dirty', b: 'saving', c: 'error' })).toBe('error');
    expect(questionSaveBlockReason({ a: 'saved' })).toBeNull();
  });
});
