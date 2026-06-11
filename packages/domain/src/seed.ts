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
        '2024년 5월 10일 14시 20분쯤 학교 2층 복도에서 B가 모욕성 발언을 했고, 14시 25분 계단 앞에서 B가 가까이 다가오고 C가 휴대폰으로 촬영하는 상황이 있었습니다. 14시 30분쯤 단체 채팅방에 영상이 공유되었고, 친구 A에게 말한 뒤 담임 선생님에게 상담을 요청했습니다. 목격자 D가 계단 위쪽에서 일부 장면을 봤다고 합니다.',
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
      new FactBlock('fact-1', caseId, 1, '2024-05-10T14:20:00+09:00', '학교 2층 복도', '가해 학생 B(익명)', '피해 학생(익명)', '모욕성 발언을 했다는 진술', ['evidence-1', 'evidence-7'], true),
      new FactBlock('fact-2', caseId, 2, '2024-05-10T14:25:00+09:00', '학교 계단 앞', '가해 학생 B, 참여 학생 C(익명)', '피해 학생(익명)', 'B가 접근하고 C가 촬영한 정황', ['evidence-2', 'evidence-3', 'evidence-7'], true),
      new FactBlock('fact-3', caseId, 3, '2024-05-10T14:30:00+09:00', '3학년 단체 채팅방', '참여 학생 C, 방장 E(익명)', '피해 학생(익명)', '촬영 영상이 단체 채팅방에 공유된 정황', ['evidence-3', 'evidence-4', 'evidence-7'], true),
      new FactBlock('fact-4', caseId, 4, '2024-05-10T14:36:00+09:00', '교실 뒤쪽', '피해 학생(익명)', '친구 A(익명)', '피해 학생이 친구 A에게 상황을 설명', ['evidence-5'], true),
      new FactBlock('fact-5', caseId, 5, '2024-05-10T15:10:00+09:00', '계단 위쪽', '목격자 D(익명)', '피해 학생, B, C(익명)', '목격자 D가 계단 앞 상황 일부를 봤다고 진술', ['evidence-6', 'evidence-7'], true),
      new FactBlock('fact-6', caseId, 6, '2024-05-10T15:35:00+09:00', '상담실', '피해 학생, 친구 A(익명)', '담임 선생님(익명)', '상담 요청과 보호자 공유 필요 사항 기록', ['evidence-5', 'evidence-7'], true),
    ],
    evidence: [
      new EvidenceAsset('evidence-1', caseId, 'chat-capture-001.svg', 'image/svg+xml', 2_650, 'image', `${caseId}/chat-capture-001.svg`, true, now, 'completed', '단체 채팅방 대화 캡처 OCR 후보: B, C, 방장 E, 14:29-14:31'),
      new EvidenceAsset('evidence-2', caseId, 'stair-location-map-002.svg', 'image/svg+xml', 2_419, 'image', `${caseId}/stair-location-map-002.svg`, true, now, 'completed', '2층 복도와 계단 앞 동선 도면'),
      new EvidenceAsset('evidence-3', caseId, 'stair-video-003.webm', 'video/webm', 309_595, 'video', `${caseId}/stair-video-003.webm`, true, now, 'manual_review', '합성 영상 자료: B 접근, C 촬영 정황, 채팅방 공유 후보'),
      new EvidenceAsset('evidence-4', caseId, 'chat-share-003.svg', 'image/svg+xml', 2_267, 'image', `${caseId}/chat-share-003.svg`, true, now, 'completed', '영상 공유 메시지 캡처 OCR 후보'),
      new EvidenceAsset('evidence-5', caseId, 'teacher-note-004.txt', 'text/plain', 748, 'document', `${caseId}/teacher-note-004.txt`, true, now, 'manual_review', '상담 교사 메모: 확인할 자료와 보호 조치 후보'),
      new EvidenceAsset('evidence-6', caseId, 'witness-memo-005.txt', 'text/plain', 517, 'document', `${caseId}/witness-memo-005.txt`, true, now, 'manual_review', '목격자 D 메모 후보'),
      new EvidenceAsset('evidence-7', caseId, 'timeline-board-006.svg', 'image/svg+xml', 3_271, 'image', `${caseId}/timeline-board-006.svg`, true, now, 'completed', '사건 타임라인 보드'),
    ],
    jobs: [
      new ProcessingJob('job-1', 'evidence-1', 'completed', 1, 'OCR 완료', now),
      new ProcessingJob('job-2', 'evidence-2', 'completed', 1, 'OCR 완료', now),
      new ProcessingJob('job-4', 'evidence-4', 'completed', 1, 'OCR 완료', now),
      new ProcessingJob('job-7', 'evidence-7', 'completed', 1, 'OCR 완료', now),
    ],
    questions: [
      new MissingInfoQuestion('question-1', caseId, 'fact-3', 'actor', '단체 채팅방에 함께 있던 학생이 더 있었나요? 방장 E 외 확인 가능한 참여자가 있나요?'),
      new MissingInfoQuestion('question-2', caseId, 'fact-2', 'evidence', '촬영된 영상의 원본 파일을 누가 보관하고 있나요?', '합성 영상 증거 stair-video-003.webm 연결 완료', true),
      new MissingInfoQuestion('question-3', caseId, 'fact-5', 'location', '목격자 D가 서 있던 정확한 위치와 주변 학생 수를 확인할 수 있나요?'),
      new MissingInfoQuestion('question-4', caseId, 'fact-6', 'evidence', '상담실 방문 뒤 보호자에게 공유된 시각이나 추가 메모가 있나요?'),
    ],
    people: [
      { id: 'victim', caseId, label: '피해 학생\n(익명)', relation: '본인', tone: 'primary', positionX: 50, positionY: 54, positionLocked: true },
      { id: 'actor-b', caseId, label: '가해 학생 B\n(익명)', relation: '주요 행위자', tone: 'danger', positionX: 78, positionY: 34, positionLocked: true },
      { id: 'student-c', caseId, label: '참여 학생 C\n(익명)', relation: '촬영·전달 후보', tone: 'danger', positionX: 78, positionY: 62, positionLocked: true },
      { id: 'chat-admin-e', caseId, label: '방장 E\n(익명)', relation: '채팅방 관리', tone: 'neutral', positionX: 62, positionY: 82, positionLocked: true },
      { id: 'witness-d', caseId, label: '목격자 D\n(익명)', relation: '목격 후보', tone: 'neutral', positionX: 34, positionY: 24, positionLocked: true },
      { id: 'friend-a', caseId, label: '친구 A\n(익명)', relation: '동행·지지', tone: 'support', positionX: 24, positionY: 68, positionLocked: true },
      { id: 'teacher', caseId, label: '담임 선생님\n(익명)', relation: '상담·보호', tone: 'support', positionX: 22, positionY: 42, positionLocked: true },
      { id: 'guardian-g', caseId, label: '보호자 G\n(익명)', relation: '보호자 공유', tone: 'support', positionX: 46, positionY: 88, positionLocked: true },
    ],
    relations: [
      { id: 'relation-1', caseId, fromPersonId: 'actor-b', toPersonId: 'victim', label: '모욕 발언 주장' },
      { id: 'relation-2', caseId, fromPersonId: 'actor-b', toPersonId: 'student-c', label: '촬영 지시·동조 후보' },
      { id: 'relation-3', caseId, fromPersonId: 'student-c', toPersonId: 'victim', label: '촬영 정황' },
      { id: 'relation-4', caseId, fromPersonId: 'student-c', toPersonId: 'chat-admin-e', label: '영상 전달 후보' },
      { id: 'relation-5', caseId, fromPersonId: 'chat-admin-e', toPersonId: 'victim', label: '단체방 유포 경로', indirect: true },
      { id: 'relation-6', caseId, fromPersonId: 'victim', toPersonId: 'friend-a', label: '피해 사실 공유' },
      { id: 'relation-7', caseId, fromPersonId: 'friend-a', toPersonId: 'teacher', label: '상담 동행' },
      { id: 'relation-8', caseId, fromPersonId: 'witness-d', toPersonId: 'victim', label: '목격 진술 후보', indirect: true },
      { id: 'relation-9', caseId, fromPersonId: 'teacher', toPersonId: 'victim', label: '보호 조치 안내' },
      { id: 'relation-10', caseId, fromPersonId: 'teacher', toPersonId: 'guardian-g', label: '보호자 공유 필요', indirect: true },
    ],
    auditLogs: [
      new AuditLog('audit-1', institutionId, 'student-1', 'case.submitted', 'case', caseId, '2026-05-31T04:00:00.000Z'),
      new AuditLog('audit-2', institutionId, 'institution-admin-1', 'case.assigned', 'case', caseId, '2026-05-31T04:20:00.000Z'),
      new AuditLog('audit-3', institutionId, 'counselor-1', 'case.review_started', 'case', caseId, now),
    ],
  };
}
