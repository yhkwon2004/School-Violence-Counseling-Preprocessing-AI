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
  type SyntheticDataset,
} from '@ieumlog/domain';

const SESSION_KEY = 'ieumlog:staff-session';

type StaffSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
};

type CounselorNote = {
  id: string;
  caseId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type ConnectedSnapshot = {
  dataset: SyntheticDataset;
  notes: CounselorNote[];
  retentionDays: number;
  activeProfileId: string;
};

export class WebApiClient {
  readonly connected: boolean;
  private refreshPromise: Promise<StaffSession> | null = null;

  constructor(
    private readonly baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '',
    private readonly anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  ) {
    this.connected = Boolean(baseUrl && anonKey && !anonKey.includes('replace-with'));
  }

  async restoreSnapshot(): Promise<ConnectedSnapshot | null> {
    if (!this.connected || !this.readSession()) return null;
    try {
      return await this.loadSnapshot();
    } catch {
      this.logout();
      return null;
    }
  }

  async login(email: string, password: string): Promise<ConnectedSnapshot> {
    this.ensureConnected();
    const session = await this.request<StaffSession>(
      '/auth/v1/token?grant_type=password',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    try {
      return await this.loadSnapshot();
    } catch (error) {
      this.logout();
      throw error;
    }
  }

  logout() {
    this.refreshPromise = null;
    localStorage.removeItem(SESSION_KEY);
  }

  async loadSnapshot(): Promise<ConnectedSnapshot> {
    const session = await this.requireFreshSession();
    const [
      institutions,
      profiles,
      settings,
      cases,
      assignments,
      facts,
      factEvidence,
      evidence,
      jobs,
      questions,
      people,
      relations,
      auditLogs,
      notes,
    ] = await Promise.all([
      this.rest<InstitutionRow[]>('/institutions?select=*&order=created_at'),
      this.rest<ProfileRow[]>('/profiles?select=*&order=created_at'),
      this.rest<SettingRow[]>('/institution_settings?select=*'),
      this.rest<CaseRow[]>('/cases?select=*&order=updated_at.desc'),
      this.rest<AssignmentRow[]>('/assignments?select=*&active=eq.true'),
      this.rest<FactRow[]>('/fact_blocks?select=*&order=sequence'),
      this.rest<FactEvidenceRow[]>('/fact_block_evidence?select=*'),
      this.rest<EvidenceRow[]>('/evidence_assets?select=*&deleted_at=is.null&order=uploaded_at'),
      this.rest<JobRow[]>('/processing_jobs?select=*&order=updated_at.desc'),
      this.rest<QuestionRow[]>('/missing_questions?select=*&order=created_at'),
      this.rest<PersonRow[]>('/people?select=*'),
      this.rest<RelationRow[]>('/relations?select=*'),
      this.rest<AuditRow[]>('/audit_logs?select=*&order=created_at.desc'),
      this.rest<NoteRow[]>('/counselor_notes?select=*&order=created_at.desc'),
    ]);

    const activeProfile = profiles.find((profile) => profile.id === session.user.id);
    if (!activeProfile?.active) throw new Error('비활성 계정입니다. 기관 관리자에게 문의해 주세요.');
    if (
      activeProfile.role !== 'platform_admin'
      && !institutions.some((institution) => institution.id === activeProfile.institution_id && institution.active)
    ) {
      throw new Error('보관 처리된 기관의 계정입니다. 플랫폼 관리자에게 문의해 주세요.');
    }
    const activeSettings = settings.find((setting) => setting.institution_id === activeProfile.institution_id);

    return {
      activeProfileId: session.user.id,
      retentionDays: activeSettings?.retention_days ?? 30,
      notes: notes.map((note) => ({
        id: note.id,
        caseId: note.case_id,
        authorId: note.author_id,
        body: note.body,
        createdAt: note.created_at,
      })),
      dataset: {
        institutions: institutions.map((institution) => ({
          id: institution.id,
          name: institution.name,
          region: institution.region,
          active: institution.active,
        })),
        profiles: profiles.map((profile) => ({
          id: profile.id,
          institutionId: profile.institution_id,
          role: profile.role,
          displayName: profile.display_name,
          loginId: profile.student_login_id ?? undefined,
          email: profile.auth_email,
          active: profile.active,
        })),
        cases: cases.map((record) => new CaseRecord(
          record.id,
          record.institution_id,
          record.student_id,
          record.anonymous_label,
          record.memo,
          record.status,
          record.created_at,
          record.updated_at,
          record.submitted_at,
          record.deletion_requested_at,
          record.purge_at,
          record.synthetic,
        )),
        assignments: assignments.map((assignment) => new Assignment(
          assignment.id,
          assignment.case_id,
          assignment.counselor_id,
          assignment.assigned_by,
          assignment.assigned_at,
        )),
        factBlocks: facts.map((fact) => new FactBlock(
          fact.id,
          fact.case_id,
          fact.sequence,
          fact.occurred_at,
          fact.location,
          fact.actor,
          fact.target,
          fact.action,
          factEvidence.filter((link) => link.fact_block_id === fact.id).map((link) => link.evidence_id),
          fact.confirmed,
        )),
        evidence: evidence.map((asset) => new EvidenceAsset(
          asset.id,
          asset.case_id,
          asset.file_name,
          asset.mime_type,
          asset.size_bytes,
          asset.kind,
          asset.storage_path,
          asset.synthetic,
          asset.uploaded_at,
          asset.processing_status,
          asset.extracted_text,
        )),
        jobs: jobs.map((job) => new ProcessingJob(
          job.id,
          job.evidence_id,
          job.status,
          job.attempts,
          job.message,
          job.updated_at,
        )),
        questions: questions.map((question) => new MissingInfoQuestion(
          question.id,
          question.case_id,
          question.fact_block_id ?? '',
          question.field,
          question.prompt,
          question.answer,
          question.resolved,
        )),
        people: people.map((person) => ({
          id: person.id,
          caseId: person.case_id,
          label: person.anonymous_label,
          relation: person.relation,
          tone: person.tone,
          positionX: person.position_x,
          positionY: person.position_y,
          positionLocked: person.position_locked,
        })),
        relations: relations.map((relation) => ({
          id: relation.id,
          caseId: relation.case_id,
          fromPersonId: relation.from_person_id,
          toPersonId: relation.to_person_id,
          label: relation.label,
          indirect: relation.indirect,
        })),
        auditLogs: auditLogs.map((log) => new AuditLog(
          log.id,
          log.institution_id,
          log.actor_id ?? '',
          log.action,
          log.target_type,
          log.target_id,
          log.created_at,
        )),
      },
    };
  }

  async updateCaseStatus(caseId: string, status: string): Promise<void> {
    const action = status === 'in_review' ? 'review' : status === 'completed' ? 'complete' : 'reopen';
    await this.edge('staff-case-action', { caseId, action });
  }

  async claimCase(caseId: string): Promise<void> {
    await this.rest('/rpc/claim_case', {
      method: 'POST',
      body: JSON.stringify({ case_id_input: caseId }),
    });
  }

  async assignCase(caseId: string, counselorId: string): Promise<void> {
    await this.rest('/rpc/assign_case', {
      method: 'POST',
      body: JSON.stringify({ case_id_input: caseId, counselor_id_input: counselorId }),
    });
  }

  async redeemHandoffCode(code: string): Promise<{ caseId: string; assignmentId: string | null; status: string }> {
    return this.edge<{ caseId: string; assignmentId: string | null; status: string }>('redeem-case-handoff-code', { code });
  }

  async saveRelationLayout(caseId: string, positions: Array<{ id: string; x: number; y: number; locked?: boolean }>): Promise<void> {
    await this.edge('save-relation-layout', { caseId, positions });
  }

  async addNote(caseId: string, body: string): Promise<void> {
    const session = await this.requireFreshSession();
    await this.rest('/counselor_notes', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, author_id: session.user.id, body }),
    });
  }

  async setRetentionDays(institutionId: string, retentionDays: number): Promise<void> {
    await this.rest(`/institution_settings?institution_id=eq.${institutionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ retention_days: retentionDays }),
    });
  }

  async createInstitution(name: string, region: string): Promise<void> {
    await this.edge('admin-institutions', { name, region });
  }

  async createUser(input: { displayName: string; institutionId: string; role: Profile['role']; email?: string; loginId?: string; password: string }): Promise<void> {
    await this.edge('admin-users', input);
  }

  async setProfileActive(id: string, active: boolean): Promise<void> {
    await this.request('/functions/v1/admin-users', {
      method: 'PATCH',
      body: JSON.stringify({ id, active }),
    });
  }

  async setInstitutionActive(id: string, active: boolean): Promise<void> {
    await this.request('/functions/v1/admin-institutions', {
      method: 'PATCH',
      body: JSON.stringify({ id, active }),
    });
  }

  async updateInstitution(id: string, name: string, region: string): Promise<void> {
    await this.request('/functions/v1/admin-institutions', {
      method: 'PATCH',
      body: JSON.stringify({ id, name, region }),
    });
  }

  async archiveInstitution(id: string): Promise<void> {
    await this.request('/functions/v1/admin-institutions', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  }

  async downloadEvidence(evidenceId: string): Promise<void> {
    window.open(await this.getEvidenceUrl(evidenceId), '_blank', 'noopener,noreferrer');
  }

  async getEvidenceUrl(evidenceId: string): Promise<string> {
    const result = await this.edge<{ signedUrl: string }>('evidence-download-url', { evidenceId });
    return this.normalizeSignedUrl(result.signedUrl);
  }

  private edge<T = unknown>(name: string, body: unknown): Promise<T> {
    return this.request<T>(`/functions/v1/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private rest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(`/rest/v1${path}`, init);
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    this.ensureConnected();
    const session = authenticated ? await this.requireFreshSession() : null;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.anonKey,
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string; msg?: string; error?: string };
      throw new Error(body.message ?? body.msg ?? body.error ?? '요청을 처리할 수 없습니다.');
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private readSession(): StaffSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StaffSession;
    } catch {
      this.logout();
      return null;
    }
  }

  private normalizeSignedUrl(url: string) {
    if (!url.startsWith('http://kong:8000')) return url;
    return `${this.baseUrl}${url.slice('http://kong:8000'.length)}`;
  }

  private requireSession() {
    const session = this.readSession();
    if (!session) throw new Error('로그인이 필요합니다.');
    return session;
  }

  private async requireFreshSession(): Promise<StaffSession> {
    const session = this.requireSession();
    if (!session.expires_at || session.expires_at * 1000 > Date.now() + 30_000) return session;
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshSession(session.refresh_token).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async refreshSession(refreshToken: string): Promise<StaffSession> {
    const session = await this.request<StaffSession>(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
      false,
    );
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  private ensureConnected() {
    if (!this.connected) throw new Error('Supabase 연결 환경변수가 필요합니다.');
  }
}

type InstitutionRow = { id: string; name: string; region: string; active: boolean };
type ProfileRow = { id: string; institution_id: string | null; role: Profile['role']; display_name: string; student_login_id: string | null; auth_email: string; active: boolean };
type SettingRow = { institution_id: string; retention_days: number };
type CaseRow = { id: string; institution_id: string; student_id: string; anonymous_label: string; memo: string; status: ConstructorParameters<typeof CaseRecord>[5]; synthetic: boolean; submitted_at: string | null; deletion_requested_at: string | null; purge_at: string | null; created_at: string; updated_at: string };
type AssignmentRow = { id: string; case_id: string; counselor_id: string; assigned_by: string; assigned_at: string };
type FactRow = { id: string; case_id: string; sequence: number; occurred_at: string | null; location: string | null; actor: string | null; target: string | null; action: string; confirmed: boolean };
type FactEvidenceRow = { fact_block_id: string; evidence_id: string };
type EvidenceRow = { id: string; case_id: string; file_name: string; mime_type: string; size_bytes: number; kind: ConstructorParameters<typeof EvidenceAsset>[5]; storage_path: string; synthetic: boolean; uploaded_at: string; processing_status: ConstructorParameters<typeof EvidenceAsset>[9]; extracted_text: string | null };
type JobRow = { id: string; evidence_id: string; status: ConstructorParameters<typeof ProcessingJob>[2]; attempts: number; message: string; updated_at: string };
type QuestionRow = { id: string; case_id: string; fact_block_id: string | null; field: ConstructorParameters<typeof MissingInfoQuestion>[3]; prompt: string; answer: string | null; resolved: boolean };
type PersonRow = { id: string; case_id: string; anonymous_label: string; relation: string; tone: PersonNode['tone']; position_x: number | null; position_y: number | null; position_locked: boolean };
type RelationRow = { id: string; case_id: string; from_person_id: string; to_person_id: string; label: string; indirect: boolean };
type AuditRow = { id: string; institution_id: string | null; actor_id: string | null; action: string; target_type: string; target_id: string; created_at: string };
type NoteRow = { id: string; case_id: string; author_id: string; body: string; created_at: string };
