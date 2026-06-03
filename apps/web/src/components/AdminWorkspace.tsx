import { Activity, Building2, ClipboardList, FileClock, Plus, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDemoApp } from '../state/DemoAppContext';

type AdminTab = 'overview' | 'users' | 'assignments' | 'retention' | 'audit' | 'institutions';

export function AdminWorkspace() {
  const { activeProfile, addInstitution, addProfile, archiveInstitution, connected, dataset, retentionDays, setInstitutionActive, setRetentionDays, updateInstitution } = useDemoApp();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [institutionName, setInstitutionName] = useState('');
  const [institutionRegion, setInstitutionRegion] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileLoginId, setProfileLoginId] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileRole, setProfileRole] = useState<'student' | 'counselor' | 'institution_admin'>('counselor');
  const [profileInstitutionId, setProfileInstitutionId] = useState('');
  const isPlatformAdmin = activeProfile?.role === 'platform_admin';

  function createInstitution() {
    addInstitution(institutionName, institutionRegion);
    setInstitutionName('');
    setInstitutionRegion('');
  }

  function createProfile() {
    const institutionId = activeProfile?.institutionId
      ?? dataset.institutions.find((institution) => institution.id === profileInstitutionId && institution.active)?.id
      ?? (!connected ? dataset.institutions.find((institution) => institution.active)?.id : undefined)
      ?? null;
    addProfile(
      profileName,
      profileRole,
      institutionId,
      profileEmail,
      profilePassword,
      profileLoginId,
    );
    setProfileName('');
    setProfileEmail('');
    setProfileLoginId('');
    setProfilePassword('');
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">{isPlatformAdmin ? 'Platform control' : 'Institution control'}</p>
          <h1>{isPlatformAdmin ? '플랫폼 운영' : '기관 운영'}</h1>
        </div>
        <nav aria-label="관리자 메뉴">
          <AdminNav active={tab === 'overview'} icon={Activity} label="현황" onClick={() => setTab('overview')} />
          <AdminNav active={tab === 'users'} icon={Users} label="사용자·권한" onClick={() => setTab('users')} />
          <AdminNav active={tab === 'assignments'} icon={ClipboardList} label="사건 배정" onClick={() => setTab('assignments')} />
          {!isPlatformAdmin && <AdminNav active={tab === 'retention'} icon={FileClock} label="보관 정책" onClick={() => setTab('retention')} />}
          <AdminNav active={tab === 'audit'} icon={ShieldCheck} label="감사 로그" onClick={() => setTab('audit')} />
          {isPlatformAdmin && <AdminNav active={tab === 'institutions'} icon={Building2} label="기관 관리" onClick={() => setTab('institutions')} />}
        </nav>
      </aside>
      <section className="admin-main">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && (
          <UsersPanel
            name={profileName}
            connected={connected}
            email={profileEmail}
            institutionId={profileInstitutionId}
            institutions={dataset.institutions}
            isPlatformAdmin={isPlatformAdmin}
            loginId={profileLoginId}
            password={profilePassword}
            role={profileRole}
            onCreate={createProfile}
            onEmailChange={setProfileEmail}
            onInstitutionChange={setProfileInstitutionId}
            onLoginIdChange={setProfileLoginId}
            onNameChange={setProfileName}
            onPasswordChange={setProfilePassword}
            onRoleChange={setProfileRole}
          />
        )}
        {tab === 'assignments' && <AssignmentsPanel />}
        {tab === 'retention' && !isPlatformAdmin && <RetentionPanel retentionDays={retentionDays} onChange={setRetentionDays} />}
        {tab === 'audit' && <AuditPanel />}
        {tab === 'institutions' && (
          <InstitutionsPanel
            name={institutionName}
            region={institutionRegion}
            onArchive={archiveInstitution}
            onCreate={createInstitution}
            onNameChange={setInstitutionName}
            onRegionChange={setInstitutionRegion}
            onToggleActive={setInstitutionActive}
            onUpdate={updateInstitution}
          />
        )}
      </section>
    </div>
  );
}

function Overview() {
  const { dataset } = useDemoApp();
  return (
    <>
      <AdminHeading title="운영 현황" copy="구조화된 상담 전 기록의 처리 상태를 확인합니다." />
      <div className="metrics-grid">
        <MetricCard label="전체 접수" value={dataset.cases.length} copy="합성 사건 포함" />
        <MetricCard label="검토 중" value={dataset.cases.filter((item) => item.status === 'in_review').length} copy="상담자 확인 진행" />
        <MetricCard label="증거 자료" value={dataset.evidence.length} copy="비공개 Storage 대상" />
        <MetricCard label="처리 작업" value={dataset.jobs.length} copy="OCR · STT 상태" />
      </div>
      <article className="panel chart-panel">
        <div>
          <h3>최근 접수 추이</h3>
          <span className="synthetic-pill">합성 시각화</span>
        </div>
        <div className="bar-chart" aria-label="합성 접수 추이 차트">
          {[28, 42, 36, 62, 52, 78, 68, 88].map((height, index) => (
            <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
          ))}
        </div>
      </article>
    </>
  );
}

function UsersPanel({
  connected,
  email,
  institutionId,
  institutions,
  isPlatformAdmin,
  loginId,
  name,
  password,
  role,
  onCreate,
  onEmailChange,
  onInstitutionChange,
  onLoginIdChange,
  onNameChange,
  onPasswordChange,
  onRoleChange,
}: {
  connected: boolean;
  email: string;
  institutionId: string;
  institutions: { id: string; name: string; active: boolean }[];
  isPlatformAdmin: boolean;
  loginId: string;
  name: string;
  password: string;
  role: 'student' | 'counselor' | 'institution_admin';
  onCreate: () => void;
  onEmailChange: (value: string) => void;
  onInstitutionChange: (value: string) => void;
  onLoginIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (value: 'student' | 'counselor' | 'institution_admin') => void;
}) {
  const { activeProfile, dataset, setProfileActive } = useDemoApp();
  return (
    <>
      <AdminHeading title="사용자·권한" copy="기관 발급 학생 ID와 직원 역할을 관리합니다." />
      <div className="inline-form">
        <input onChange={(event) => onNameChange(event.target.value)} placeholder="새 사용자 표시 이름" value={name} />
        <select onChange={(event) => onRoleChange(event.target.value as typeof role)} value={role}>
          <option value="counselor">상담자</option>
          <option value="student">학생</option>
          {isPlatformAdmin && <option value="institution_admin">기관 관리자</option>}
        </select>
        {connected && isPlatformAdmin && (
          <select onChange={(event) => onInstitutionChange(event.target.value)} value={institutionId}>
            <option value="">기관 선택</option>
            {institutions.filter((institution) => institution.active).map((institution) => (
              <option key={institution.id} value={institution.id}>{institution.name}</option>
            ))}
          </select>
        )}
        {connected && role === 'student' && <input onChange={(event) => onLoginIdChange(event.target.value)} placeholder="학생 익명 ID" value={loginId} />}
        {connected && role !== 'student' && <input onChange={(event) => onEmailChange(event.target.value)} placeholder="직원 이메일" type="email" value={email} />}
        {connected && <input onChange={(event) => onPasswordChange(event.target.value)} placeholder="초기 비밀번호" type="password" value={password} />}
        <button className="button primary" onClick={onCreate} type="button"><Plus size={16} /> 사용자 추가</button>
      </div>
      <article className="panel table-panel">
        <table>
          <thead><tr><th>사용자</th><th>역할</th><th>소속</th><th>상태</th></tr></thead>
          <tbody>
            {dataset.profiles.map((profile) => (
              <tr key={profile.id}>
                <td><strong>{profile.displayName}</strong><small>{profile.email ?? profile.loginId ?? profile.id}</small></td>
                <td>{profile.role}</td>
                <td>{profile.institutionId ?? '플랫폼'}</td>
                <td>
                  <button
                    className={`status-toggle ${profile.active ? 'active' : 'inactive'}`}
                    disabled={profile.id === activeProfile?.id}
                    onClick={() => setProfileActive(profile.id, !profile.active)}
                    type="button"
                  >
                    {profile.active ? '활성' : '비활성'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

function AssignmentsPanel() {
  const { assignCase, dataset, redeemHandoffCode } = useDemoApp();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [handoffDraft, setHandoffDraft] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [highlightedCaseId, setHighlightedCaseId] = useState<string | null>(null);

  async function submitHandoffCode() {
    if (!handoffDraft.trim()) return;
    setHandoffBusy(true);
    try {
      const result = await redeemHandoffCode(handoffDraft);
      setHighlightedCaseId(result.caseId);
      setHandoffDraft('');
      window.alert('인계 코드와 일치하는 사건을 찾았습니다. 담당 상담자를 배정해 주세요.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '인계 코드를 확인할 수 없습니다.');
    } finally {
      setHandoffBusy(false);
    }
  }

  return (
    <>
      <AdminHeading title="사건 배정" copy="관리자 배정과 상담자 직접 가져오기를 모두 지원합니다." />
      <form className="handoff-admin-form" onSubmit={(event) => { event.preventDefault(); void submitHandoffCode(); }}>
        <input onChange={(event) => setHandoffDraft(event.target.value)} placeholder="학생 앱 인계 코드 입력: ABCDE-FGHIJ" value={handoffDraft} />
        <button className="button primary" disabled={handoffBusy || !handoffDraft.trim()} type="submit">
          {handoffBusy ? '확인 중' : '인계 코드로 사건 찾기'}
        </button>
      </form>
      <article className="panel table-panel">
        <table>
          <thead><tr><th>사건</th><th>학생</th><th>상태</th><th>담당 상담자</th></tr></thead>
          <tbody>
            {dataset.cases.map((record) => {
              const assignment = dataset.assignments.find((item) => item.caseId === record.id);
              const counselor = dataset.profiles.find((item) => item.id === assignment?.counselorId);
              const counselors = dataset.profiles.filter((profile) => (
                profile.active && profile.role === 'counselor' && profile.institutionId === record.institutionId
              ));
              const draft = drafts[record.id] ?? assignment?.counselorId ?? '';
              const assignable = ['submitted', 'assigned', 'in_review', 'reopened'].includes(record.status);
              return (
                <tr className={highlightedCaseId === record.id ? 'highlighted-row' : ''} key={record.id}>
                  <td>{caseCode(record.id)}</td>
                  <td>{record.anonymousLabel}</td>
                  <td>{record.status}</td>
                  <td>
                    <div className="assignment-control">
                      <select disabled={!assignable} onChange={(event) => setDrafts((current) => ({ ...current, [record.id]: event.target.value }))} value={draft}>
                        <option value="">상담자 선택</option>
                        {counselors.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
                      </select>
                      <button className="button secondary" disabled={!assignable || !draft} onClick={() => assignCase(record.id, draft)} type="button">
                        {counselor ? '재배정' : '배정'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </>
  );
}

function caseCode(id: string) {
  return `CASE-${id.slice(-8).toUpperCase()}`;
}

function RetentionPanel({ retentionDays, onChange }: { retentionDays: number; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState(retentionDays);
  useEffect(() => setDraft(retentionDays), [retentionDays]);
  return (
    <>
      <AdminHeading title="보관 정책" copy="학생 제출 전에 기관별 보관 기간과 삭제 복구 기간을 안내합니다." />
      <article className="panel policy-card">
        <label>기본 보관 기간<input min="1" onChange={(event) => setDraft(Number(event.target.value))} type="number" value={draft} /></label>
        <label>삭제 복구 기간<input disabled type="number" value="7" /></label>
        <p>삭제 요청 즉시 화면에서 숨기고, 7일 뒤 원본 파일과 구조화 데이터를 영구 제거합니다.</p>
        <button className="button primary" disabled={!Number.isFinite(draft) || draft < 1} onClick={() => onChange(draft)} type="button">정책 저장</button>
      </article>
    </>
  );
}

function AuditPanel() {
  const { dataset } = useDemoApp();
  return (
    <>
      <AdminHeading title="감사 로그" copy="민감 자료 자체를 복제하지 않고 누가 무엇을 했는지 기록합니다." />
      <article className="panel audit-list">
        {dataset.auditLogs.map((log) => (
          <div key={log.id}><strong>{log.action}</strong><span>{log.actorId}</span><small>{new Date(log.createdAt).toLocaleString('ko-KR')}</small></div>
        ))}
      </article>
    </>
  );
}

function InstitutionsPanel({ name, region, onArchive, onCreate, onNameChange, onRegionChange, onToggleActive, onUpdate }: { name: string; region: string; onArchive: (id: string) => void; onCreate: () => void; onNameChange: (value: string) => void; onRegionChange: (value: string) => void; onToggleActive: (id: string, active: boolean) => void; onUpdate: (id: string, name: string, region: string) => void }) {
  const { dataset } = useDemoApp();
  const [drafts, setDrafts] = useState<Record<string, { name: string; region: string }>>({});
  return (
    <>
      <AdminHeading title="기관 관리" copy="플랫폼 관리자가 기관과 초기 기관 관리자를 준비합니다." />
      <div className="inline-form">
        <input onChange={(event) => onNameChange(event.target.value)} placeholder="기관명" value={name} />
        <input onChange={(event) => onRegionChange(event.target.value)} placeholder="지역" value={region} />
        <button className="button primary" onClick={onCreate} type="button"><Plus size={16} /> 기관 추가</button>
      </div>
      <div className="institution-grid">
        {dataset.institutions.map((institution) => (
          <article className="panel institution-card" key={institution.id}>
            <Building2 size={22} aria-hidden="true" />
            <input onChange={(event) => setDrafts((current) => ({ ...current, [institution.id]: { name: event.target.value, region: current[institution.id]?.region ?? institution.region } }))} value={drafts[institution.id]?.name ?? institution.name} />
            <input onChange={(event) => setDrafts((current) => ({ ...current, [institution.id]: { name: current[institution.id]?.name ?? institution.name, region: event.target.value } }))} value={drafts[institution.id]?.region ?? institution.region} />
            <div className="institution-actions">
              <button className="button secondary" onClick={() => onUpdate(institution.id, drafts[institution.id]?.name ?? institution.name, drafts[institution.id]?.region ?? institution.region)} type="button">수정 저장</button>
              {institution.active ? (
                <button className="button secondary danger-button" onClick={() => onArchive(institution.id)} type="button">보관 처리</button>
              ) : (
                <button className="button secondary" onClick={() => onToggleActive(institution.id, true)} type="button">다시 활성화</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function AdminHeading({ title, copy }: { title: string; copy: string }) {
  return <header className="admin-heading"><p className="eyebrow">Operations</p><h2>{title}</h2><span>{copy}</span></header>;
}

function MetricCard({ label, value, copy }: { label: string; value: number; copy: string }) {
  return <article className="panel metric-card"><span>{label}</span><strong>{value}</strong><small>{copy}</small></article>;
}

function AdminNav({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Activity; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick} type="button"><Icon size={17} aria-hidden="true" />{label}</button>;
}
