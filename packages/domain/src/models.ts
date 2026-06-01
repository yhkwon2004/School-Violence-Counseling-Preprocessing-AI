export type UserRole = 'student' | 'counselor' | 'institution_admin' | 'platform_admin';

export type CaseStatus =
  | 'draft'
  | 'analyzing'
  | 'student_review'
  | 'submitted'
  | 'assigned'
  | 'in_review'
  | 'completed'
  | 'reopened'
  | 'deletion_scheduled';

export type EvidenceKind = 'image' | 'pdf' | 'audio' | 'video' | 'document' | 'other';
export type ProcessingStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'manual_review';
export type QuestionField = 'occurred_at' | 'location' | 'actor' | 'target' | 'action' | 'evidence';

export type Institution = {
  id: string;
  name: string;
  region: string;
  active: boolean;
};

export type Profile = {
  id: string;
  institutionId: string | null;
  role: UserRole;
  displayName: string;
  loginId?: string;
  email?: string;
  active: boolean;
};

export type PersonNode = {
  id: string;
  caseId: string;
  label: string;
  relation: string;
  tone: 'primary' | 'danger' | 'neutral' | 'support';
};

export type RelationEdge = {
  id: string;
  caseId: string;
  fromPersonId: string;
  toPersonId: string;
  label: string;
  indirect?: boolean;
};

export class AuditLog {
  constructor(
    readonly id: string,
    readonly institutionId: string | null,
    readonly actorId: string,
    readonly action: string,
    readonly targetType: string,
    readonly targetId: string,
    readonly createdAt: string,
  ) {}
}

export class FactBlock {
  constructor(
    readonly id: string,
    readonly caseId: string,
    readonly sequence: number,
    readonly occurredAt: string | null,
    readonly location: string | null,
    readonly actor: string | null,
    readonly target: string | null,
    readonly action: string,
    readonly evidenceIds: string[],
    readonly confirmed: boolean,
  ) {}

  get missingFields(): QuestionField[] {
    const missing: QuestionField[] = [];
    if (!this.occurredAt) missing.push('occurred_at');
    if (!this.location) missing.push('location');
    if (!this.actor) missing.push('actor');
    if (!this.target) missing.push('target');
    if (!this.action.trim()) missing.push('action');
    if (this.evidenceIds.length === 0) missing.push('evidence');
    return missing;
  }
}

export class EvidenceAsset {
  constructor(
    readonly id: string,
    readonly caseId: string,
    readonly fileName: string,
    readonly mimeType: string,
    readonly sizeBytes: number,
    readonly kind: EvidenceKind,
    readonly storagePath: string,
    readonly synthetic: boolean,
    readonly uploadedAt: string,
    readonly processingStatus: ProcessingStatus = 'queued',
    readonly extractedText: string | null = null,
  ) {}

  get canPreview(): boolean {
    return ['image', 'pdf', 'audio', 'video'].includes(this.kind);
  }

  get canAnalyze(): boolean {
    return ['image', 'pdf', 'audio'].includes(this.kind);
  }
}

export class ProcessingJob {
  constructor(
    readonly id: string,
    readonly evidenceId: string,
    readonly status: ProcessingStatus,
    readonly attempts: number,
    readonly message: string,
    readonly updatedAt: string,
  ) {}

  retry(now = new Date().toISOString()): ProcessingJob {
    if (this.status !== 'failed') return this;
    return new ProcessingJob(this.id, this.evidenceId, 'queued', this.attempts + 1, '재시도 대기 중', now);
  }
}

export class MissingInfoQuestion {
  constructor(
    readonly id: string,
    readonly caseId: string,
    readonly factBlockId: string,
    readonly field: QuestionField,
    readonly prompt: string,
    readonly answer: string | null = null,
    readonly resolved = false,
  ) {}

  answerWith(answer: string): MissingInfoQuestion {
    const normalized = answer.trim();
    return new MissingInfoQuestion(
      this.id,
      this.caseId,
      this.factBlockId,
      this.field,
      this.prompt,
      normalized || null,
      Boolean(normalized),
    );
  }
}

export class Assignment {
  constructor(
    readonly id: string,
    readonly caseId: string,
    readonly counselorId: string,
    readonly assignedBy: string,
    readonly assignedAt: string,
  ) {}
}

export class RetentionPolicy {
  constructor(
    readonly retentionDays: number,
    readonly recoveryDays = 7,
  ) {
    if (retentionDays < 1) throw new Error('보관 기간은 하루 이상이어야 합니다.');
    if (recoveryDays < 0) throw new Error('복구 기간은 음수일 수 없습니다.');
  }

  expiresAt(submittedAt: string): string {
    return addDays(submittedAt, this.retentionDays);
  }

  purgeAt(deletionRequestedAt: string): string {
    return addDays(deletionRequestedAt, this.recoveryDays);
  }
}

export class CaseRecord {
  constructor(
    readonly id: string,
    readonly institutionId: string,
    readonly studentId: string,
    readonly anonymousLabel: string,
    readonly memo: string,
    readonly status: CaseStatus,
    readonly createdAt: string,
    readonly updatedAt: string,
    readonly submittedAt: string | null = null,
    readonly deletionRequestedAt: string | null = null,
    readonly purgeAt: string | null = null,
    readonly synthetic = false,
  ) {}

  get lockedForStudent(): boolean {
    return !['draft', 'analyzing', 'student_review', 'reopened'].includes(this.status);
  }

  updateMemo(memo: string, now = new Date().toISOString()): CaseRecord {
    if (this.lockedForStudent) throw new Error('제출된 기록은 상담자가 재개방한 뒤 수정할 수 있습니다.');
    return this.copy({ memo: memo.trim(), updatedAt: now });
  }

  moveTo(nextStatus: CaseStatus, now = new Date().toISOString()): CaseRecord {
    const allowed: Record<CaseStatus, CaseStatus[]> = {
      draft: ['analyzing', 'student_review', 'deletion_scheduled'],
      analyzing: ['student_review', 'deletion_scheduled'],
      student_review: ['submitted', 'deletion_scheduled'],
      submitted: ['assigned', 'in_review', 'reopened', 'deletion_scheduled'],
      assigned: ['in_review', 'reopened', 'deletion_scheduled'],
      in_review: ['completed', 'reopened', 'deletion_scheduled'],
      completed: ['reopened', 'deletion_scheduled'],
      reopened: ['student_review', 'submitted', 'deletion_scheduled'],
      deletion_scheduled: [],
    };

    if (!allowed[this.status].includes(nextStatus)) {
      throw new Error(`${this.status} 상태에서 ${nextStatus} 상태로 변경할 수 없습니다.`);
    }

    return this.copy({
      status: nextStatus,
      updatedAt: now,
      submittedAt: nextStatus === 'submitted' ? now : this.submittedAt,
    });
  }

  scheduleDeletion(policy: RetentionPolicy, now = new Date().toISOString()): CaseRecord {
    return this.copy({
      status: 'deletion_scheduled',
      deletionRequestedAt: now,
      purgeAt: policy.purgeAt(now),
      updatedAt: now,
    });
  }

  private copy(patch: Partial<CaseRecord>): CaseRecord {
    return new CaseRecord(
      patch.id ?? this.id,
      patch.institutionId ?? this.institutionId,
      patch.studentId ?? this.studentId,
      patch.anonymousLabel ?? this.anonymousLabel,
      patch.memo ?? this.memo,
      patch.status ?? this.status,
      patch.createdAt ?? this.createdAt,
      patch.updatedAt ?? this.updatedAt,
      patch.submittedAt === undefined ? this.submittedAt : patch.submittedAt,
      patch.deletionRequestedAt === undefined ? this.deletionRequestedAt : patch.deletionRequestedAt,
      patch.purgeAt === undefined ? this.purgeAt : patch.purgeAt,
      patch.synthetic ?? this.synthetic,
    );
  }
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
