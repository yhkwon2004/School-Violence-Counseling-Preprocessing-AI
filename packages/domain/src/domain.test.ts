import { describe, expect, it } from 'vitest';
import {
  AccessPolicy,
  CaseRecord,
  CompositeAnalyzer,
  CaseHandoffCode,
  EvidenceAsset,
  RetentionPolicy,
  buildRelationGraphLayout,
  focusRelationGraph,
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

describe('CaseHandoffCode', () => {
  it('can be created only after a student submits the reviewed record', () => {
    expect(CaseHandoffCode.canCreateForStatus('student_review')).toBe(false);
    expect(CaseHandoffCode.canCreateForStatus('submitted')).toBe(true);
    expect(CaseHandoffCode.canCreateForStatus('assigned')).toBe(true);
    expect(CaseHandoffCode.canCreateForStatus('in_review')).toBe(true);
    expect(CaseHandoffCode.canCreateForStatus('completed')).toBe(true);
    expect(CaseHandoffCode.canCreateForStatus('deletion_scheduled')).toBe(false);
  });
});

describe('RelationGraphLayout', () => {
  it('anchors directed edges on node boundaries instead of centers', () => {
    const dataset = createSyntheticDataset();
    const record = dataset.cases[0]!;
    const layout = buildRelationGraphLayout(
      dataset.people.filter((person) => person.caseId === record.id),
      dataset.relations.filter((relation) => relation.caseId === record.id),
      [],
      10,
    );
    const edge = layout.edges[0]!;
    const source = layout.nodes.find((node) => node.id === edge.fromPersonId)!;
    const target = layout.nodes.find((node) => node.id === edge.toPersonId)!;

    expect(edge.from.x).not.toBe(source.x);
    expect(edge.to.x).not.toBe(target.x);
    expect(Math.hypot(edge.from.x - source.x, edge.from.y - source.y)).toBeCloseTo(10, 5);
    expect(Math.hypot(edge.to.x - target.x, edge.to.y - target.y)).toBeCloseTo(10, 5);
    expect(edge.length).toBeLessThan(Math.hypot(target.x - source.x, target.y - source.y));
  });

  it('uses lane groups and offsets parallel investigative arrows', () => {
    const people = [
      { id: 'victim', caseId: 'case-1', label: '피해 학생', relation: '기록 작성자', tone: 'primary' as const },
      { id: 'actor', caseId: 'case-1', label: '행위 학생', relation: '행위 단서', tone: 'danger' as const },
      { id: 'witness', caseId: 'case-1', label: '목격 학생', relation: '상황 단서', tone: 'neutral' as const },
      { id: 'teacher', caseId: 'case-1', label: '담임 교사', relation: '지원·보호', tone: 'support' as const },
    ];
    const relations = [
      { id: 'relation-a', caseId: 'case-1', fromPersonId: 'actor', toPersonId: 'victim', label: '반복 발언' },
      { id: 'relation-b', caseId: 'case-1', fromPersonId: 'actor', toPersonId: 'victim', label: '메신저 확산' },
      { id: 'relation-c', caseId: 'case-1', fromPersonId: 'teacher', toPersonId: 'victim', label: '보호 조치', indirect: true },
    ];

    const layout = buildRelationGraphLayout(people, relations, [], 11);
    const parallel = layout.edges.filter((edge) => edge.fromPersonId === 'actor' && edge.toPersonId === 'victim');

    expect(layout.lanes.map((lane) => lane.id)).toEqual(['left', 'center', 'right', 'upper', 'lower']);
    expect(layout.nodes.find((node) => node.id === 'victim')?.lane).toBe('center');
    expect(layout.nodes.find((node) => node.id === 'actor')?.lane).toBe('right');
    expect(layout.nodes.find((node) => node.id === 'teacher')?.lane).toBe('left');
    expect(parallel).toHaveLength(2);
    expect(parallel[0]?.parallelCount).toBe(2);
    expect(parallel[0]?.control).not.toEqual(parallel[1]?.control);
    expect(parallel[0]?.mid).not.toEqual(parallel[1]?.mid);
  });

  it('keeps only first-degree graph elements when focusing a node', () => {
    const dataset = createSyntheticDataset();
    const record = dataset.cases[0]!;
    const layout = buildRelationGraphLayout(
      dataset.people.filter((person) => person.caseId === record.id),
      dataset.relations.filter((relation) => relation.caseId === record.id),
    );

    const focused = focusRelationGraph(layout, { kind: 'node', id: 'actor-b' });
    expect(focused.nodes.map((node) => node.id).sort()).toEqual(['actor-b', 'student-c', 'victim']);
    expect(focused.edges.map((edge) => edge.id).sort()).toEqual(['relation-1', 'relation-2']);
  });

  it('keeps only the selected relation and its endpoints when focusing an edge', () => {
    const dataset = createSyntheticDataset();
    const record = dataset.cases[0]!;
    const layout = buildRelationGraphLayout(
      dataset.people.filter((person) => person.caseId === record.id),
      dataset.relations.filter((relation) => relation.caseId === record.id),
    );

    const focused = focusRelationGraph(layout, { kind: 'edge', id: 'relation-1' });
    expect(focused.nodes.map((node) => node.id).sort()).toEqual(['actor-b', 'victim']);
    expect(focused.edges.map((edge) => edge.id)).toEqual(['relation-1']);
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
