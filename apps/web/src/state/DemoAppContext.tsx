import {
  Assignment,
  CaseRecord,
  createSyntheticDataset,
  type AuditLog,
  type Institution,
  type Profile,
  type SyntheticDataset,
} from '@ieumlog/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { WebApiClient, type ConnectedSnapshot } from './WebApiClient';

type CounselorNote = {
  id: string;
  caseId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

type DemoAppValue = {
  activeProfile: Profile | null;
  bootstrapping: boolean;
  connected: boolean;
  dataset: SyntheticDataset;
  retentionDays: number;
  notes: CounselorNote[];
  loginAs: (profileId: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => void;
  startReview: (caseId: string) => void;
  reopenCase: (caseId: string) => void;
  completeCase: (caseId: string) => void;
  claimCase: (caseId: string) => void;
  assignCase: (caseId: string, counselorId: string) => void;
  redeemHandoffCode: (code: string) => Promise<{ caseId: string; assignmentId: string | null; status: string }>;
  saveRelationLayout: (caseId: string, positions: Array<{ id: string; x: number; y: number; locked?: boolean }>) => Promise<void>;
  addNote: (caseId: string, body: string) => void;
  downloadEvidence: (evidenceId: string) => void;
  getEvidencePreviewUrl: (evidenceId: string) => Promise<string | null>;
  setRetentionDays: (days: number) => void;
  addInstitution: (name: string, region: string) => void;
  setInstitutionActive: (id: string, active: boolean) => void;
  updateInstitution: (id: string, name: string, region: string) => void;
  archiveInstitution: (id: string) => void;
  addProfile: (displayName: string, role: Profile['role'], institutionId: string | null, email?: string, password?: string, loginId?: string) => void;
  setProfileActive: (id: string, active: boolean) => void;
};

const webApi = new WebApiClient();
const DemoAppContext = createContext<DemoAppValue | null>(null);

function appendAudit(
  dataset: SyntheticDataset,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
): SyntheticDataset {
  const actor = dataset.profiles.find((profile) => profile.id === actorId);
  const log: AuditLog = {
    id: `audit-${dataset.auditLogs.length + 1}`,
    institutionId: actor?.institutionId ?? null,
    actorId,
    action,
    targetType,
    targetId,
    createdAt: new Date().toISOString(),
  };
  return { ...dataset, auditLogs: [log, ...dataset.auditLogs] };
}

export function DemoAppProvider({ children }: PropsWithChildren) {
  const [dataset, setDataset] = useState(createSyntheticDataset);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [retentionDays, setRetentionDaysState] = useState(30);
  const [bootstrapping, setBootstrapping] = useState(webApi.connected);
  const [notes, setNotes] = useState<CounselorNote[]>([
    {
      id: 'note-1',
      caseId: 'case-synthetic-001',
      authorId: 'counselor-1',
      body: '피해 학생의 심리 상태와 안전을 먼저 확인합니다. 단체 채팅방 참여자 목록을 추가로 확인할 필요가 있습니다.',
      createdAt: '2026-05-31T05:20:00.000Z',
    },
  ]);

  const applySnapshot = useCallback((snapshot: ConnectedSnapshot) => {
    setDataset(snapshot.dataset);
    setNotes(snapshot.notes);
    setRetentionDaysState(snapshot.retentionDays);
    setActiveProfileId(snapshot.activeProfileId);
  }, []);

  const reload = useCallback(async () => {
    if (!webApi.connected) return;
    applySnapshot(await webApi.loadSnapshot());
  }, [applySnapshot]);

  useEffect(() => {
    if (!webApi.connected) return;
    void webApi.restoreSnapshot().then((snapshot) => {
      if (snapshot) applySnapshot(snapshot);
    }).finally(() => setBootstrapping(false));
  }, [applySnapshot]);

  const activeProfile = useMemo(
    () => dataset.profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, dataset.profiles],
  );

  const updateDemoCase = useCallback(
    (caseId: string, command: (record: CaseRecord) => CaseRecord, auditAction: string) => {
      if (!activeProfileId) return;
      setDataset((current) => {
        const cases = current.cases.map((record) => (record.id === caseId ? command(record) : record));
        return appendAudit({ ...current, cases }, activeProfileId, auditAction, 'case', caseId);
      });
    },
    [activeProfileId],
  );

  const runConnected = useCallback((command: () => Promise<void>) => {
    void command().then(reload).catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : '요청을 처리할 수 없습니다.');
    });
  }, [reload]);

  const value = useMemo<DemoAppValue>(
    () => ({
      activeProfile,
      bootstrapping,
      connected: webApi.connected,
      dataset,
      retentionDays,
      notes,
      loginAs: setActiveProfileId,
      loginWithEmail: async (email, password) => {
        applySnapshot(await webApi.login(email, password));
      },
      logout: () => {
        webApi.logout();
        setActiveProfileId(null);
        if (webApi.connected) {
          setDataset(createSyntheticDataset());
          setNotes([]);
        }
      },
      startReview: (caseId) => {
        if (webApi.connected) {
          runConnected(() => webApi.updateCaseStatus(caseId, 'in_review'));
          return;
        }
        updateDemoCase(caseId, (record) => record.moveTo('in_review'), 'case.review_started');
      },
      reopenCase: (caseId) => {
        if (webApi.connected) {
          runConnected(() => webApi.updateCaseStatus(caseId, 'reopened'));
          return;
        }
        updateDemoCase(caseId, (record) => record.moveTo('reopened'), 'case.reopened');
      },
      completeCase: (caseId) => {
        if (webApi.connected) {
          runConnected(() => webApi.updateCaseStatus(caseId, 'completed'));
          return;
        }
        updateDemoCase(caseId, (record) => record.moveTo('completed'), 'case.completed');
      },
      claimCase: (caseId) => {
        if (webApi.connected) {
          runConnected(() => webApi.claimCase(caseId));
          return;
        }
        if (!activeProfileId) return;
        setDataset((current) => appendAudit(current, activeProfileId, 'case.claim_requested', 'case', caseId));
      },
      assignCase: (caseId, counselorId) => {
        if (!activeProfileId) return;
        if (webApi.connected) {
          runConnected(() => webApi.assignCase(caseId, counselorId));
          return;
        }
        setDataset((current) => {
          const now = new Date().toISOString();
          const assignments = [
            ...current.assignments.filter((assignment) => assignment.caseId !== caseId),
            new Assignment(`assignment-${current.assignments.length + 1}`, caseId, counselorId, activeProfileId, now),
          ];
          const cases = current.cases.map((record) => (
            record.id === caseId && record.status === 'submitted' ? record.moveTo('assigned', now) : record
          ));
          return appendAudit({ ...current, assignments, cases }, activeProfileId, 'case.assigned', 'case', caseId);
        });
      },
      redeemHandoffCode: async (code) => {
        if (webApi.connected) {
          const result = await webApi.redeemHandoffCode(code);
          await reload();
          return result;
        }
        const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const record = dataset.cases.find((item) => `CASE-${item.id.slice(-8).toUpperCase()}`.replace(/[^A-Z0-9]/g, '') === normalized);
        if (!record) throw new Error('인계 코드와 일치하는 사건을 찾을 수 없습니다.');
        if (activeProfile?.role === 'counselor' && record.status === 'submitted') {
          setDataset((current) => {
            const now = new Date().toISOString();
            const assignments = current.assignments.some((assignment) => assignment.caseId === record.id)
              ? current.assignments
              : [
                  ...current.assignments,
                  new Assignment(`assignment-${current.assignments.length + 1}`, record.id, activeProfile.id, activeProfile.id, now),
                ];
            const cases = current.cases.map((item) => (
              item.id === record.id && item.status === 'submitted' ? item.moveTo('assigned', now) : item
            ));
            return appendAudit({ ...current, assignments, cases }, activeProfile.id, 'case.handoff_redeemed', 'case', record.id);
          });
        } else if (activeProfileId) {
          setDataset((current) => appendAudit(current, activeProfileId, 'case.handoff_checked', 'case', record.id));
        }
        return { caseId: record.id, assignmentId: null, status: record.status };
      },
      saveRelationLayout: async (caseId, positions) => {
        if (webApi.connected) {
          await webApi.saveRelationLayout(caseId, positions);
          await reload();
          return;
        }
        if (!activeProfileId) return;
        setDataset((current) => appendAudit({
          ...current,
          people: current.people.map((person) => {
            const position = positions.find((item) => item.id === person.id);
            return position
              ? { ...person, positionX: position.x, positionY: position.y, positionLocked: position.locked ?? true }
              : person;
          }),
        }, activeProfileId, 'relation.layout_saved', 'case', caseId));
      },
      addNote: (caseId, body) => {
        if (!activeProfileId || !body.trim()) return;
        if (webApi.connected) {
          runConnected(() => webApi.addNote(caseId, body.trim()));
          return;
        }
        setNotes((current) => [
          {
            id: `note-${current.length + 1}`,
            caseId,
            authorId: activeProfileId,
            body: body.trim(),
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
        setDataset((current) => appendAudit(current, activeProfileId, 'note.created', 'case', caseId));
      },
      downloadEvidence: (evidenceId) => {
        if (webApi.connected) {
          runConnected(() => webApi.downloadEvidence(evidenceId));
        }
      },
      getEvidencePreviewUrl: async (evidenceId) => (
        webApi.connected ? webApi.getEvidenceUrl(evidenceId) : null
      ),
      setRetentionDays: (days) => {
        if (webApi.connected && activeProfile?.institutionId) {
          runConnected(() => webApi.setRetentionDays(activeProfile.institutionId!, days));
          return;
        }
        setRetentionDaysState(days);
        if (activeProfileId) {
          setDataset((current) => appendAudit(current, activeProfileId, 'retention.updated', 'institution', 'institution-wee-busan'));
        }
      },
      addInstitution: (name, region) => {
        if (!name.trim() || !activeProfileId) return;
        if (webApi.connected) {
          runConnected(() => webApi.createInstitution(name.trim(), region.trim() || '미지정'));
          return;
        }
        setDataset((current) => {
          const institution: Institution = {
            id: `institution-${current.institutions.length + 1}`,
            name: name.trim(),
            region: region.trim() || '미지정',
            active: true,
          };
          return appendAudit(
            { ...current, institutions: [...current.institutions, institution] },
            activeProfileId,
            'institution.created',
            'institution',
            institution.id,
          );
        });
      },
      setInstitutionActive: (id, active) => {
        if (webApi.connected) {
          runConnected(() => webApi.setInstitutionActive(id, active));
          return;
        }
        setDataset((current) => ({
          ...appendAudit(current, activeProfileId ?? '', 'institution.active_updated', 'institution', id),
          institutions: current.institutions.map((institution) => (
            institution.id === id ? { ...institution, active } : institution
          )),
        }));
      },
      updateInstitution: (id, name, region) => {
        if (!name.trim()) return;
        if (webApi.connected) {
          runConnected(() => webApi.updateInstitution(id, name.trim(), region.trim() || '미지정'));
          return;
        }
        setDataset((current) => ({
          ...appendAudit(current, activeProfileId ?? '', 'institution.updated', 'institution', id),
          institutions: current.institutions.map((institution) => (
            institution.id === id ? { ...institution, name: name.trim(), region: region.trim() || '미지정' } : institution
          )),
        }));
      },
      archiveInstitution: (id) => {
        if (webApi.connected) {
          runConnected(() => webApi.archiveInstitution(id));
          return;
        }
        setDataset((current) => ({
          ...appendAudit(current, activeProfileId ?? '', 'institution.archived', 'institution', id),
          institutions: current.institutions.map((institution) => (
            institution.id === id ? { ...institution, active: false } : institution
          )),
        }));
      },
      addProfile: (displayName, role, institutionId, email, password, loginId) => {
        if (!displayName.trim() || !activeProfileId) return;
        if (webApi.connected) {
          if (!institutionId || !password || (role === 'student' ? !loginId?.trim() : !email?.trim())) {
            window.alert('연결 모드 계정 발급에 필요한 항목을 확인해 주세요.');
            return;
          }
          runConnected(() => webApi.createUser({
            displayName: displayName.trim(),
            institutionId,
            role,
            email: email?.trim(),
            loginId: loginId?.trim(),
            password,
          }));
          return;
        }
        setDataset((current) => {
          const profile: Profile = {
            id: `profile-${current.profiles.length + 1}`,
            institutionId,
            role,
            displayName: displayName.trim(),
            email: email?.trim() || undefined,
            loginId: loginId?.trim() || undefined,
            active: true,
          };
          return appendAudit(
            { ...current, profiles: [...current.profiles, profile] },
            activeProfileId,
            'profile.created',
            'profile',
            profile.id,
          );
        });
      },
      setProfileActive: (id, active) => {
        if (webApi.connected) {
          runConnected(() => webApi.setProfileActive(id, active));
          return;
        }
        setDataset((current) => ({
          ...appendAudit(current, activeProfileId ?? '', 'profile.active_updated', 'profile', id),
          profiles: current.profiles.map((profile) => (profile.id === id ? { ...profile, active } : profile)),
        }));
      },
    }),
    [activeProfile, activeProfileId, applySnapshot, bootstrapping, dataset, notes, reload, retentionDays, runConnected, updateDemoCase],
  );

  return <DemoAppContext.Provider value={value}>{children}</DemoAppContext.Provider>;
}

export function useDemoApp() {
  const context = useContext(DemoAppContext);
  if (!context) throw new Error('useDemoApp must be used inside DemoAppProvider');
  return context;
}
