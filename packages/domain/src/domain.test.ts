import { describe, expect, it } from 'vitest';
import {
  AccessPolicy,
  CaseRecord,
  CompositeAnalyzer,
  EvidenceAsset,
  RetentionPolicy,
  RuleBasedAnalyzer,
  createSyntheticDataset,
} from './index';

const createdAt = '2026-05-31T00:00:00.000Z';

describe('CaseRecord', () => {
  it('locks student editing after submission and permits counselor reopening', () => {
    const draft = new CaseRecord('case-1', 'institution-1', 'student-1', '학생 1', '메모', 'student_review', createdAt, createdAt);
    const submitted = draft.moveTo('submitted', createdAt);
    expect(submitted.lockedForStudent).toBe(true);
    expect(() => submitted.updateMemo('수정')).toThrow('재개방');
    expect(submitted.moveTo('reopened', createdAt).lockedForStudent).toBe(false);
  });

  it('schedules purge after the configured recovery period', () => {
    const record = new CaseRecord('case-1', 'institution-1', 'student-1', '학생 1', '메모', 'draft', createdAt, createdAt);
    const scheduled = record.scheduleDeletion(new RetentionPolicy(30, 7), createdAt);
    expect(scheduled.status).toBe('deletion_scheduled');
    expect(scheduled.purgeAt).toBe('2026-06-07T00:00:00.000Z');
  });
});
describe('AccessPolicy', () => {
  it('separates institution access while allowing platform administrators', () => {
    const dataset = createSyntheticDataset();
    const record = dataset.cases[0]!;
    expect(AccessPolicy.canViewCase(dataset.profiles[2]!, record)).toBe(true);
    expect(
      AccessPolicy.canViewCase(
        { ...dataset.profiles[2]!, institutionId: 'other-institution' },
        record,
      ),
    ).toBe(false);
    expect(AccessPolicy.canViewCase(dataset.profiles[0]!, record)).toBe(true);
  });
});

describe('RuleBasedAnalyzer', () => {
  it('extracts blocks and asks for missing fields without inventing facts', async () => {
    const analyzer = new RuleBasedAnalyzer();
    const result = await analyzer.analyze({
      caseId: 'case-1',
      memo: '5월 10일 복도에서 B 학생이 욕설을 했습니다.',
      evidence: [],
      synthetic: false,
    });
    expect(result.factBlocks).toHaveLength(1);
    expect(result.factBlocks[0]?.location).toBe('복도');
    expect(result.questions.some((question) => question.field === 'evidence')).toBe(true);
    expect(result.usedExternalAi).toBe(false);
  });

  it('never sends real records to the optional external analyzer', async () => {
    let calls = 0;
    const external = {
      async analyze() {
        calls += 1;
        return { factBlocks: [], questions: [], summary: 'external', usedExternalAi: true };
      },
    };
    const analyzer = new CompositeAnalyzer(new RuleBasedAnalyzer(), external, 'synthetic_only');
    await analyzer.analyze({ caseId: 'case-1', memo: '메모', evidence: [], synthetic: false });
    expect(calls).toBe(0);
  });

  it('marks only supported evidence kinds as analyzable', () => {
    const image = new EvidenceAsset('e-1', 'case-1', 'a.png', 'image/png', 1, 'image', 'a.png', true, createdAt);
    const video = new EvidenceAsset('e-2', 'case-1', 'a.mp4', 'video/mp4', 1, 'video', 'a.mp4', true, createdAt);
    expect(image.canAnalyze).toBe(true);
    expect(video.canAnalyze).toBe(false);
  });
});
