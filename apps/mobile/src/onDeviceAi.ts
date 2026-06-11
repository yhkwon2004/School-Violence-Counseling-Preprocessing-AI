import {
  EvidenceAsset,
  RuleBasedAnalyzer,
  type AnalysisResult,
  type EvidenceKind,
  type ProcessingStatus,
} from '@ieumlog/domain';
import type { RemoteFact, RemotePerson, RemoteRelation } from './studentApi';

export type LocalAiEvidence = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: EvidenceKind;
  processingStatus?: ProcessingStatus;
};

export type OnDeviceCaseAnalysis = {
  analysis: AnalysisResult;
  facts: RemoteFact[];
  people: RemotePerson[];
  relations: RemoteRelation[];
};

const PERSON_HINTS = [
  { pattern: /\bB\b|B 학생|가해 학생/i, label: 'B 학생', relation: '행위자로 언급', tone: 'danger' as const },
  { pattern: /\bC\b|C 학생/i, label: 'C 학생', relation: '동조 또는 주변 인물', tone: 'danger' as const },
  { pattern: /\bA\b|친구 A|A 학생/i, label: 'A 친구', relation: '도움 또는 동행', tone: 'support' as const },
  { pattern: /\bD\b|목격자 D|D 학생/i, label: 'D 목격자', relation: '목격 가능 인물', tone: 'neutral' as const },
  { pattern: /\bE\b|방장 E|E 학생/i, label: 'E 방장', relation: '단체방 관리자', tone: 'neutral' as const },
  { pattern: /담임|교사|선생님/, label: '담임 교사', relation: '상담 또는 확인', tone: 'support' as const },
  { pattern: /보호자|부모|어머니|아버지/, label: '보호자', relation: '보호자 확인', tone: 'support' as const },
];

export class OnDeviceAiEngine {
  constructor(private readonly analyzer = new RuleBasedAnalyzer()) {}

  async analyze(input: { caseId: string; memo: string; evidence: LocalAiEvidence[] }): Promise<OnDeviceCaseAnalysis> {
    const evidence = input.evidence.map((asset) =>
      new EvidenceAsset(
        asset.id,
        input.caseId,
        asset.name,
        asset.mimeType,
        asset.size,
        asset.kind,
        `${input.caseId}/${asset.name}`,
        true,
        new Date().toISOString(),
        asset.processingStatus ?? 'completed',
      ),
    );
    const analysis = await this.analyzer.analyze({
      caseId: input.caseId,
      memo: input.memo,
      evidence,
      synthetic: true,
    });
    const facts = analysis.factBlocks.map((fact) => ({
      id: fact.id,
      sequence: fact.sequence,
      occurredAt: fact.occurredAt,
      location: fact.location,
      action: fact.action,
      confirmed: fact.confirmed,
    }));
    const people = inferPeople(input.memo);
    return {
      analysis: {
        ...analysis,
        summary: `온디바이스 AI가 ${analysis.factBlocks.length}개 FactBlock과 ${analysis.questions.length}개 확인 질문을 정리했습니다.`,
        usedExternalAi: false,
      },
      facts,
      people,
      relations: inferRelations(input.caseId, people),
    };
  }
}

export function inferPeople(memo: string): RemotePerson[] {
  const people: RemotePerson[] = [{
    id: 'local-person-student',
    label: '피해 학생',
    relation: '기록 작성자',
    tone: 'primary',
  }];
  for (const hint of PERSON_HINTS) {
    if (hint.pattern.test(memo) && !people.some((person) => person.label === hint.label)) {
      people.push({
        id: `local-person-${people.length + 1}`,
        label: hint.label,
        relation: hint.relation,
        tone: hint.tone,
      });
    }
  }
  if (people.length === 1 && memo.trim()) {
    people.push({
      id: 'local-person-unknown',
      label: '확인 필요 인물',
      relation: '메모에서 추가 확인 필요',
      tone: 'neutral',
    });
  }
  return people;
}

export function inferRelations(caseId: string, people: RemotePerson[]): RemoteRelation[] {
  const student = people[0];
  if (!student) return [];
  return people.slice(1).map((person, index) => ({
    id: `local-relation-${caseId}-${index + 1}`,
    fromPersonId: person.id,
    toPersonId: student.id,
    label: person.tone === 'support' ? '지원/확인' : person.tone === 'danger' ? '행위 관련' : '확인 필요',
    indirect: person.tone === 'neutral',
  }));
}
