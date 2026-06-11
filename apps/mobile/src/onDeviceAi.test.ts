import { describe, expect, it } from 'vitest';
import { OnDeviceAiEngine, inferPeople, inferRelations } from './onDeviceAi';

describe('OnDeviceAiEngine', () => {
  it('creates local facts, questions, people, and relations without a server', async () => {
    const result = await new OnDeviceAiEngine().analyze({
      caseId: 'offline-case',
      memo: '5월 10일 복도에서 B 학생이 욕설을 했고 친구 A가 담임 선생님께 알려주었습니다.',
      evidence: [],
    });

    expect(result.analysis.usedExternalAi).toBe(false);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.people.map((person) => person.label)).toContain('B 학생');
    expect(result.people.map((person) => person.label)).toContain('A 친구');
    expect(result.relations.length).toBeGreaterThan(0);
  });

  it('keeps relation arrows directed from mentioned people to the student', () => {
    const people = inferPeople('B 학생과 목격자 D가 있었습니다.');
    const relations = inferRelations('case-1', people);
    expect(relations.every((relation) => relation.toPersonId === 'local-person-student')).toBe(true);
  });
});
