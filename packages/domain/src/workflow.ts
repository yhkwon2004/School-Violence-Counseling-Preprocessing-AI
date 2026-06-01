import { AccessPolicy } from './access';
import { CaseRecord, RetentionPolicy, type Profile } from './models';
import type { Analyzer, AnalysisResult, CaseRepository, EvidenceRepository } from './ports';

export class CaseWorkflowService {
  constructor(
    private readonly cases: CaseRepository,
    private readonly evidence: EvidenceRepository,
    private readonly analyzer: Analyzer,
  ) {}

  async analyze(profile: Profile, caseRecord: CaseRecord): Promise<AnalysisResult> {
    if (!AccessPolicy.canViewCase(profile, caseRecord)) throw new Error('사건을 조회할 권한이 없습니다.');
    const assets = await this.evidence.listByCase(caseRecord.id);
    await this.cases.save(caseRecord.moveTo('analyzing'));
    return this.analyzer.analyze({
      caseId: caseRecord.id,
      memo: caseRecord.memo,
      evidence: assets,
      synthetic: caseRecord.synthetic,
    });
  }

  async submit(profile: Profile, caseRecord: CaseRecord): Promise<CaseRecord> {
    if (profile.role !== 'student' || profile.id !== caseRecord.studentId) {
      throw new Error('학생 본인만 기록을 제출할 수 있습니다.');
    }
    const submitted = caseRecord.moveTo('submitted');
    await this.cases.save(submitted);
    return submitted;
  }

  async scheduleDeletion(
    profile: Profile,
    caseRecord: CaseRecord,
    policy: RetentionPolicy,
  ): Promise<CaseRecord> {
    if (!AccessPolicy.canViewCase(profile, caseRecord)) throw new Error('삭제를 요청할 권한이 없습니다.');
    const scheduled = caseRecord.scheduleDeletion(policy);
    await this.cases.save(scheduled);
    return scheduled;
  }
}
