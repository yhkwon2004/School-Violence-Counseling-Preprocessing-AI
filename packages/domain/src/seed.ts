import {
  Assignment,
  AuditLog,
  CaseRecord,
  EvidenceAsset,
  FactBlock,
  MissingInfoQuestion,
  ProcessingJob,
  type Institution,
  type PersonNode,
  type Profile,
  type RelationEdge,
} from './models';

const now = '2026-05-31T05:00:00.000Z';

export type SyntheticDataset = {
  institutions: Institution[];
  profiles: Profile[];
  cases: CaseRecord[];
  assignments: Assignment[];
  factBlocks: FactBlock[];
  evidence: EvidenceAsset[];
  jobs: ProcessingJob[];
  questions: MissingInfoQuestion[];
  people: PersonNode[];
  relations: RelationEdge[];
  auditLogs: AuditLog[];
};

export function createSyntheticDataset(): SyntheticDataset {
  const institutionId = 'institution-wee-busan';
  const caseId = 'case-synthetic-001';

  return {
    institutions: [
      { id: institutionId, name: '부산 이음 Wee센터', region: '부산', active: true },
      { id: 'institution-youth-seoul', name: '서울 청소년 상담센터', region: '서울', active: true },
    ],
    profiles: [
      { id: 'platform-admin-1', institutionId: null, role: 'platform_admin', displayName: '플랫폼 관리자', email: 'platform@ieumlog.demo', active: true },
      { id: 'institution-admin-1', institutionId, role: 'institution_admin', displayName: '김 기관관리자', email: 'admin@wee.demo', active: true },
      { id: 'counselor-1', institutionId, role: 'counselor', displayName: '박 상담자', email: 'counselor@wee.demo', active: true },
      { id: 'student-1', institutionId, role: 'student', displayName: '학생 24-0510', loginId: 'WEE-24-0510', active: true },
    ],
    cases: [
      new CaseRecord(
        caseId,
        institutionId,
        'student-1',
        '학생 24-0510',
        '2024년 5월 10일 학교 2층 복도에서 가해 학생 B가 욕설을 했습니다. 14시 25분쯤 계단에서 B와 C가 밀치고 촬영했습니다. 이후 단톡방에 영상이 올라왔습니다.',
        'in_review',
        now,
        now,
        '2026-05-31T04:00:00.000Z',
        null,
        null,
        true,
      ),
    ],
    assignments: [new Assignment('assignment-1', caseId, 'counselor-1', 'institution-admin-1', now)],
    factBlocks: [
      new FactBlock('fact-1', caseId, 1, '2024-05-10T14:20:00+09:00', '학교 2층 복도', '가해 학생 B(익명)', '피해 학생(익명)', '욕설을 들었다', ['evidence-1'], true),
      new FactBlock('fact-2', caseId, 2, '2024-05-10T14:25:00+09:00', '학교 계단', '가해 학생 B, 참여 학생 C(익명)', '피해 학생(익명)', '밀치고 촬영했다', ['evidence-2'], true),
      new FactBlock('fact-3', caseId, 3, '2024-05-10T14:30:00+09:00', '3학년 단체 채팅방', '참여 학생 C(익명)', '피해 학생(익명)', '촬영 영상을 단체 채팅방에 업로드했다', ['evidence-3'], true),
      new FactBlock('fact-4', caseId, 4, '2024-05-10T15:00:00+09:00', '교실', '피해 학생(익명)', '친구 A(익명)', '상황을 이야기했다', ['evidence-4'], true),
      new FactBlock('fact-5', caseId, 5, '2024-05-10T15:30:00+09:00', '상담실', '피해 학생(익명)', '담임 선생님(익명)', '상담을 요청했다', ['evidence-5'], true),
    ],
    evidence: [
      new EvidenceAsset('evidence-1', caseId, '캡처_001.png', 'image/png', 823_000, 'image', `${caseId}/캡처_001.png`, true, now, 'completed', '단체 채팅방 욕설 캡처'),
      new EvidenceAsset('evidence-2', caseId, '영상_002.mp4', 'video/mp4', 4_120_000, 'video', `${caseId}/영상_002.mp4`, true, now, 'manual_review', null),
      new EvidenceAsset('evidence-3', caseId, '캡처_003.png', 'image/png', 713_000, 'image', `${caseId}/캡처_003.png`, true, now, 'completed', '영상 공유 메시지'),
      new EvidenceAsset('evidence-4', caseId, '메모_004.txt', 'text/plain', 12_000, 'document', `${caseId}/메모_004.txt`, true, now, 'manual_review', null),
      new EvidenceAsset('evidence-5', caseId, '녹취_005.m4a', 'audio/mp4', 2_300_000, 'audio', `${caseId}/녹취_005.m4a`, true, now, 'processing', null),
    ],
    jobs: [
      new ProcessingJob('job-1', 'evidence-1', 'completed', 1, 'OCR 완료', now),
      new ProcessingJob('job-5', 'evidence-5', 'processing', 1, 'STT 분석 중', now),
    ],
    questions: [
      new MissingInfoQuestion('question-1', caseId, 'fact-3', 'actor', '단체 채팅방에 함께 있던 학생이 더 있었나요?'),
      new MissingInfoQuestion('question-2', caseId, 'fact-2', 'evidence', '촬영된 영상의 원본을 업로드할 수 있나요?', '영상_002.mp4 업로드 완료', true),
    ],
    people: [
      { id: 'victim', caseId, label: '피해 학생\n(익명)', relation: '본인', tone: 'primary' },
      { id: 'actor-b', caseId, label: '가해 학생 B\n(익명)', relation: '가해', tone: 'danger' },
      { id: 'student-c', caseId, label: '참여 학생 C\n(익명)', relation: '함께 있음', tone: 'neutral' },
      { id: 'friend-a', caseId, label: '친구 A\n(익명)', relation: '친구', tone: 'support' },
      { id: 'teacher', caseId, label: '학교 선생님\n(익명)', relation: '지도', tone: 'support' },
    ],
    relations: [
      { id: 'relation-1', caseId, fromPersonId: 'victim', toPersonId: 'actor-b', label: '가해' },
      { id: 'relation-2', caseId, fromPersonId: 'victim', toPersonId: 'student-c', label: '함께 있음' },
      { id: 'relation-3', caseId, fromPersonId: 'victim', toPersonId: 'friend-a', label: '친구' },
      { id: 'relation-4', caseId, fromPersonId: 'victim', toPersonId: 'teacher', label: '지도', indirect: true },
    ],
    auditLogs: [
      new AuditLog('audit-1', institutionId, 'student-1', 'case.submitted', 'case', caseId, '2026-05-31T04:00:00.000Z'),
      new AuditLog('audit-2', institutionId, 'institution-admin-1', 'case.assigned', 'case', caseId, '2026-05-31T04:20:00.000Z'),
      new AuditLog('audit-3', institutionId, 'counselor-1', 'case.review_started', 'case', caseId, now),
    ],
  };
}
