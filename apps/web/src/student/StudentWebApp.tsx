import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  Home,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EvidenceAsset,
  RuleBasedAnalyzer,
  type AnalysisResult,
  type EvidenceKind,
  type ProcessingStatus,
} from '@ieumlog/domain';
import {
  StudentWebApiClient,
  type HandoffCodeResult,
  type RemoteEvidence,
  type RemoteFact,
  type RemoteQuestion,
} from './StudentWebApiClient';
import {
  mergeQuestionAnswerDrafts,
  nextQuestionSaveVersion,
  questionSaveBlockReason,
  retainQuestionValues,
  shouldApplyQuestionSaveResult,
  shouldBlockAnalysisStepAdvance,
  shouldRequireAnalysisAfterRestore,
  shouldShowLockedStudentCase,
  studentSubmitBlockReason,
  type QuestionSaveStatus,
} from './studentFlow';

const studentApi = new StudentWebApiClient();
const analyzer = new RuleBasedAnalyzer();
const DEMO_CASE_ID = 'student-web-demo';
const LOCAL_DRAFT_KEY = 'ieumlog:web-student-draft';
const SAMPLE_STUDENT_LOGIN_ID = 'WEE-24-0510';
const SAMPLE_DEMO_PASSWORD = import.meta.env.VITE_SUPABASE_URL?.includes('supabase.co') ? 'IeumlogDemo2026!' : 'demo1234';
const stages = ['안내', '사건 메모', '증거', '분석', '질문', '확인'] as const;

type StudentView = 'home' | 'wizard';

type LocalEvidence = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: EvidenceKind;
  processingStatus?: ProcessingStatus;
  durationSeconds?: number;
};

export function StudentWebApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<StudentView>('home');
  const [loginId, setLoginId] = useState(SAMPLE_STUDENT_LOGIN_ID);
  const [password, setPassword] = useState(SAMPLE_DEMO_PASSWORD);
  const [caseId, setCaseId] = useState(DEMO_CASE_ID);
  const [step, setStep] = useState(0);
  const [memo, setMemo] = useState('');
  const [evidence, setEvidence] = useState<LocalEvidence[]>([]);
  const [questions, setQuestions] = useState<RemoteQuestion[]>([]);
  const [questionAnswerDrafts, setQuestionAnswerDrafts] = useState<Record<string, string>>({});
  const [questionSaveStatuses, setQuestionSaveStatuses] = useState<Record<string, QuestionSaveStatus>>({});
  const questionSaveVersions = useRef<Record<string, number>>({});
  const [facts, setFacts] = useState<RemoteFact[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisRequired, setAnalysisRequired] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [restored, setRestored] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [handoffCode, setHandoffCode] = useState<HandoffCodeResult | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const submissionInFlight = useRef(false);

  const resetQuestionAnswers = useCallback(() => {
    questionSaveVersions.current = {};
    setQuestionAnswerDrafts({});
    setQuestionSaveStatuses({});
  }, []);

  const refreshConnectedData = useCallback(async (activeCaseId: string) => {
    if (!studentApi.connected || activeCaseId === DEMO_CASE_ID) return { factCount: 0 };
    const [remoteEvidence, remoteQuestions, remoteFacts] = await Promise.all([
      studentApi.listEvidence(activeCaseId),
      studentApi.listQuestions(activeCaseId),
      studentApi.listFacts(activeCaseId),
    ]);
    setEvidence(remoteEvidence.map(mapRemoteEvidence));
    setQuestions(remoteQuestions);
    setQuestionAnswerDrafts((current) => mergeQuestionAnswerDrafts(current, remoteQuestions));
    setQuestionSaveStatuses((current) => retainQuestionValues(current, remoteQuestions));
    questionSaveVersions.current = retainQuestionValues(questionSaveVersions.current, remoteQuestions);
    setFacts(remoteFacts);
    return { factCount: remoteFacts.length };
  }, []);

  const openConnectedCase = useCallback(async () => {
    const record = await studentApi.getOrCreateCurrentCase();
    const locked = shouldShowLockedStudentCase(record.status);
    setCaseId(record.id);
    setMemo(record.memo);
    setStep(0);
    setEvidence([]);
    setQuestions([]);
    resetQuestionAnswers();
    setFacts([]);
    setAnalysis(null);
    setAnalysisRequired(false);
    setSubmitted(locked);
    setDeleteRequested(false);
    setHandoffCode(null);
    setRestored(false);
    const { factCount } = await refreshConnectedData(record.id);
    setAnalysisRequired(!locked && shouldRequireAnalysisAfterRestore(record.memo, null, factCount));
    setLoggedIn(true);
    setView('home');
  }, [refreshConnectedData, resetQuestionAnswers]);

  useEffect(() => {
    if (studentApi.connected) {
      void studentApi.restoreSession().then((active) => {
        if (active) void openConnectedCase();
      }).catch(() => undefined);
      return;
    }
    const snapshot = readLocalDraft();
    if (snapshot) {
      setMemo(snapshot.memo);
      setStep(snapshot.step);
      setRestored(true);
    }
  }, [openConnectedCase]);

  useEffect(() => {
    if (!loggedIn || submitted || submitting) return;
    const timeout = window.setTimeout(() => {
      if (studentApi.connected && caseId !== DEMO_CASE_ID) {
        void studentApi.updateMemo(caseId, memo).catch(() => undefined);
        return;
      }
      saveLocalDraft({ memo, step });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [caseId, loggedIn, memo, step, submitted, submitting]);

  useEffect(() => {
    if (!loggedIn || !studentApi.connected || submitted || caseId === DEMO_CASE_ID) return;
    const interval = window.setInterval(() => {
      void refreshConnectedData(caseId).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [caseId, loggedIn, refreshConnectedData, submitted]);

  const progress = useMemo(() => Math.round(((step + 1) / stages.length) * 100), [step]);
  const submitBlockReason = useMemo(
    () => studentSubmitBlockReason(analysisRequired, facts.length, evidence.map((asset) => asset.processingStatus)),
    [analysisRequired, evidence, facts.length],
  );
  const analysisStepAdvanceBlocked = useMemo(
    () => shouldBlockAnalysisStepAdvance(analysisRequired, analyzing, facts.length),
    [analysisRequired, analyzing, facts.length],
  );
  const pendingQuestionSave = useMemo(
    () => questionSaveBlockReason(questionSaveStatuses),
    [questionSaveStatuses],
  );

  function updateMemo(value: string) {
    setMemo(value);
    setAnalysisRequired(true);
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginId.trim() || !password) return;
    setBusy(true);
    setLoginError('');
    setNotice('');
    try {
      if (studentApi.connected) {
        await studentApi.login(loginId, password);
        await openConnectedCase();
      } else {
        setLoggedIn(true);
        setSubmitted(false);
        setDeleteRequested(false);
        setView('home');
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '로그인할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function startNewCase() {
    setBusy(true);
    setNotice('');
    try {
      if (studentApi.connected) {
        await studentApi.createDraftCase();
        await openConnectedCase();
      } else {
        clearLocalDraft();
        setCaseId(DEMO_CASE_ID);
        setStep(0);
        setMemo('');
        setEvidence([]);
        setQuestions([]);
        resetQuestionAnswers();
        setFacts([]);
        setAnalysis(null);
        setAnalysisRequired(false);
        setSubmitted(false);
        setDeleteRequested(false);
        setHandoffCode(null);
        setRestored(false);
        setView('wizard');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '새 기록을 만들 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await studentApi.logout().catch(() => undefined);
    setLoggedIn(false);
    setSubmitted(false);
    setView('home');
    setStep(0);
    setNotice('');
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setNotice('');
    const availableSlots = Math.max(0, 50 - evidence.length);
    const candidates = Array.from(files);
    const withinSizeLimit = candidates.filter((file) => file.size <= 50_000_000);
    const accepted = withinSizeLimit.slice(0, availableSlots);
    if (withinSizeLimit.length !== candidates.length) {
      setNotice('50MB를 넘는 파일은 등록하지 않았습니다.');
    } else if (accepted.length !== candidates.length) {
      setNotice('사건당 최대 50개 파일까지만 등록할 수 있습니다.');
    }
    if (!accepted.length) return;

    const incoming = await Promise.all(accepted.map(async (file) => {
      const kind = evidenceKind(file.type, file.name);
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind,
        processingStatus: studentApi.connected ? 'queued' : 'completed',
        durationSeconds: kind === 'audio' ? await readAudioDurationSeconds(file) : undefined,
      } satisfies LocalEvidence;
    }));
    setEvidence((current) => [...current, ...incoming]);
    if (!studentApi.connected) return;

    const failed: string[] = [];
    setUploadingEvidence(true);
    try {
      for (const [index, file] of accepted.entries()) {
        const asset = incoming[index];
        if (!asset) continue;
        try {
          await studentApi.uploadEvidence(caseId, file, asset.kind, asset.durationSeconds);
        } catch {
          failed.push(file.name);
        }
      }
      const uploaded = await studentApi.listEvidence(caseId);
      setEvidence(uploaded.map(mapRemoteEvidence));
    } finally {
      setUploadingEvidence(false);
    }
    if (failed.length) setNotice(`${failed.length}개 파일 업로드를 완료하지 못했습니다. 나머지는 계속 등록되었습니다.`);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setNotice('');
    resetQuestionAnswers();
    if (studentApi.connected) {
      try {
        await studentApi.analyzeCase(caseId, memo);
        await refreshConnectedData(caseId);
        setAnalysis({
          factBlocks: [],
          questions: [],
          summary: '입력 기록을 FactBlock 후보와 확인 질문으로 정리했습니다.',
          usedExternalAi: false,
        });
        setAnalysisRequired(false);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '기록 정리에 실패했습니다.');
      } finally {
        setAnalyzing(false);
      }
      return;
    }

    const localEvidence = evidence.map((asset) => new EvidenceAsset(
      asset.id,
      DEMO_CASE_ID,
      asset.name,
      asset.mimeType,
      asset.size,
      asset.kind,
      `${DEMO_CASE_ID}/${asset.name}`,
      true,
      new Date().toISOString(),
      asset.processingStatus ?? 'completed',
    ));
    const result = await analyzer.analyze({ caseId: DEMO_CASE_ID, memo, evidence: localEvidence, synthetic: true });
    window.setTimeout(() => {
      setAnalysis(result);
      setFacts(result.factBlocks.map((fact) => ({
        id: fact.id,
        sequence: fact.sequence,
        occurredAt: fact.occurredAt,
        location: fact.location,
        action: fact.action,
        confirmed: fact.confirmed,
      })));
      setQuestionAnswerDrafts(Object.fromEntries(result.questions.map((question) => [question.id, question.answer ?? ''])));
      setAnalysisRequired(false);
      setAnalyzing(false);
    }, 450);
  }

  function updateQuestionAnswerDraft(id: string, answer: string) {
    questionSaveVersions.current[id] = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    setQuestionAnswerDrafts((current) => ({ ...current, [id]: answer }));
    setQuestionSaveStatuses((current) => ({ ...current, [id]: 'dirty' }));
  }

  async function saveAnswer(id: string, answer: string) {
    const normalized = answer.trim();
    setQuestionAnswerDrafts((current) => ({ ...current, [id]: normalized }));
    const version = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    questionSaveVersions.current[id] = version;
    setQuestionSaveStatuses((current) => ({ ...current, [id]: 'saving' }));
    if (!studentApi.connected) {
      window.setTimeout(() => {
        if (shouldApplyQuestionSaveResult(questionSaveVersions.current[id], version)) {
          setQuestionSaveStatuses((current) => ({ ...current, [id]: 'saved' }));
        }
      }, 180);
      return;
    }
    try {
      await studentApi.answerQuestion(id, normalized);
      if (shouldApplyQuestionSaveResult(questionSaveVersions.current[id], version)) {
        setQuestionSaveStatuses((current) => ({ ...current, [id]: 'saved' }));
      }
    } catch (error) {
      if (shouldApplyQuestionSaveResult(questionSaveVersions.current[id], version)) {
        setQuestionSaveStatuses((current) => ({ ...current, [id]: 'error' }));
      }
      setNotice(error instanceof Error ? error.message : '답변을 저장할 수 없습니다.');
    }
  }

  function discardQuestionAnswerDraft(id: string) {
    questionSaveVersions.current[id] = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    const serverAnswer = questions.find((question) => question.id === id)?.answer ?? '';
    setQuestionAnswerDrafts((current) => ({ ...current, [id]: serverAnswer }));
    setQuestionSaveStatuses((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function submitCase() {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setNotice('');
    try {
      if (studentApi.connected) await studentApi.submit(caseId, memo);
      clearLocalDraft();
      setSubmitted(true);
      setView('home');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '기록을 제출할 수 없습니다.');
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }

  async function createHandoffCode() {
    if (!studentApi.connected) {
      setNotice('인계 코드는 Supabase 연결 모드에서 제출된 사건에만 만들 수 있습니다.');
      return;
    }
    setHandoffBusy(true);
    setNotice('');
    try {
      setHandoffCode(await studentApi.createHandoffCode(caseId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '인계 코드를 만들 수 없습니다.');
    } finally {
      setHandoffBusy(false);
    }
  }

  async function copyHandoffCode(code: string) {
    await navigator.clipboard?.writeText(code);
    setNotice('관리자에게 전달할 인계 코드를 복사했습니다.');
  }

  async function scheduleDeletion() {
    if (!window.confirm('삭제 요청을 접수할까요? 요청 즉시 화면에서 숨기고 7일 뒤 원본까지 제거됩니다.')) return;
    setBusy(true);
    setNotice('');
    try {
      if (studentApi.connected) await studentApi.scheduleDeletion(caseId);
      setDeleteRequested(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '삭제를 요청할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshLockedCase() {
    if (!studentApi.connected) return;
    setBusy(true);
    setNotice('');
    try {
      const record = await studentApi.getCase(caseId);
      if (!record || shouldShowLockedStudentCase(record.status)) {
        setNotice('아직 상담자가 기록을 재개방하지 않았습니다.');
        return;
      }
      await openConnectedCase();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '재개방 상태를 확인할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <StudentLogin
        busy={busy}
        connected={studentApi.connected}
        error={loginError}
        loginId={loginId}
        password={password}
        onLogin={login}
        onPasswordChange={setPassword}
        onSample={() => {
          setLoginId(SAMPLE_STUDENT_LOGIN_ID);
          setPassword(SAMPLE_DEMO_PASSWORD);
          setLoginError('');
        }}
        onStudentIdChange={setLoginId}
      />
    );
  }

  if (submitted) {
    return (
      <SubmittedPanel
        busy={busy}
        connected={studentApi.connected}
        deleteRequested={deleteRequested}
        handoffBusy={handoffBusy}
        handoffCode={handoffCode}
        notice={notice}
        onCopy={copyHandoffCode}
        onCreateHandoffCode={createHandoffCode}
        onLogout={logout}
        onRefreshLockedCase={refreshLockedCase}
        onScheduleDeletion={scheduleDeletion}
        onStartNewCase={startNewCase}
      />
    );
  }

  if (view === 'home') {
    return (
      <StudentHome
        analysisRequired={analysisRequired}
        connected={studentApi.connected}
        evidence={evidence}
        facts={facts}
        memo={memo}
        notice={notice}
        questions={questions}
        restored={restored}
        step={step}
        onContinue={() => setView('wizard')}
        onLogout={logout}
        onStartNewCase={() => void startNewCase()}
      />
    );
  }

  return (
    <main className="student-web-shell">
      <header className="student-web-topbar">
        <button className="student-icon-button" onClick={() => setView('home')} type="button" aria-label="내 기록 홈">
          <Home size={18} />
        </button>
        <div className="student-brand">
          <img alt="" src="/ieumlog-icon.png" />
          <span>이음로그</span>
        </div>
        <span className="student-mode-pill">{studentApi.connected ? 'Supabase 연결' : '합성 데모'}</span>
      </header>

      <section className="student-web-wizard">
        <aside className="student-progress-card">
          <p className="eyebrow">기록 단계</p>
          <h1>{stages[step]}</h1>
          <p>한 번에 완벽하지 않아도 괜찮습니다. 기억나는 것부터 천천히 정리합니다.</p>
          <div className="student-progress-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <StageStepper currentStep={step} onSelect={setStep} />
        </aside>

        <section className="student-step-panel">
          {notice && <div className="student-notice" role="status">{notice}</div>}
          {restored && <div className="student-notice soft" role="status">이전에 작성하던 브라우저 초안을 불러왔습니다.</div>}
          {step === 0 && <SafetyPanel />}
          {step === 1 && <MemoPanel memo={memo} onChange={updateMemo} />}
          {step === 2 && (
            <EvidencePanel
              evidence={evidence}
              uploading={uploadingEvidence}
              onFiles={(files) => void addFiles(files)}
            />
          )}
          {step === 3 && (
            <AnalysisPanel
              analysis={analysis}
              analyzing={analyzing}
              evidence={evidence}
              onAnalyze={() => void runAnalysis()}
            />
          )}
          {step === 4 && (
            <QuestionsPanel
              analysis={analysis}
              answers={questionAnswerDrafts}
              connected={studentApi.connected}
              questions={questions}
              saveStatuses={questionSaveStatuses}
              onAnswer={(id, answer) => void saveAnswer(id, answer)}
              onAnswerChange={updateQuestionAnswerDraft}
              onDiscard={discardQuestionAnswerDraft}
            />
          )}
          {step === 5 && (
            <ConfirmPanel
              evidence={evidence}
              facts={analysisRequired ? [] : facts}
              memo={memo}
              questions={questions}
            />
          )}
          <div className="student-bottom-actions">
            {step > 0 && <button className="button secondary" onClick={() => setStep((current) => current - 1)} type="button">이전</button>}
            <button
              className="button primary"
              disabled={
                (step === 3 && analysisStepAdvanceBlocked)
                || (step === 4 && pendingQuestionSave !== null)
                || (step === stages.length - 1 && (submitBlockReason !== null || pendingQuestionSave !== null || submitting))
              }
              onClick={() => {
                if (step === stages.length - 1) {
                  void submitCase();
                  return;
                }
                setStep((current) => Math.min(current + 1, stages.length - 1));
              }}
              type="button"
            >
              {nextButtonLabel({ step, analyzing, submitting, analysisStepAdvanceBlocked, pendingQuestionSave, submitBlockReason })}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

function StudentLogin({
  busy,
  connected,
  error,
  loginId,
  password,
  onLogin,
  onPasswordChange,
  onSample,
  onStudentIdChange,
}: {
  busy: boolean;
  connected: boolean;
  error: string;
  loginId: string;
  password: string;
  onLogin: (event: React.FormEvent<HTMLFormElement>) => void;
  onPasswordChange: (value: string) => void;
  onSample: () => void;
  onStudentIdChange: (value: string) => void;
}) {
  return (
    <main className="student-web-shell student-login-screen">
      <section className="student-login-hero">
        <div className="student-brand large">
          <img alt="" src="/ieumlog-icon.png" />
          <span>이음로그</span>
        </div>
        <p className="eyebrow">학교폭력 상담 전 기록 정리</p>
        <h1>기록이 이어지고,<br />신뢰가 쌓입니다.</h1>
        <p>
          개인 이메일 대신 기관에서 받은 익명 학생 ID로 시작합니다.
          사건 메모, 증거, 확인 질문, 제출 완료 뒤 인계 코드까지 한 흐름으로 정리합니다.
        </p>
        <div className="student-trust-grid">
          <span><ShieldCheck size={18} /> 비판단 정리</span>
          <span><LockKeyhole size={18} /> 브라우저 세션 보호</span>
          <span><Sparkles size={18} /> 상담 전 준비</span>
        </div>
      </section>

      <section className="student-login-card" aria-label="학생 로그인">
        <img alt="이음로그 로고" className="student-login-logo" src="/ieumlog-logo.png" />
        <div className="student-sample-card">
          <strong>시연용 학생 계정</strong>
          <span>학생 ID: {SAMPLE_STUDENT_LOGIN_ID}</span>
          <span>비밀번호: {SAMPLE_DEMO_PASSWORD}</span>
          <button className="button secondary" onClick={onSample} type="button">샘플 값 채우기</button>
        </div>
        <form className="student-login-form" onSubmit={onLogin}>
          <label>기관 발급 학생 ID<input autoComplete="username" onChange={(event) => onStudentIdChange(event.target.value)} value={loginId} /></label>
          <label>비밀번호<input autoComplete="current-password" onChange={(event) => onPasswordChange(event.target.value)} type="password" value={password} /></label>
          {error && <span className="form-error">{error}</span>}
          <button className="button primary" disabled={busy} type="submit">
            {busy ? '확인 중...' : '안전하게 시작하기'} <ArrowRight size={16} />
          </button>
        </form>
        <p className="student-footnote">{connected ? 'Supabase 연결 모드 · 기관 발급 계정을 확인합니다.' : '합성 데이터 데모 · hosted 연결 시 같은 화면에서 실제 계정을 확인합니다.'}</p>
      </section>
    </main>
  );
}

function StudentHome({
  analysisRequired,
  connected,
  evidence,
  facts,
  memo,
  notice,
  questions,
  restored,
  step,
  onContinue,
  onLogout,
  onStartNewCase,
}: {
  analysisRequired: boolean;
  connected: boolean;
  evidence: LocalEvidence[];
  facts: RemoteFact[];
  memo: string;
  notice: string;
  questions: RemoteQuestion[];
  restored: boolean;
  step: number;
  onContinue: () => void;
  onLogout: () => void;
  onStartNewCase: () => void;
}) {
  const pendingEvidence = evidence.filter((asset) => ['queued', 'processing'].includes(asset.processingStatus ?? '')).length;
  return (
    <main className="student-web-shell">
      <header className="student-web-topbar">
        <div className="student-brand">
          <img alt="" src="/ieumlog-icon.png" />
          <span>이음로그</span>
        </div>
        <div className="student-top-actions">
          <span className="student-mode-pill">{connected ? 'Supabase 연결' : '합성 데모'}</span>
          <button className="button ghost" onClick={onLogout} type="button">로그아웃</button>
        </div>
      </header>
      <section className="student-home-hero">
        <div>
          <p className="eyebrow">내 기록 홈</p>
          <h1>오늘의 기록을<br />차분하게 이어가요.</h1>
          <p>상담 전 필요한 내용을 학생이 직접 확인하고, 제출 후에는 관리자에게 인계 코드를 전달할 수 있습니다.</p>
        </div>
        <div className="student-next-card">
          <span><Clock3 size={18} /> 다음 행동</span>
          <strong>{nextActionCopy({ analysisRequired, facts, memo, step })}</strong>
          <button className="button primary" onClick={onContinue} type="button">기록 이어서 작성 <ArrowRight size={16} /></button>
        </div>
      </section>
      {notice && <div className="student-notice" role="status">{notice}</div>}
      {restored && <div className="student-notice soft" role="status">이 브라우저에서 작성하던 임시 입력을 복구했습니다.</div>}
      <section className="student-home-grid">
        <MetricCard label="현재 단계" value={`${step + 1}/${stages.length}`} caption={stages[step] ?? stages[0]} />
        <MetricCard label="증거 파일" value={`${evidence.length}`} caption={pendingEvidence ? `${pendingEvidence}개 처리 중` : '처리 대기 없음'} />
        <MetricCard label="FactBlock" value={`${facts.length}`} caption={analysisRequired ? '재정리 필요' : '검토 가능'} />
        <MetricCard label="확인 질문" value={`${questions.length}`} caption={questions.filter((question) => question.resolved).length ? '일부 답변됨' : '답변 대기'} />
      </section>
      <section className="student-dashboard-grid">
        <div className="student-card">
          <h2>기록 상태</h2>
          <ul className="student-status-list">
            <li><CheckCircle2 size={17} /> 익명 학생 ID로 접근</li>
            <li><FileText size={17} /> 메모 {memo.length}자 작성</li>
            <li><UploadCloud size={17} /> 증거 {evidence.length}개 연결</li>
            <li><KeyRound size={17} /> 제출 후 1회용 인계 코드 생성</li>
          </ul>
        </div>
        <div className="student-card gold">
          <h2>시연용 안내</h2>
          <p>학생 ID는 <b>{SAMPLE_STUDENT_LOGIN_ID}</b>, 비밀번호는 <b>{SAMPLE_DEMO_PASSWORD}</b>입니다. 브라우저 학생 화면은 <b>/student</b> 경로에서 직접 접근할 수 있습니다.</p>
          <button className="button secondary" disabled={!connected} onClick={onStartNewCase} type="button">새 기록 작성</button>
        </div>
      </section>
    </main>
  );
}

function StageStepper({ currentStep, onSelect }: { currentStep: number; onSelect: (step: number) => void }) {
  return (
    <ol className="student-stepper">
      {stages.map((stage, index) => (
        <li key={stage}>
          <button className={index === currentStep ? 'active' : ''} onClick={() => onSelect(index)} type="button">
            <span>{index + 1}</span>
            {stage}
          </button>
        </li>
      ))}
    </ol>
  );
}

function SafetyPanel() {
  return (
    <article className="student-step-content">
      <p className="eyebrow">안전 안내</p>
      <h2>먼저, 지금 안전한지 확인할게요.</h2>
      <p>지금 당장 위험하거나 긴급한 도움이 필요하면 이 기록보다 주변의 신뢰할 수 있는 어른과 긴급 지원에 먼저 알려 주세요.</p>
      <div className="student-feature-grid">
        <span><ShieldCheck size={20} /> AI는 판단하지 않고 사실 후보만 정리합니다.</span>
        <span><LockKeyhole size={20} /> 실제 학생 자료 외부 AI 전송은 차단됩니다.</span>
        <span><FileText size={20} /> 빠진 정보는 질문 카드로 다시 확인합니다.</span>
      </div>
    </article>
  );
}

function MemoPanel({ memo, onChange }: { memo: string; onChange: (value: string) => void }) {
  return (
    <article className="student-step-content">
      <p className="eyebrow">사건 메모</p>
      <h2>기억나는 순서대로 적어 주세요.</h2>
      <p>정확한 문장이 아니어도 괜찮습니다. 날짜, 장소, 관련 인물, 어떤 일이 있었는지를 중심으로 남겨 주세요.</p>
      <textarea
        maxLength={1000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예: 5월 10일 복도에서 B 학생이 단톡방 캡처를 보여주며 조롱했습니다."
        value={memo}
      />
      <span className="student-counter">{memo.length}/1000자 · 브라우저에서는 sessionStorage와 DB autosave를 우선합니다.</span>
    </article>
  );
}

function EvidencePanel({ evidence, uploading, onFiles }: { evidence: LocalEvidence[]; uploading: boolean; onFiles: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <article className="student-step-content">
      <p className="eyebrow">증거 업로드</p>
      <h2>관련 자료를 연결해 주세요.</h2>
      <p>이미지·PDF는 OCR, 15분 이하이면서 25MB 이하인 음성은 STT 대상입니다. 영상과 일반 문서는 저장과 열람 중심으로 다룹니다.</p>
      <input
        className="sr-only"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          void onFiles(files);
          event.currentTarget.value = '';
        }}
        ref={inputRef}
        type="file"
      />
      <button className="student-upload-card" disabled={uploading} onClick={() => inputRef.current?.click()} type="button">
        <UploadCloud size={32} />
        <strong>{uploading ? '파일을 안전하게 등록하고 있어요' : '파일 선택하기'}</strong>
        <span>파일당 50MB · 사건당 50개</span>
      </button>
      <div className="student-file-list">
        {evidence.map((asset) => (
          <div key={asset.id} className="student-file-row">
            <FileText size={18} />
            <span>
              <strong>{asset.name}</strong>
              <small>{asset.kind.toUpperCase()} · {(asset.size / 1_000_000).toFixed(1)}MB{asset.durationSeconds ? ` · ${formatDuration(asset.durationSeconds)}` : ''}</small>
            </span>
            <em className={`student-status ${asset.processingStatus ?? 'queued'}`}>{processingStatusLabel(asset.processingStatus)}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function AnalysisPanel({ analysis, analyzing, evidence, onAnalyze }: { analysis: AnalysisResult | null; analyzing: boolean; evidence: LocalEvidence[]; onAnalyze: () => void }) {
  const pending = evidence.filter((asset) => ['queued', 'processing'].includes(asset.processingStatus ?? '')).length;
  return (
    <article className="student-step-content">
      <p className="eyebrow">기록 정리</p>
      <h2>FactBlock 후보로 정리합니다.</h2>
      <p>AI는 판단하지 않고, 학생이 직접 확인할 수 있는 사실 후보와 누락 질문을 만듭니다.</p>
      <div className="student-analysis-card">
        <Sparkles size={36} />
        <strong>{analyzing ? '기록을 정리하고 있어요' : analysis?.summary ?? '기록 정리를 시작할 준비가 되었습니다.'}</strong>
        <span>실제 학생 자료를 외부 AI로 전송하지 않습니다.</span>
        {pending ? <span>{pending}개 증거 파일 처리 결과가 순차 반영됩니다.</span> : null}
      </div>
      <button className="button primary" disabled={analyzing} onClick={onAnalyze} type="button">
        {analysis ? '다시 정리하기' : '기록 정리 시작'} <Sparkles size={16} />
      </button>
    </article>
  );
}

function QuestionsPanel({
  analysis,
  answers,
  connected,
  questions: remoteQuestions,
  saveStatuses,
  onAnswer,
  onAnswerChange,
  onDiscard,
}: {
  analysis: AnalysisResult | null;
  answers: Record<string, string>;
  connected: boolean;
  questions: RemoteQuestion[];
  saveStatuses: Record<string, QuestionSaveStatus>;
  onAnswer: (id: string, answer: string) => void;
  onAnswerChange: (id: string, answer: string) => void;
  onDiscard: (id: string) => void;
}) {
  const questions = remoteQuestions.length ? remoteQuestions.slice(0, 6) : (analysis?.questions.slice(0, 6) ?? []);
  return (
    <article className="student-step-content">
      <p className="eyebrow">확인 질문</p>
      <h2>빠진 정보를 질문 카드로 확인합니다.</h2>
      <p>답하기 어려운 항목은 비워도 됩니다. 상담자가 확인할 수 있도록 현재 기억만 남겨 주세요.</p>
      {questions.length ? (
        <div className="student-question-list">
          {questions.map((question, index) => {
            const answer = answers[question.id] ?? question.answer ?? '';
            const status = saveStatuses[question.id];
            return (
              <div className="student-question-card" key={question.id}>
                <span>질문 {index + 1}</span>
                <strong>{question.prompt}</strong>
                <input
                  onBlur={(event) => onAnswer(question.id, event.currentTarget.value)}
                  onChange={(event) => onAnswerChange(question.id, event.target.value)}
                  placeholder="기억나는 만큼만 적어 주세요."
                  value={answer}
                />
                <small className={status === 'error' ? 'danger' : ''}>{questionSaveStatusLabel(status, connected)}</small>
                {status === 'error' && (
                  <div className="student-question-actions">
                    <button className="button secondary" onClick={() => onAnswer(question.id, answer)} type="button">다시 저장</button>
                    <button className="button ghost" onClick={() => onDiscard(question.id)} type="button">변경 취소</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="student-empty-card">먼저 분석 단계에서 기록 정리를 시작해 주세요.</div>
      )}
    </article>
  );
}

function ConfirmPanel({ evidence, facts, memo, questions }: { evidence: LocalEvidence[]; facts: RemoteFact[]; memo: string; questions: RemoteQuestion[] }) {
  return (
    <article className="student-step-content">
      <p className="eyebrow">제출 전 확인</p>
      <h2>내가 제출할 내용을 한 번 더 봅니다.</h2>
      <p>제출 뒤에는 기록이 잠기고, 상담자가 재개방해야 수정할 수 있습니다.</p>
      <div className="student-summary-grid">
        <MetricCard label="메모" value={`${memo.length}`} caption="작성 글자 수" />
        <MetricCard label="증거" value={`${evidence.length}`} caption="연결 파일" />
        <MetricCard label="FactBlock" value={`${facts.length}`} caption="정리 후보" />
        <MetricCard label="질문" value={`${questions.length}`} caption="확인 항목" />
      </div>
      <FactCards facts={facts} />
      <div className="student-rights-card">
        <strong>학생 통제권</strong>
        <span>제출 전 언제든 수정할 수 있습니다.</span>
        <span>삭제 요청 시 화면에서 즉시 숨기고 7일 뒤 원본까지 제거합니다.</span>
      </div>
    </article>
  );
}

function SubmittedPanel({
  busy,
  connected,
  deleteRequested,
  handoffBusy,
  handoffCode,
  notice,
  onCopy,
  onCreateHandoffCode,
  onLogout,
  onRefreshLockedCase,
  onScheduleDeletion,
  onStartNewCase,
}: {
  busy: boolean;
  connected: boolean;
  deleteRequested: boolean;
  handoffBusy: boolean;
  handoffCode: HandoffCodeResult | null;
  notice: string;
  onCopy: (code: string) => Promise<void>;
  onCreateHandoffCode: () => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshLockedCase: () => Promise<void>;
  onScheduleDeletion: () => Promise<void>;
  onStartNewCase: () => Promise<void>;
}) {
  return (
    <main className="student-web-shell student-submitted-screen">
      <section className="student-submitted-card">
        <div className="student-success-mark"><CheckCircle2 size={34} /></div>
        <p className="eyebrow">제출 완료</p>
        <h1>기록을 제출했어요.</h1>
        <p>{deleteRequested ? '삭제 요청이 접수되어 화면에서 숨겨집니다.' : '상담자가 내용을 확인합니다. 수정이 필요하면 상담자가 기록을 재개방합니다.'}</p>
        {notice && <div className="student-notice" role="status">{notice}</div>}
        <div className="student-handoff-card">
          <span><KeyRound size={18} /> 관리자 전달 코드</span>
          {connected ? (
            handoffCode ? (
              <>
                <strong>{handoffCode.code}</strong>
                <small>만료: {new Date(handoffCode.expiresAt).toLocaleString('ko-KR')}</small>
              </>
            ) : (
              <small>아직 생성된 인계 코드가 없습니다. 코드는 1회용이며 새로 만들면 이전 코드는 폐기됩니다.</small>
            )
          ) : (
            <small>Supabase 연결 모드에서 제출된 사건만 인계 코드를 만들 수 있습니다.</small>
          )}
          <div>
            <button className="button secondary" disabled={!connected || handoffBusy || deleteRequested} onClick={() => void onCreateHandoffCode()} type="button">
              {handoffBusy ? '생성 중...' : handoffCode ? '새 코드 만들기' : '코드 만들기'}
            </button>
            {handoffCode && <button className="button primary" disabled={deleteRequested} onClick={() => void onCopy(handoffCode.code)} type="button"><Copy size={16} /> 복사</button>}
          </div>
        </div>
        <div className="student-submitted-actions">
          {connected && !deleteRequested && <button className="button secondary" disabled={busy} onClick={() => void onRefreshLockedCase()} type="button"><RefreshCcw size={16} /> 재개방 확인</button>}
          {!deleteRequested && <button className="button secondary danger-button" disabled={busy} onClick={() => void onScheduleDeletion()} type="button"><Trash2 size={16} /> 삭제 요청</button>}
          {connected && !deleteRequested && <button className="button secondary" disabled={busy} onClick={() => void onStartNewCase()} type="button">새 기록 작성</button>}
          <button className="button ghost" onClick={() => void onLogout()} type="button">처음 화면으로</button>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ caption, label, value }: { caption: string; label: string; value: string }) {
  return (
    <div className="student-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

function FactCards({ facts }: { facts: RemoteFact[] }) {
  if (!facts.length) return <div className="student-empty-card">아직 표시할 FactBlock이 없습니다. 분석을 완료한 뒤 다시 확인해 주세요.</div>;
  return (
    <div className="student-fact-list">
      {facts.map((fact) => (
        <div className="student-fact-card" key={fact.id}>
          <span>FactBlock {fact.sequence}</span>
          <strong>{fact.action}</strong>
          <small>{fact.location ?? '장소 확인 필요'} · {fact.occurredAt ?? '시기 확인 필요'}</small>
        </div>
      ))}
    </div>
  );
}

function mapRemoteEvidence(asset: RemoteEvidence): LocalEvidence {
  return {
    id: asset.id,
    name: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.sizeBytes,
    kind: asset.kind,
    processingStatus: asset.processingStatus,
  };
}

function evidenceKind(mimeType: string, name: string): EvidenceKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('document') || mimeType.includes('sheet') || mimeType.includes('presentation') || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

function readAudioDurationSeconds(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.ceil(audio.duration) : undefined;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      resolve(undefined);
    };
    audio.src = url;
  });
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

function processingStatusLabel(status: ProcessingStatus | undefined) {
  return {
    queued: '대기',
    processing: '분석 중',
    completed: '완료',
    failed: '실패',
    manual_review: '직접 확인',
  }[status ?? 'queued'];
}

function questionSaveStatusLabel(status: QuestionSaveStatus | undefined, connected: boolean) {
  if (!connected) return '합성 데모 · 현재 화면에 반영되었습니다.';
  if (status === 'dirty') return '입력을 마치면 답변을 저장합니다.';
  if (status === 'saving') return '답변을 저장하고 있어요.';
  if (status === 'saved') return '답변을 저장했습니다.';
  if (status === 'error') return '답변을 저장하지 못했습니다. 다시 시도해 주세요.';
  return '입력을 마친 뒤 자동 저장합니다.';
}

function nextActionCopy({
  analysisRequired,
  facts,
  memo,
  step,
}: {
  analysisRequired: boolean;
  facts: RemoteFact[];
  memo: string;
  step: number;
}) {
  if (!memo.trim()) return '사건 메모부터 시작해 주세요.';
  if (analysisRequired || facts.length === 0) return '기록 정리를 실행해 주세요.';
  if (step < stages.length - 1) return `${stages[step]} 단계에서 이어서 작성해 주세요.`;
  return '제출 전 내용을 확인해 주세요.';
}

function nextButtonLabel({
  analysisStepAdvanceBlocked,
  analyzing,
  pendingQuestionSave,
  step,
  submitBlockReason,
  submitting,
}: {
  analysisStepAdvanceBlocked: boolean;
  analyzing: boolean;
  pendingQuestionSave: string | null;
  step: number;
  submitBlockReason: string | null;
  submitting: boolean;
}) {
  if (submitting) return '안전하게 제출하고 있어요';
  if (step === 3 && analyzing) return '기록을 정리하고 있어요';
  if (step === 3 && analysisStepAdvanceBlocked) return '기록 정리를 완료해 주세요';
  if (step === 4 && pendingQuestionSave === 'dirty') return '답변 입력을 마쳐 주세요';
  if (step === 4 && pendingQuestionSave === 'saving') return '답변을 저장하고 있어요';
  if (step === 4 && pendingQuestionSave === 'error') return '답변 저장을 확인해 주세요';
  if (step === stages.length - 1 && submitBlockReason === 'evidence_processing') return '증거 처리를 기다리고 있어요';
  if (step === stages.length - 1 && submitBlockReason === 'analysis_required') return '기록 정리가 필요해요';
  if (step === stages.length - 1 && pendingQuestionSave) return '답변 저장을 확인해 주세요';
  if (step === stages.length - 1) return '확인 후 제출';
  return '다음';
}

function readLocalDraft() {
  try {
    const raw = sessionStorage.getItem(LOCAL_DRAFT_KEY);
    return raw ? JSON.parse(raw) as { memo: string; step: number } : null;
  } catch {
    sessionStorage.removeItem(LOCAL_DRAFT_KEY);
    return null;
  }
}

function saveLocalDraft(snapshot: { memo: string; step: number }) {
  sessionStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
}

function clearLocalDraft() {
  sessionStorage.removeItem(LOCAL_DRAFT_KEY);
}
