import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { createAudioPlayer } from 'expo-audio';
import {
  EvidenceAsset,
  RuleBasedAnalyzer,
  type AnalysisResult,
  type EvidenceKind,
  type ProcessingStatus,
} from '@ieumlog/domain';
import { SecureDraftStore } from '../src/draftStore';
import { MemoUpdateQueue } from '../src/memoUpdateQueue';
import {
  StudentApiClient,
  type HandoffCodeResult,
  type RemoteFact,
  type RemoteQuestion,
} from '../src/studentApi';
import {
  mergeQuestionAnswerDrafts,
  nextQuestionSaveVersion,
  questionSaveBlockReason,
  retainQuestionValues,
  shouldApplyQuestionSaveResult,
  shouldRequireAnalysisAfterRestore,
  shouldRestoreDeviceDraft,
  shouldShowLockedStudentCase,
  shouldBlockAnalysisStepAdvance,
  studentSubmitBlockReason,
  type QuestionSaveStatus,
} from '../src/studentFlow';

const draftStore = new SecureDraftStore();
const deviceDraftUpdates = new MemoUpdateQueue();
const analyzer = new RuleBasedAnalyzer();
const studentApi = new StudentApiClient();
const DEMO_CASE_ID = 'mobile-draft';

const stages = ['안내', '사건 메모', '증거', '분석', '질문', '확인'] as const;

type LocalEvidence = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: EvidenceKind;
  uri?: string;
  processingStatus?: ProcessingStatus;
  durationSeconds?: number;
};

export default function StudentWizard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState('WEE-24-0510');
  const [password, setPassword] = useState('demo1234');
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
  const [caseId, setCaseId] = useState(DEMO_CASE_ID);
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoffCode, setHandoffCode] = useState<HandoffCodeResult | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    setEvidence(remoteEvidence.map((asset) => ({
      id: asset.id,
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.sizeBytes,
      kind: asset.kind,
      processingStatus: asset.processingStatus,
    })));
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
    if (locked) {
      await refreshConnectedData(record.id);
      setLoggedIn(true);
      return;
    }
    const snapshot = await draftStore.read(record.id).catch(() => null);
    const restoreDeviceDraft = shouldRestoreDeviceDraft(record.memo, record.updatedAt, snapshot);
    const restoredMemo = restoreDeviceDraft ? snapshot?.memo ?? null : null;
    if (snapshot && restoreDeviceDraft) {
      setMemo(snapshot.memo);
      setStep(snapshot.step);
      setRestored(true);
    } else if (snapshot) {
      await deviceDraftUpdates.enqueue(() => draftStore.clear(record.id)).catch(() => undefined);
    }
    const { factCount } = await refreshConnectedData(record.id);
    setAnalysisRequired(shouldRequireAnalysisAfterRestore(record.memo, restoredMemo, factCount));
    setLoggedIn(true);
  }, [refreshConnectedData, resetQuestionAnswers]);

  useEffect(() => {
    if (studentApi.connected) {
      void studentApi.restoreSession().then((active) => {
        if (active) void openConnectedCase();
      }).catch(() => undefined);
      return;
    }
    draftStore.read(DEMO_CASE_ID).then((snapshot) => {
      if (snapshot) {
        setMemo(snapshot.memo);
        setStep(snapshot.step);
        setRestored(true);
      }
    }).catch(() => undefined);
  }, [openConnectedCase]);

  useEffect(() => {
    if (!loggedIn || submitted || submitting) return;
    const timeout = setTimeout(() => {
      if (submissionInFlight.current) return;
      void deviceDraftUpdates.enqueue(() => draftStore.write(caseId, { memo, step, updatedAt: new Date().toISOString() })).catch(() => undefined);
      if (studentApi.connected && caseId !== DEMO_CASE_ID) {
        void studentApi.updateMemo(caseId, memo).catch(() => undefined);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [caseId, loggedIn, memo, step, submitted, submitting]);

  useEffect(() => {
    if (!loggedIn || !studentApi.connected || caseId === DEMO_CASE_ID) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void studentApi.subscribeEvidence(caseId, () => {
      void refreshConnectedData(caseId).catch(() => undefined);
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [caseId, loggedIn, refreshConnectedData]);

  useEffect(() => {
    if (!loggedIn || !studentApi.connected || caseId === DEMO_CASE_ID) return;
    const interval = setInterval(() => {
      void refreshConnectedData(caseId).catch(() => undefined);
    }, 1500);
    return () => clearInterval(interval);
  }, [caseId, loggedIn, refreshConnectedData]);

  const progress = useMemo<`${number}%`>(
    () => `${Math.round(((step + 1) / stages.length) * 100)}%`,
    [step],
  );
  const submitBlockReason = useMemo(
    () => studentSubmitBlockReason(analysisRequired, facts.length, evidence.map((asset) => asset.processingStatus)),
    [analysisRequired, evidence, facts.length],
  );
  const analysisStepAdvanceBlocked = useMemo(
    () => shouldBlockAnalysisStepAdvance(analysisRequired, analyzing, facts.length),
    [analysisRequired, analyzing, facts.length],
  );

  const updateMemo = useCallback((value: string) => {
    setMemo(value);
    setAnalysisRequired(true);
  }, []);

  const updateQuestionAnswerDraft = useCallback((id: string, answer: string) => {
    questionSaveVersions.current[id] = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    setQuestionAnswerDrafts((current) => ({ ...current, [id]: answer }));
    setQuestionSaveStatuses((current) => ({ ...current, [id]: 'dirty' }));
  }, []);

  const beginQuestionSave = useCallback((id: string) => {
    const version = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    questionSaveVersions.current[id] = version;
    setQuestionSaveStatuses((current) => ({ ...current, [id]: 'saving' }));
    return version;
  }, []);

  const finishQuestionSave = useCallback((id: string, version: number, status: QuestionSaveStatus) => {
    if (!shouldApplyQuestionSaveResult(questionSaveVersions.current[id], version)) return;
    setQuestionSaveStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const discardQuestionAnswerDraft = useCallback((id: string) => {
    questionSaveVersions.current[id] = nextQuestionSaveVersion(questionSaveVersions.current[id]);
    const serverAnswer = questions.find((question) => question.id === id)?.answer ?? '';
    setQuestionAnswerDrafts((current) => ({ ...current, [id]: serverAnswer }));
    setQuestionSaveStatuses((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, [questions]);

  const pendingQuestionSave = useMemo(
    () => questionSaveBlockReason(questionSaveStatuses),
    [questionSaveStatuses],
  );

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <ScrollView contentContainerStyle={styles.loginWrap} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
            <View style={styles.logo}><Text style={styles.logoText}>이음</Text></View>
            <Text style={styles.eyebrow}>학교폭력 상담 전 기록 정리</Text>
            <Text style={styles.hero}>흩어진 경험을{'\n'}천천히 연결해요.</Text>
            <Text style={styles.muted}>개인 이메일 대신 기관에서 받은 익명 학생 ID를 사용합니다.</Text>
            <View style={styles.card}>
              <Text style={styles.label}>기관 발급 학생 ID</Text>
              <TextInput onChangeText={setLoginId} style={styles.input} value={loginId} />
              <Text style={styles.label}>비밀번호</Text>
              <TextInput onChangeText={setPassword} secureTextEntry style={styles.input} value={password} />
              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
              <PrimaryButton
                disabled={busy}
                label={busy ? '확인 중...' : '안전하게 시작하기'}
                onPress={() => void login(loginId, password, setBusy, setLoginError, setLoggedIn, openConnectedCase)}
              />
            </View>
            <Text style={styles.caption}>{studentApi.connected ? 'Supabase 연결 모드 · 기관 발급 계정을 확인합니다.' : '합성 데이터 데모 · 환경변수를 등록하면 Supabase 연결 모드로 전환됩니다.'}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.centered} keyboardShouldPersistTaps="handled">
          <View style={styles.successMark}><Text style={styles.successText}>✓</Text></View>
          <Text style={styles.heroSmall}>기록을 제출했어요.</Text>
          <Text style={[styles.muted, styles.centerText]}>
            {deleteRequested
              ? '삭제 요청이 접수되어 화면에서 즉시 숨겼어요. 7일 복구 기간 뒤 원본까지 제거됩니다.'
              : '상담자가 내용을 확인합니다. 다시 수정해야 할 때는 상담자가 기록을 재개방합니다.'}
          </Text>
          <HandoffCodeCard
            busy={handoffBusy}
            code={handoffCode}
            connected={studentApi.connected}
            disabled={deleteRequested}
            onCopy={(code) => void copyHandoffCode(code)}
            onCreate={() => void createHandoffCode(caseId, setHandoffBusy, setHandoffCode)}
          />
          {!deleteRequested && studentApi.connected && (
            <SecondaryButton
              disabled={busy}
              label={busy ? '확인 중...' : '상담자 재개방 확인'}
              onPress={() => void refreshLockedCase(caseId, setBusy, openConnectedCase)}
            />
          )}
          {!deleteRequested && (
            <SecondaryButton
              disabled={busy}
              label={busy ? '처리 중...' : '삭제 요청'}
              onPress={() => confirmScheduleDeletion(caseId, setBusy, setDeleteRequested)}
            />
          )}
          {!deleteRequested && studentApi.connected && (
            <SecondaryButton
              disabled={busy}
              label="새 기록 작성"
              onPress={() => void startNewCase(setBusy, openConnectedCase)}
            />
          )}
          <PrimaryButton label="처음 화면으로" onPress={() => void resetSession(setDeleteRequested, setLoggedIn, setSubmitted, setStep)} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.topBrand}>이음로그</Text>
          <Text style={styles.topStep}>{step + 1}/{stages.length}</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressBar, { width: progress }]} /></View>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {restored && <View style={styles.infoBox}><Text style={styles.infoText}>이전에 작성하던 텍스트 초안을 불러왔어요.</Text></View>}
          <Text style={styles.eyebrow}>{stages[step]}</Text>
          {step === 0 && <SafetyStep />}
          {step === 1 && <MemoStep memo={memo} onChange={updateMemo} />}
          {step === 2 && <EvidenceStep evidence={evidence} onPick={() => void pickEvidence(caseId, evidence, setEvidence, setUploadingEvidence)} uploading={uploadingEvidence} />}
          {step === 3 && <AnalysisStep analyzing={analyzing} analysis={analysis} evidence={evidence} onAnalyze={() => void runAnalysis(caseId, evidence, memo, setAnalyzing, setAnalysis, setFacts, resetQuestionAnswers, setAnalysisRequired, refreshConnectedData)} />}
          {step === 4 && <QuestionsStep analysis={analysis} answers={questionAnswerDrafts} connected={studentApi.connected} questions={questions} saveStatuses={questionSaveStatuses} onAnswer={(id, answer) => void saveAnswer(id, answer, setQuestionAnswerDrafts, beginQuestionSave, finishQuestionSave)} onAnswerChange={updateQuestionAnswerDraft} onDiscard={discardQuestionAnswerDraft} />}
          {step === 5 && <ConfirmStep evidence={evidence} facts={analysisRequired ? [] : facts} memo={memo} />}
        </ScrollView>
        <View style={styles.bottomBar}>
          {step > 0 && <SecondaryButton label="이전" onPress={() => setStep((current) => current - 1)} />}
          <PrimaryButton
            disabled={(step === 3 && analysisStepAdvanceBlocked) || (step === 4 && pendingQuestionSave !== null) || (step === stages.length - 1 && (submitBlockReason !== null || pendingQuestionSave !== null || submitting))}
            grow
            label={submitting ? '안전하게 제출하고 있어요' : step === 3 && analyzing ? '기록을 정리하고 있어요' : step === 3 && analysisStepAdvanceBlocked ? '기록 정리를 먼저 완료해 주세요' : step === 4 && pendingQuestionSave === 'dirty' ? '입력을 마쳐 저장해 주세요' : step === 4 && pendingQuestionSave === 'saving' ? '답변을 저장하고 있어요' : step === 4 && pendingQuestionSave === 'error' ? '답변 저장을 다시 확인해 주세요' : step === stages.length - 1 && submitBlockReason === 'evidence_processing' ? '증거 처리를 기다리고 있어요' : step === stages.length - 1 && submitBlockReason === 'analysis_required' ? '기록 정리가 필요해요' : step === stages.length - 1 && pendingQuestionSave ? '답변 저장을 확인해 주세요' : step === stages.length - 1 ? '확인 후 제출' : '다음'}
            onPress={() => {
              if (step === stages.length - 1) {
                void submitCase(caseId, memo, submissionInFlight, setSubmitting, setSubmitted);
                return;
              }
              setStep((current) => Math.min(current + 1, stages.length - 1));
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SafetyStep() {
  return (
    <View>
      <Text style={styles.title}>먼저, 안전을 확인할게요.</Text>
      <Text style={styles.body}>지금 당장 위험하거나 긴급한 도움이 필요하면 이 기록보다 주변의 신뢰할 수 있는 어른과 긴급 지원에 먼저 알려 주세요.</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>이음로그가 하는 일</Text>
        <Text style={styles.listText}>✓ 입력한 사실과 증거를 시간순으로 정리합니다.</Text>
        <Text style={styles.listText}>✓ 빠진 정보는 질문으로 다시 확인합니다.</Text>
        <Text style={styles.listText}>✓ AI가 잘잘못이나 법률 판단을 내리지 않습니다.</Text>
      </View>
    </View>
  );
}

function HandoffCodeCard({
  busy,
  code,
  connected,
  disabled,
  onCopy,
  onCreate,
}: {
  busy: boolean;
  code: HandoffCodeResult | null;
  connected: boolean;
  disabled: boolean;
  onCopy: (code: string) => void;
  onCreate: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>관리자 전달 코드</Text>
      <Text style={styles.listText}>
        상담자나 기관 관리자에게 이 코드를 전달하면 웹에서 사건을 확인하고 배정할 수 있습니다. 코드는 1회용이며 새로 만들면 이전 코드는 사용할 수 없습니다.
      </Text>
      {!connected ? (
        <Text style={styles.caption}>Supabase 연결 모드에서 제출된 사건만 인계 코드를 만들 수 있습니다.</Text>
      ) : code ? (
        <View style={styles.handoffCodeBox}>
          <Text style={styles.handoffCode}>{code.code}</Text>
          <Text style={styles.caption}>만료: {new Date(code.expiresAt).toLocaleString('ko-KR')}</Text>
        </View>
      ) : (
        <Text style={styles.caption}>아직 생성된 인계 코드가 없습니다.</Text>
      )}
      <View style={styles.handoffActions}>
        <SecondaryButton
          disabled={!connected || busy || disabled}
          label={busy ? '생성 중...' : code ? '새 코드 만들기' : '코드 만들기'}
          onPress={onCreate}
        />
        {code && (
          <SecondaryButton
            disabled={busy || disabled}
            label="코드 복사"
            onPress={() => onCopy(code.code)}
          />
        )}
      </View>
      {disabled && <Text style={styles.errorText}>삭제 요청된 사건은 새 인계 코드를 만들 수 없습니다.</Text>}
    </View>
  );
}

function MemoStep({ memo, onChange }: { memo: string; onChange: (value: string) => void }) {
  return (
    <View>
      <Text style={styles.title}>기억나는 일부터 적어 주세요.</Text>
      <Text style={styles.body}>정확한 순서가 아니어도 괜찮아요. 짧고 사실 중심으로 적어 주세요.</Text>
      <TextInput
        maxLength={1000}
        multiline
        onChangeText={onChange}
        placeholder="예: 5월 10일 복도에서 B 학생이 저에게 욕설을 했습니다."
        style={[styles.input, styles.memoInput]}
        textAlignVertical="top"
        value={memo}
      />
      <Text style={styles.caption}>{memo.length}/1000자 · 기기에 텍스트 초안만 임시 저장됩니다.</Text>
    </View>
  );
}

function EvidenceStep({ evidence, onPick, uploading }: { evidence: LocalEvidence[]; onPick: () => void; uploading: boolean }) {
  return (
    <View>
      <Text style={styles.title}>관련 자료를 연결해 주세요.</Text>
      <Text style={styles.body}>채팅 캡처, 사진, PDF, 녹취, 영상, 문서를 등록할 수 있습니다. 파일은 오프라인 초안에 복제하지 않습니다.</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: uploading }} disabled={uploading} onPress={onPick} style={[styles.uploadBox, uploading && styles.disabledButton]}>
        {uploading ? <ActivityIndicator color="#3976c3" /> : <Text style={styles.uploadPlus}>＋</Text>}
        <Text style={styles.cardTitle}>{uploading ? '파일을 안전하게 등록하고 있어요.' : '증거 파일 추가'}</Text>
        <Text style={styles.caption}>파일당 50MB · 사건당 50개</Text>
      </Pressable>
      {evidence.map((asset) => (
        <View key={asset.id} style={styles.fileRow}>
          <View><Text style={styles.fileName}>{asset.name}</Text><Text style={styles.caption}>{asset.kind.toUpperCase()} · {(asset.size / 1_000_000).toFixed(1)}MB{asset.durationSeconds ? ` · ${formatDuration(asset.durationSeconds)}` : ''}</Text></View>
          <Text style={[styles.fileBadge, fileBadgeStyle(asset.processingStatus)]}>{processingStatusLabel(asset.processingStatus)}</Text>
        </View>
      ))}
    </View>
  );
}

function AnalysisStep({
  analyzing,
  analysis,
  evidence,
  onAnalyze,
}: {
  analyzing: boolean;
  analysis: AnalysisResult | null;
  evidence: LocalEvidence[];
  onAnalyze: () => void;
}) {
  const pending = evidence.filter((asset) => ['queued', 'processing'].includes(asset.processingStatus ?? '')).length;
  return (
    <View>
      <Text style={styles.title}>입력한 기록을 정리할게요.</Text>
      <Text style={styles.body}>업로드는 즉시 접수되고, 완료된 결과부터 질문 카드에 반영됩니다.</Text>
      <View style={styles.card}>
        {analyzing ? <ActivityIndicator color="#073b78" size="large" /> : <Text style={styles.analysisIcon}>AI</Text>}
        <Text style={[styles.cardTitle, styles.centerText]}>{analyzing ? 'FactBlock을 구성하고 있어요.' : analysis?.summary ?? '분석을 시작할 준비가 됐어요.'}</Text>
        <Text style={[styles.caption, styles.centerText]}>실제 학생 자료는 외부 AI로 전송하지 않습니다.</Text>
        {pending ? <Text style={[styles.caption, styles.centerText]}>파일 처리 대기 {pending}개 · 완료되는 순서대로 반영합니다.</Text> : null}
      </View>
      <PrimaryButton disabled={analyzing} label={analyzing ? '기록을 정리하고 있어요' : analysis ? '다시 정리하기' : '기록 정리 시작'} onPress={onAnalyze} />
    </View>
  );
}

function QuestionsStep({
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
  const questions = remoteQuestions.length ? remoteQuestions.slice(0, 4) : (analysis?.questions.slice(0, 4) ?? []);
  return (
    <View>
      <Text style={styles.title}>몇 가지만 더 확인할게요.</Text>
      <Text style={styles.body}>답하기 어렵다면 넘어가도 괜찮아요. 상담자가 함께 확인할 수 있습니다.</Text>
      {questions.length ? questions.map((question, index) => {
        const answer = answers[question.id] ?? question.answer ?? '';
        const saveStatus = saveStatuses[question.id];
        return (
        <View key={question.id} style={styles.card}>
          <Text style={styles.questionCount}>질문 {index + 1}/{questions.length}</Text>
          <Text style={styles.cardTitle}>{question.prompt}</Text>
          <TextInput
            onChangeText={(answer) => onAnswerChange(question.id, answer)}
            onEndEditing={(event) => onAnswer(question.id, event.nativeEvent.text)}
            placeholder="기억나는 만큼 적어 주세요."
            returnKeyType="done"
            style={styles.input}
            submitBehavior="blurAndSubmit"
            value={answer}
          />
          <Text style={saveStatus === 'error' ? styles.errorText : styles.caption}>{questionSaveStatusLabel(saveStatus, connected)}</Text>
          {saveStatus === 'error' ? (
            <View style={styles.questionActionRow}>
              <Pressable accessibilityRole="button" onPress={() => onAnswer(question.id, answer)} style={styles.questionRetryButton}>
                <Text style={styles.questionRetryText}>답변 저장 다시 시도</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onDiscard(question.id)} style={styles.questionDiscardButton}>
                <Text style={styles.questionDiscardText}>변경 내용 버리기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        );
      }) : <View style={styles.card}><Text style={styles.body}>먼저 분석 단계에서 기록 정리를 시작해 주세요.</Text></View>}
    </View>
  );
}

function ConfirmStep({ evidence, facts, memo }: { evidence: LocalEvidence[]; facts: RemoteFact[]; memo: string }) {
  return (
    <View>
      <Text style={styles.title}>제출 전에 직접 확인해 주세요.</Text>
      <Text style={styles.body}>제출 뒤에는 상담자가 재개방하기 전까지 기록이 잠깁니다.</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>학생 통제권</Text>
        <Text style={styles.listText}>✓ 제출 전 언제든 수정할 수 있어요.</Text>
        <Text style={styles.listText}>✓ 삭제 요청 시 화면에서 즉시 숨겨져요.</Text>
        <Text style={styles.listText}>✓ 7일 복구 기간 뒤 원본까지 제거돼요.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>제출 내용</Text>
        <Text style={styles.listText}>사건 메모 {memo.length}자</Text>
        <Text style={styles.listText}>증거 파일 {evidence.length}개</Text>
        <Text style={styles.listText}>FactBlock 후보 {facts.length}개</Text>
      </View>
      {facts.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>시간순 사실 후보</Text>
          {facts.map((fact) => (
            <View key={fact.id} style={styles.factRow}>
              <Text style={styles.questionCount}>진술 {fact.sequence}</Text>
              <Text style={styles.listText}>{fact.action}</Text>
              <Text style={styles.caption}>{fact.location ?? '장소 확인 필요'} · {fact.occurredAt ? new Date(fact.occurredAt).toLocaleDateString('ko-KR') : '시기 확인 필요'}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

async function pickEvidence(
  caseId: string,
  current: LocalEvidence[],
  setEvidence: (assets: LocalEvidence[]) => void,
  setUploading: (value: boolean) => void,
) {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: false });
  if (result.canceled) return;

  const withinSizeLimit = result.assets.filter((asset) => (asset.size ?? 0) <= 50_000_000);
  const availableSlots = Math.max(0, 50 - current.length);
  const accepted = withinSizeLimit.slice(0, availableSlots);
  const incoming: LocalEvidence[] = await Promise.all(accepted
    .map(async (asset) => {
      const kind = evidenceKind(asset.mimeType ?? '', asset.name);
      return {
        id: `${asset.name}-${asset.size}-${Date.now()}`,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
        kind,
        uri: asset.uri,
        processingStatus: studentApi.connected ? 'queued' : 'completed',
        durationSeconds: kind === 'audio' ? await readAudioDurationSeconds(asset.uri) : undefined,
      };
    }));
  setEvidence([...current, ...incoming]);
  if (withinSizeLimit.length !== result.assets.length) Alert.alert('파일 크기 한도', '50MB를 넘는 파일은 등록하지 않았습니다.');
  if (accepted.length !== withinSizeLimit.length) Alert.alert('파일 개수 한도', '사건당 최대 50개까지만 등록할 수 있습니다.');
  if (!incoming.length) return;
  if (!studentApi.connected) return;

  const failedNames: string[] = [];
  setUploading(true);
  try {
    for (const asset of incoming) {
      try {
        await studentApi.uploadEvidence(caseId, {
          uri: asset.uri ?? '',
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
          kind: asset.kind,
          durationSeconds: asset.durationSeconds,
        });
      } catch {
        failedNames.push(asset.name);
      }
    }
  } finally {
    const uploaded = await studentApi.listEvidence(caseId).catch(() => null);
    if (uploaded) {
      setEvidence(uploaded.map((asset) => ({
        id: asset.id,
        name: asset.fileName,
        mimeType: asset.mimeType,
        size: asset.sizeBytes,
        kind: asset.kind,
        processingStatus: asset.processingStatus,
      })));
    }
    setUploading(false);
  }
  if (failedNames.length) Alert.alert('업로드 확인', `${failedNames.length}개 파일을 등록하지 못했습니다. 나머지 파일은 계속 등록했습니다.`);
}

async function runAnalysis(
  caseId: string,
  localEvidence: LocalEvidence[],
  memo: string,
  setAnalyzing: (value: boolean) => void,
  setAnalysis: (value: AnalysisResult) => void,
  setFacts: (facts: RemoteFact[]) => void,
  resetQuestionAnswers: () => void,
  setAnalysisRequired: (value: boolean) => void,
  refreshConnectedData: (activeCaseId: string) => Promise<unknown>,
) {
  setAnalyzing(true);
  resetQuestionAnswers();
  if (studentApi.connected) {
    try {
      await studentApi.analyzeCase(caseId, memo);
      await refreshConnectedData(caseId);
      setAnalysis({
        factBlocks: [],
        questions: [],
        summary: '입력한 기록을 FactBlock 후보와 확인 질문으로 정리했어요.',
        usedExternalAi: false,
      });
      setAnalysisRequired(false);
    } catch (error) {
      Alert.alert('기록 정리 확인', error instanceof Error ? error.message : '기록을 정리할 수 없습니다.');
    } finally {
      setAnalyzing(false);
    }
    return;
  }
  const evidence = localEvidence.map(
    (asset) =>
      new EvidenceAsset(
        asset.id,
        DEMO_CASE_ID,
        asset.name,
        asset.mimeType,
        asset.size,
        asset.kind,
        `${DEMO_CASE_ID}/${asset.name}`,
        true,
        new Date().toISOString(),
      ),
  );
  const result = await analyzer.analyze({ caseId: DEMO_CASE_ID, memo, evidence, synthetic: true });
  setTimeout(() => {
    setAnalysis(result);
    setFacts(result.factBlocks.map((fact) => ({
      id: fact.id,
      sequence: fact.sequence,
      occurredAt: fact.occurredAt,
      location: fact.location,
      action: fact.action,
      confirmed: fact.confirmed,
    })));
    setAnalysisRequired(false);
    setAnalyzing(false);
  }, 650);
}

async function login(
  loginId: string,
  password: string,
  setBusy: (value: boolean) => void,
  setLoginError: (value: string) => void,
  setLoggedIn: (value: boolean) => void,
  openConnectedCase: () => Promise<void>,
) {
  if (!loginId.trim() || !password) return;
  setBusy(true);
  setLoginError('');
  try {
    if (studentApi.connected) {
      await studentApi.login(loginId, password);
      await openConnectedCase();
    } else {
      setLoggedIn(true);
    }
  } catch (error) {
    setLoginError(error instanceof Error ? error.message : '로그인할 수 없습니다.');
  } finally {
    setBusy(false);
  }
}

async function saveAnswer(
  id: string,
  answer: string,
  setQuestionAnswerDrafts: (update: (current: Record<string, string>) => Record<string, string>) => void,
  beginQuestionSave: (id: string) => number,
  finishQuestionSave: (id: string, version: number, status: QuestionSaveStatus) => void,
) {
  const normalized = answer.trim();
  setQuestionAnswerDrafts((current) => ({ ...current, [id]: normalized }));
  const version = beginQuestionSave(id);
  if (!studentApi.connected) {
    finishQuestionSave(id, version, 'saved');
    return;
  }
  try {
    await studentApi.answerQuestion(id, normalized);
    finishQuestionSave(id, version, 'saved');
  } catch (error) {
    finishQuestionSave(id, version, 'error');
    Alert.alert('답변 저장 확인', `${error instanceof Error ? error.message : '답변을 저장할 수 없습니다.'}\n카드의 다시 시도 버튼으로 저장을 재시도할 수 있습니다.`);
  }
}

async function createHandoffCode(
  caseId: string,
  setBusy: (value: boolean) => void,
  setCode: (value: HandoffCodeResult) => void,
) {
  setBusy(true);
  try {
    const result = await studentApi.createHandoffCode(caseId);
    setCode(result);
  } catch (error) {
    Alert.alert('인계 코드 확인', error instanceof Error ? error.message : '인계 코드를 만들 수 없습니다.');
  } finally {
    setBusy(false);
  }
}

async function copyHandoffCode(code: string) {
  await Clipboard.setStringAsync(code);
  Alert.alert('복사 완료', '관리자에게 전달할 인계 코드가 복사되었습니다.');
}

async function refreshLockedCase(
  caseId: string,
  setBusy: (value: boolean) => void,
  openConnectedCase: () => Promise<void>,
) {
  setBusy(true);
  try {
    const record = await studentApi.getCase(caseId);
    if (!record || shouldShowLockedStudentCase(record.status)) {
      Alert.alert('재개방 확인', '아직 상담자가 기록을 재개방하지 않았습니다.');
      return;
    }
    await openConnectedCase();
  } catch (error) {
    Alert.alert('재개방 확인', error instanceof Error ? error.message : '재개방 상태를 확인할 수 없습니다.');
  } finally {
    setBusy(false);
  }
}

async function startNewCase(
  setBusy: (value: boolean) => void,
  openConnectedCase: () => Promise<void>,
) {
  setBusy(true);
  try {
    await studentApi.createDraftCase();
    await openConnectedCase();
  } catch (error) {
    Alert.alert('새 기록 확인', error instanceof Error ? error.message : '새 기록을 만들 수 없습니다.');
  } finally {
    setBusy(false);
  }
}

async function submitCase(
  caseId: string,
  memo: string,
  submissionInFlight: { current: boolean },
  setSubmitting: (value: boolean) => void,
  setSubmitted: (value: boolean) => void,
) {
  if (submissionInFlight.current) return;
  submissionInFlight.current = true;
  setSubmitting(true);
  try {
    if (studentApi.connected) await studentApi.submit(caseId, memo);
    await deviceDraftUpdates.enqueue(() => draftStore.clear(caseId)).catch(() => undefined);
    setSubmitted(true);
  } catch (error) {
    Alert.alert('제출 확인', error instanceof Error ? error.message : '기록을 제출할 수 없습니다.');
  } finally {
    submissionInFlight.current = false;
    setSubmitting(false);
  }
}

function confirmScheduleDeletion(
  caseId: string,
  setBusy: (value: boolean) => void,
  setDeleteRequested: (value: boolean) => void,
) {
  Alert.alert(
    '삭제를 요청할까요?',
    '요청 즉시 기록이 화면에서 숨겨지고, 7일 복구 기간 뒤 원본 파일과 구조화 데이터가 제거됩니다.',
    [
      { text: '취소', style: 'cancel' },
      { text: '삭제 요청', style: 'destructive', onPress: () => void scheduleDeletion(caseId, setBusy, setDeleteRequested) },
    ],
  );
}

async function scheduleDeletion(
  caseId: string,
  setBusy: (value: boolean) => void,
  setDeleteRequested: (value: boolean) => void,
) {
  setBusy(true);
  try {
    if (studentApi.connected) await studentApi.scheduleDeletion(caseId);
    setDeleteRequested(true);
  } catch (error) {
    Alert.alert('삭제 요청 확인', error instanceof Error ? error.message : '삭제를 요청할 수 없습니다.');
  } finally {
    setBusy(false);
  }
}

async function resetSession(
  setDeleteRequested: (value: boolean) => void,
  setLoggedIn: (value: boolean) => void,
  setSubmitted: (value: boolean) => void,
  setStep: (value: number) => void,
) {
  await studentApi.logout();
  setDeleteRequested(false);
  setLoggedIn(false);
  setSubmitted(false);
  setStep(0);
}

function evidenceKind(mimeType: string, name: string): EvidenceKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('document') || mimeType.includes('sheet') || mimeType.includes('presentation') || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

async function readAudioDurationSeconds(uri: string) {
  const player = createAudioPlayer(uri);
  try {
    const deadline = Date.now() + 3_000;
    while (!player.isLoaded && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return Number.isFinite(player.duration) && player.duration > 0 ? Math.ceil(player.duration) : undefined;
  } catch {
    return undefined;
  } finally {
    player.release();
  }
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

function fileBadgeStyle(status: ProcessingStatus | undefined) {
  if (status === 'failed') return styles.fileBadgeFailed;
  if (status === 'manual_review') return styles.fileBadgeManual;
  if (status === 'queued' || status === 'processing') return styles.fileBadgePending;
  return styles.fileBadgeCompleted;
}

function questionSaveStatusLabel(status: QuestionSaveStatus | undefined, connected: boolean) {
  if (!connected) return '합성 데이터 데모 · 입력 내용은 현재 화면에 반영됩니다.';
  if (status === 'dirty') return '입력을 마치면 답변을 저장합니다.';
  if (status === 'saving') return '답변을 저장하고 있어요.';
  if (status === 'saved') return '답변을 저장했어요.';
  if (status === 'error') return '답변을 저장하지 못했습니다. 입력 내용은 이 화면에 남아 있어요.';
  return '입력을 마친 뒤 자동으로 저장합니다.';
}

function PrimaryButton({ disabled = false, grow = false, label, onPress }: { disabled?: boolean; grow?: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.primaryButton, grow && styles.growButton, disabled && styles.disabledButton]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}

function SecondaryButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.secondaryButton, disabled && styles.disabledButton]}><Text style={styles.secondaryText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f9fc' },
  screen: { flex: 1 },
  loginWrap: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  logo: { width: 62, height: 62, marginBottom: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#073b78' },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  eyebrow: { marginBottom: 7, color: '#3976c3', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  hero: { color: '#073b78', fontSize: 43, fontWeight: '900', letterSpacing: -3.2, lineHeight: 47 },
  heroSmall: { color: '#073b78', fontSize: 30, fontWeight: '900', letterSpacing: -2 },
  title: { marginBottom: 8, color: '#073b78', fontSize: 29, fontWeight: '900', letterSpacing: -1.8, lineHeight: 35 },
  body: { marginBottom: 16, color: '#53657b', fontSize: 15, lineHeight: 23 },
  muted: { marginVertical: 16, color: '#718097', fontSize: 14, lineHeight: 21 },
  centerText: { textAlign: 'center' },
  caption: { color: '#8190a4', fontSize: 12, lineHeight: 17 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  topBrand: { color: '#073b78', fontSize: 19, fontWeight: '900' },
  topStep: { color: '#3976c3', fontSize: 13, fontWeight: '900' },
  progressTrack: { height: 3, backgroundColor: '#dfe7f1' },
  progressBar: { height: 3, backgroundColor: '#3976c3' },
  content: { padding: 18, paddingBottom: 32 },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  successMark: { width: 74, height: 74, marginBottom: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 37, backgroundColor: '#dff5eb' },
  successText: { color: '#16845d', fontSize: 36, fontWeight: '900' },
  card: { gap: 9, marginTop: 14, borderWidth: 1, borderColor: '#dbe3ed', borderRadius: 16, backgroundColor: '#fff', padding: 16 },
  cardTitle: { color: '#173b69', fontSize: 16, fontWeight: '900', lineHeight: 23 },
  label: { marginTop: 10, color: '#30445f', fontSize: 13, fontWeight: '800' },
  listText: { color: '#53657b', fontSize: 14, lineHeight: 22 },
  input: { minHeight: 45, borderWidth: 1, borderColor: '#d6e0eb', borderRadius: 11, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, color: '#263950', fontSize: 15 },
  memoInput: { minHeight: 230, marginTop: 8 },
  primaryButton: { minHeight: 51, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#073b78', paddingHorizontal: 16 },
  growButton: { flex: 1 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryButton: { minHeight: 51, minWidth: 90, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccd8e8', borderRadius: 13, backgroundColor: '#fff', paddingHorizontal: 16 },
  secondaryText: { color: '#073b78', fontSize: 15, fontWeight: '900' },
  bottomBar: { flexDirection: 'row', gap: 9, borderTopWidth: 1, borderColor: '#e0e6ef', backgroundColor: '#fff', padding: 14 },
  uploadBox: { alignItems: 'center', justifyContent: 'center', marginVertical: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#a9bfdc', borderRadius: 15, backgroundColor: '#f8fbff', padding: 26 },
  uploadPlus: { marginBottom: 2, color: '#3976c3', fontSize: 35, fontWeight: '500' },
  fileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, borderWidth: 1, borderColor: '#e0e6ee', borderRadius: 12, backgroundColor: '#fff', padding: 12 },
  fileName: { maxWidth: 250, color: '#263950', fontSize: 14, fontWeight: '800' },
  fileBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '900' },
  fileBadgeCompleted: { backgroundColor: '#e1f5eb', color: '#187d59' },
  fileBadgePending: { backgroundColor: '#fff2cd', color: '#a56812' },
  fileBadgeManual: { backgroundColor: '#edf1f6', color: '#66778e' },
  fileBadgeFailed: { backgroundColor: '#fae6e9', color: '#b23d4a' },
  infoBox: { marginBottom: 14, borderRadius: 11, backgroundColor: '#edf4ff', padding: 11 },
  infoText: { color: '#2e609d', fontSize: 12, fontWeight: '700' },
  analysisIcon: { alignSelf: 'center', color: '#3976c3', fontSize: 34, fontWeight: '900' },
  questionCount: { color: '#3976c3', fontSize: 12, fontWeight: '900' },
  questionRetryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#efb7bf', borderRadius: 10, backgroundColor: '#fff8f9', paddingHorizontal: 11, paddingVertical: 8 },
  questionRetryText: { color: '#a53342', fontSize: 12, fontWeight: '900' },
  questionActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  questionDiscardButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#d7e0eb', borderRadius: 10, backgroundColor: '#f8fafc', paddingHorizontal: 11, paddingVertical: 8 },
  questionDiscardText: { color: '#61738b', fontSize: 12, fontWeight: '900' },
  handoffCodeBox: { alignItems: 'center', borderWidth: 1, borderColor: '#b8c9df', borderRadius: 14, backgroundColor: '#f3f7fc', padding: 14 },
  handoffCode: { color: '#073b78', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  handoffActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorText: { color: '#b23d4a', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  disabledButton: { opacity: 0.62 },
  factRow: { gap: 3, borderTopWidth: 1, borderTopColor: '#e3e9f1', paddingTop: 9 },
});
