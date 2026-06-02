import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EvidenceKind, ProcessingStatus } from '@ieumlog/domain';
import { MemoUpdateQueue } from './memoUpdateQueue';

const SESSION_KEY = 'ieumlog:student-session';

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: { id: string };
};

export type StudentCase = {
  id: string;
  institutionId: string;
  studentId: string;
  memo: string;
  status: string;
  updatedAt: string;
};

export type RemoteEvidence = {
  id: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: EvidenceKind;
  processingStatus: ProcessingStatus;
};

export type RemoteQuestion = {
  id: string;
  prompt: string;
  answer: string;
  resolved: boolean;
};

export type RemoteFact = {
  id: string;
  sequence: number;
  occurredAt: string | null;
  location: string | null;
  action: string;
  confirmed: boolean;
};

type StudentProfileRow = {
  id: string;
  institution_id: string;
};

type CaseRow = {
  id: string;
  institution_id: string;
  student_id: string;
  memo: string;
  status: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  case_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: EvidenceKind;
  processing_status: ProcessingStatus;
};

type QuestionRow = {
  id: string;
  prompt: string;
  answer: string | null;
  resolved: boolean;
};

type FactRow = {
  id: string;
  sequence: number;
  occurred_at: string | null;
  location: string | null;
  action: string;
  confirmed: boolean;
};

export class StudentApiClient {
  readonly connected: boolean;
  private readonly memoUpdates = new MemoUpdateQueue();
  private realtimeClient: SupabaseClient | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '',
    private readonly anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  ) {
    this.connected = Boolean(baseUrl && anonKey && !anonKey.includes('replace-with'));
  }

  async restoreSession(): Promise<boolean> {
    if (!this.connected) return false;
    const session = await this.readSession();
    if (!session) return false;
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
      return this.refreshSession(session.refresh_token);
    }
    return Boolean(session.access_token);
  }

  async login(loginId: string, password: string): Promise<void> {
    this.ensureConnected();
    const response = await this.request<{ session: AuthSession }>(
      '/functions/v1/student-login',
      { method: 'POST', body: JSON.stringify({ loginId, password }) },
      false,
    );
    await this.saveSession(response.session);
  }

  async logout(): Promise<void> {
    this.refreshPromise = null;
    if (this.realtimeClient) {
      await this.realtimeClient.removeAllChannels();
      this.realtimeClient = null;
    }
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  async getOrCreateCurrentCase(): Promise<StudentCase> {
    const profile = await this.getStudentProfile();
    const active = await this.rest<CaseRow[]>(
      '/cases?select=*&synthetic=eq.false&status=in.(draft,analyzing,student_review,reopened)&order=updated_at.desc&limit=1',
    );
    if (active[0]) return this.mapCase(active[0]);

    const locked = await this.rest<CaseRow[]>(
      '/cases?select=*&synthetic=eq.false&status=in.(submitted,assigned,in_review,completed)&order=updated_at.desc&limit=1',
    );
    if (locked[0]) return this.mapCase(locked[0]);

    return this.createDraftCaseForProfile(profile);
  }

  async createDraftCase(): Promise<StudentCase> {
    return this.createDraftCaseForProfile(await this.getStudentProfile());
  }

  async getCase(caseId: string): Promise<StudentCase | null> {
    const rows = await this.rest<CaseRow[]>(`/cases?id=eq.${caseId}&select=*`);
    return rows[0] ? this.mapCase(rows[0]) : null;
  }

  private async createDraftCaseForProfile(profile: StudentProfileRow): Promise<StudentCase> {
    const id = uuid();
    await this.rest('/cases', {
      method: 'POST',
      body: JSON.stringify({
        id,
        institution_id: profile.institution_id,
        student_id: profile.id,
        anonymous_label: `학생 ${profile.id.slice(0, 8)}`,
        memo: '',
        synthetic: false,
      }),
    });
    const created = await this.rest<CaseRow[]>(`/cases?id=eq.${id}&select=*`);
    if (!created[0]) throw new Error('새 기록을 만들 수 없습니다.');
    return this.mapCase(created[0]);
  }

  async updateMemo(caseId: string, memo: string): Promise<void> {
    await this.memoUpdates.enqueue(async () => {
      await this.rest(`/cases?id=eq.${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ memo }),
      });
    });
  }

  async uploadEvidence(
    caseId: string,
    asset: { uri: string; name: string; mimeType: string; size: number; kind: EvidenceKind; durationSeconds?: number },
  ): Promise<RemoteEvidence> {
    const source = await fetch(asset.uri);
    if (!source.ok) throw new Error('선택한 파일을 읽을 수 없습니다.');
    const file = await source.blob();
    let reservedEvidenceId: string | null = null;
    try {
      const response = await this.edge<{ asset: EvidenceRow; signedUrl: string }>('evidence-upload-url', {
        caseId,
        fileName: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: file.size,
        kind: asset.kind,
        durationSeconds: asset.durationSeconds,
      });
      reservedEvidenceId = response.asset.id;
      const upload = await fetch(this.normalizeSignedUrl(response.signedUrl), {
        method: 'PUT',
        headers: { 'Content-Type': asset.mimeType },
        body: file,
      });
      if (!upload.ok) throw new Error('파일 업로드에 실패했습니다.');
      await this.edge('process-evidence', { evidenceId: response.asset.id });
      return this.mapEvidence(response.asset);
    } catch (error) {
      if (reservedEvidenceId) {
        await this.discardEvidenceUpload(reservedEvidenceId).catch(() => undefined);
      }
      throw error;
    }
  }

  async discardEvidenceUpload(evidenceId: string): Promise<void> {
    await this.edge('discard-evidence-upload', { evidenceId });
  }

  async listEvidence(caseId: string): Promise<RemoteEvidence[]> {
    const rows = await this.rest<EvidenceRow[]>(
      `/evidence_assets?case_id=eq.${caseId}&deleted_at=is.null&select=*&order=uploaded_at`,
    );
    return rows.map((row) => this.mapEvidence(row));
  }

  async subscribeEvidence(caseId: string, onChange: () => void): Promise<() => void> {
    this.ensureConnected();
    const session = await this.getSession();
    const client = this.realtimeClient ?? createClient(this.baseUrl, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.realtimeClient = client;
    client.realtime.setAuth(session.access_token);
    const channel = client
      .channel(`student-evidence:${caseId}:${uuid()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evidence_assets', filter: `case_id=eq.${caseId}` },
        onChange,
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }

  async analyzeCase(caseId: string, memo: string): Promise<void> {
    await this.updateMemo(caseId, memo);
    await this.edge('process-case', { caseId });
  }

  async listQuestions(caseId: string): Promise<RemoteQuestion[]> {
    const rows = await this.rest<QuestionRow[]>(
      `/missing_questions?case_id=eq.${caseId}&select=id,prompt,answer,resolved&order=created_at`,
    );
    return rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      answer: row.answer ?? '',
      resolved: row.resolved,
    }));
  }

  async listFacts(caseId: string): Promise<RemoteFact[]> {
    const rows = await this.rest<FactRow[]>(
      `/fact_blocks?case_id=eq.${caseId}&select=id,sequence,occurred_at,location,action,confirmed&order=sequence`,
    );
    return rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      occurredAt: row.occurred_at,
      location: row.location,
      action: row.action,
      confirmed: row.confirmed,
    }));
  }

  async answerQuestion(id: string, answer: string): Promise<void> {
    const normalized = answer.trim();
    await this.rest(`/missing_questions?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ answer: normalized || null, resolved: Boolean(normalized) }),
    });
  }

  async submit(caseId: string, memo: string): Promise<void> {
    await this.memoUpdates.waitForIdle().catch(() => undefined);
    await this.edge('submit-case', { caseId, memo });
  }

  async scheduleDeletion(caseId: string): Promise<void> {
    await this.rest('/rpc/schedule_case_deletion', {
      method: 'POST',
      body: JSON.stringify({ case_id_input: caseId }),
    });
  }

  private async getStudentProfile(): Promise<StudentProfileRow> {
    const session = await this.getSession();
    if (!session.user?.id) throw new Error('학생 계정 정보를 확인할 수 없습니다.');
    const profiles = await this.rest<StudentProfileRow[]>(`/profiles?select=id,institution_id&id=eq.${session.user.id}`);
    if (!profiles[0]) throw new Error('학생 프로필을 찾을 수 없습니다.');
    return profiles[0];
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
    const session = authenticated ? await this.getSession() : null;
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
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(payload.message ?? payload.error ?? '요청을 처리할 수 없습니다.');
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async getSession(): Promise<AuthSession> {
    const session = await this.readSession();
    if (!session) throw new Error('로그인이 필요합니다.');
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
      const refreshed = await this.refreshSession(session.refresh_token);
      if (!refreshed) throw new Error('로그인을 다시 진행해 주세요.');
      return this.getSession();
    }
    return session;
  }

  private async refreshSession(refreshToken: string): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(refreshToken).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh(refreshToken: string): Promise<boolean> {
    try {
      const response = await this.request<AuthSession>(
        '/auth/v1/token?grant_type=refresh_token',
        { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
        false,
      );
      await this.saveSession(response);
      return true;
    } catch {
      await this.logout();
      return false;
    }
  }

  private async readSession(): Promise<AuthSession | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      await this.logout();
      return null;
    }
  }

  private saveSession(session: AuthSession): Promise<void> {
    this.realtimeClient?.realtime.setAuth(session.access_token);
    return SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  }

  private normalizeSignedUrl(url: string) {
    if (!url.startsWith('http://kong:8000')) return url;
    return `${this.baseUrl}${url.slice('http://kong:8000'.length)}`;
  }

  private mapCase(row: CaseRow): StudentCase {
    return {
      id: row.id,
      institutionId: row.institution_id,
      studentId: row.student_id,
      memo: row.memo,
      status: row.status,
      updatedAt: row.updated_at,
    };
  }

  private mapEvidence(row: EvidenceRow): RemoteEvidence {
    return {
      id: row.id,
      caseId: row.case_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      kind: row.kind,
      processingStatus: row.processing_status,
    };
  }

  private ensureConnected() {
    if (!this.connected) throw new Error('Supabase 연결 환경변수가 필요합니다.');
  }
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
