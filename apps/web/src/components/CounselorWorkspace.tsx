import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Link2,
  Network,
  NotebookPen,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import {
  buildRelationGraphLayout,
  focusRelationGraph,
  type CaseRecord,
  type EvidenceAsset,
  type FocusedGraphElement,
  type RelationGraphLayout,
  type RelationGraphNode,
} from '@ieumlog/domain';
import { useDemoApp } from '../state/DemoAppContext';
import { evidenceFactLabel } from '../evidenceMap';

type DetailTab = 'relations' | 'timeline' | 'evidence' | 'questions' | 'summary';

const tabs: { id: DetailTab; label: string }[] = [
  { id: 'relations', label: '관계도' },
  { id: 'timeline', label: '사건 타임라인' },
  { id: 'evidence', label: '증거맵' },
  { id: 'questions', label: '확인 필요' },
  { id: 'summary', label: '상담일지' },
];

export function CounselorWorkspace() {
  const { activeProfile, addNote, claimCase, completeCase, dataset, notes, redeemHandoffCode, reopenCase, startReview } = useDemoApp();
  const [tab, setTab] = useState<DetailTab>('relations');
  const [noteDraft, setNoteDraft] = useState('');
  const [query, setQuery] = useState('');
  const [handoffDraft, setHandoffDraft] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (record: CaseRecord) => (
    !normalizedQuery || `${caseCode(record.id)} ${record.anonymousLabel}`.toLowerCase().includes(normalizedQuery)
  );
  const assignedCaseIds = new Set(
    dataset.assignments
      .filter((assignment) => assignment.counselorId === activeProfile?.id)
      .map((assignment) => assignment.caseId),
  );
  const assignedCases = dataset.cases.filter((record) => assignedCaseIds.has(record.id) && matchesQuery(record));
  const waitingCases = dataset.cases.filter((record) => (
    record.status === 'submitted'
    && !dataset.assignments.some((assignment) => assignment.caseId === record.id)
    && matchesQuery(record)
  ));
  const caseRecord = dataset.cases.find((record) => record.id === selectedCaseId) ?? assignedCases[0] ?? waitingCases[0];
  if (!caseRecord) return <EmptyCounselorWorkspace counselorName={activeProfile?.displayName ?? '상담자'} />;
  const activeCaseId = caseRecord.id;
  const caseNotes = notes.filter((note) => note.caseId === activeCaseId);
  const activeInstitution = dataset.institutions.find((institution) => institution.id === activeProfile?.institutionId);
  const assignedToActiveCounselor = dataset.assignments.some((assignment) => (
    assignment.caseId === caseRecord.id && assignment.counselorId === activeProfile?.id
  ));

  function submitNote() {
    addNote(activeCaseId, noteDraft);
    setNoteDraft('');
  }

  async function submitHandoffCode() {
    if (!handoffDraft.trim()) return;
    setHandoffBusy(true);
    try {
      const result = await redeemHandoffCode(handoffDraft);
      setSelectedCaseId(result.caseId);
      setHandoffDraft('');
      window.alert('인계 코드로 사건을 가져왔습니다.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '인계 코드를 확인할 수 없습니다.');
    } finally {
      setHandoffBusy(false);
    }
  }

  return (
    <div className="workspace counselor-workspace">
      <aside className="case-sidebar">
        <div>
          <p className="eyebrow">Counselor workspace</p>
          <h1>상담자 보기</h1>
        </div>
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">사건 검색</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="사건 검색" value={query} />
        </label>
        <form className="handoff-code-form" onSubmit={(event) => { event.preventDefault(); void submitHandoffCode(); }}>
          <label>
            <span>인계 코드</span>
            <input onChange={(event) => setHandoffDraft(event.target.value)} placeholder="ABCDE-FGHIJ" value={handoffDraft} />
          </label>
          <button className="button primary" disabled={handoffBusy || !handoffDraft.trim()} type="submit">
            {handoffBusy ? '확인 중' : '코드로 가져오기'}
          </button>
        </form>
        <section>
          <div className="section-heading">
            <strong>내 사건</strong>
            <span>{assignedCases.length}</span>
          </div>
          {assignedCases.map((record) => (
            <button className={`case-list-item ${record.id === caseRecord.id ? 'active' : ''}`} key={record.id} onClick={() => setSelectedCaseId(record.id)} type="button">
              <span className="case-code">{caseCode(record.id)}</span>
              <strong>{record.anonymousLabel}</strong>
              <small>{statusLabel(record.status)} · 증거 {dataset.evidence.filter((asset) => asset.caseId === record.id).length}개</small>
            </button>
          ))}
        </section>
        <section>
          <div className="section-heading">
            <strong>대기 사건</strong>
            <span>{waitingCases.length}</span>
          </div>
          {waitingCases.length ? waitingCases.map((record) => (
            <div className="waiting-case" key={record.id}>
              <button className={`case-list-item ${record.id === caseRecord.id ? 'active' : ''}`} onClick={() => setSelectedCaseId(record.id)} type="button">
                <span className="case-code">{caseCode(record.id)}</span>
                <strong>{record.anonymousLabel}</strong>
                <small>제출됨 · 상담자 배정 대기</small>
              </button>
              <button className="button secondary claim-button" onClick={() => claimCase(record.id)} type="button">가져오기</button>
            </div>
          )) : <p className="quiet-copy">현재 배정 대기 사건이 없습니다.</p>}
        </section>
        <div className="sidebar-footer">
          <strong>{activeProfile?.displayName}</strong>
          <small>{activeInstitution?.name ?? '소속 기관 확인 필요'}</small>
        </div>
      </aside>

      <section className="case-main">
        <header className="case-header">
          <div>
            <p className="eyebrow">{caseCode(caseRecord.id)} · 피해 학생 중심 보기</p>
            <h2>{caseRecord.anonymousLabel} 상담 전 기록</h2>
            <p>{caseRecord.synthetic ? '학생 확인을 거친 합성 자료입니다.' : '학생이 제출한 상담 전 기록입니다.'} 법률 판단이 아닌 상담 전 기록 정리 화면입니다.</p>
          </div>
          <div className="header-actions">
            <button className="button secondary" onClick={() => window.print()} type="button">
              <Printer size={16} aria-hidden="true" /> PDF 출력
            </button>
            {assignedToActiveCounselor && caseRecord.status === 'assigned' && (
              <button className="button primary" onClick={() => startReview(caseRecord.id)} type="button">
                <FileText size={16} aria-hidden="true" /> 상담 검토 시작
              </button>
            )}
            {assignedToActiveCounselor && ['submitted', 'assigned', 'in_review', 'completed'].includes(caseRecord.status) && (
              <button className="button secondary" onClick={() => reopenCase(caseRecord.id)} type="button">
                <RotateCcw size={16} aria-hidden="true" /> 학생 수정 재개방
              </button>
            )}
            {assignedToActiveCounselor && caseRecord.status === 'in_review' && (
              <button className="button primary" onClick={() => completeCase(caseRecord.id)} type="button">
                <CheckCircle2 size={16} aria-hidden="true" /> 상담 검토 완료
              </button>
            )}
          </div>
        </header>

        <div className="screen-case-detail">
          <nav className="tab-list" aria-label="상담자 상세 화면">
            {tabs.map((item) => (
              <button className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)} type="button">
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'relations' && <AdvancedRelationsPanel caseId={caseRecord.id} />}
          {tab === 'timeline' && <TimelinePanel caseId={caseRecord.id} />}
          {tab === 'evidence' && <EvidencePanel caseId={caseRecord.id} />}
          {tab === 'questions' && <QuestionsPanel caseId={caseRecord.id} />}
          {tab === 'summary' && (
            <NotesPanel
              noteDraft={noteDraft}
              notes={caseNotes}
              onChange={setNoteDraft}
              onSubmit={submitNote}
            />
          )}
        </div>
        <PrintCaseSummary caseRecord={caseRecord} />
      </section>
    </div>
  );
}

function PrintCaseSummary({ caseRecord }: { caseRecord: CaseRecord }) {
  const { dataset } = useDemoApp();
  const facts = dataset.factBlocks.filter((block) => block.caseId === caseRecord.id);
  const evidence = dataset.evidence.filter((asset) => asset.caseId === caseRecord.id);
  const questions = dataset.questions.filter((question) => question.caseId === caseRecord.id);
  const people = dataset.people.filter((person) => person.caseId === caseRecord.id);
  const relations = dataset.relations.filter((relation) => relation.caseId === caseRecord.id);
  const personById = new Map(people.map((person) => [person.id, person]));

  return (
    <article className="print-case-summary">
      <header>
        <FileText size={28} aria-hidden="true" />
        <div>
          <p className="eyebrow">Ieumlog pre-counseling summary</p>
          <h1>상담 전 증거 정리 요약</h1>
          <p>법률 판단이 아닌 상담 전 기록 정리 자료입니다.</p>
        </div>
      </header>
      <dl className="print-case-meta">
        <div><dt>익명 식별자</dt><dd>{caseRecord.anonymousLabel}</dd></div>
        <div><dt>사건 코드</dt><dd>{caseCode(caseRecord.id)}</dd></div>
        <div><dt>기록 상태</dt><dd>{statusLabel(caseRecord.status)}</dd></div>
      </dl>
      <PrintSection title="FactBlock">
        <ol className="print-fact-list">
          {facts.map((fact) => (
            <li key={fact.id}>
              <strong>{fact.action}</strong>
              <span>{formatDate(fact.occurredAt)} · {fact.location ?? '장소 확인 필요'}</span>
            </li>
          ))}
        </ol>
      </PrintSection>
      <PrintSection title="관계도">
        <ul className="print-relation-list">
          {relations.map((relation) => (
            <li key={relation.id}>
              <strong>{personById.get(relation.fromPersonId)?.label ?? relation.fromPersonId} → {personById.get(relation.toPersonId)?.label ?? relation.toPersonId}</strong>
              <span>{relation.label}{relation.indirect ? ' · 간접 관계' : ''}</span>
            </li>
          ))}
        </ul>
      </PrintSection>
      <PrintSection title="증거 목록">
        <ul className="print-evidence-list">
          {evidence.map((asset) => (
            <li key={asset.id}>
              <strong>{asset.fileName}</strong>
              <span>{asset.kind.toUpperCase()} · {formatBytes(asset.sizeBytes)} · {asset.processingStatus}</span>
            </li>
          ))}
        </ul>
      </PrintSection>
      <PrintSection title="확인 필요 항목">
        <ul className="print-question-list">
          {questions.map((question) => (
            <li key={question.id}>
              <strong>{question.prompt}</strong>
              <span>{question.resolved ? question.answer : '학생 답변 대기 중'}</span>
            </li>
          ))}
        </ul>
      </PrintSection>
    </article>
  );
}

function PrintSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="print-summary-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function RelationsPanel({ caseId }: { caseId: string }) {
  const { dataset } = useDemoApp();
  const people = dataset.people.filter((person) => person.caseId === caseId);
  const relations = dataset.relations.filter((relation) => relation.caseId === caseId);
  const personById = new Map(people.map((person) => [person.id, person]));
  return (
    <div className="content-grid relations-layout">
      <article className="panel relationship-panel">
        <PanelTitle icon={Network} title="관계도" subtitle="피해 학생 중심" />
        <div className="relation-map">
          {people.map((person, index) => (
            <div className={`person-node ${person.tone} node-${index + 1}`} key={person.id}>
              <strong>{person.label}</strong>
              <span>{person.relation}</span>
            </div>
          ))}
          {relations.slice(0, 4).map((relation, index) => (
            <span
              className={`relation-line line-${index + 1} ${relation.indirect ? 'dashed' : ''}`}
              key={relation.id}
              title={`${personById.get(relation.fromPersonId)?.label ?? relation.fromPersonId} → ${personById.get(relation.toPersonId)?.label ?? relation.toPersonId}: ${relation.label}`}
            />
          ))}
        </div>
        <ul className="relation-legend">
          {relations.map((relation) => (
            <li key={relation.id}>
              <strong>{personById.get(relation.fromPersonId)?.label ?? relation.fromPersonId} → {personById.get(relation.toPersonId)?.label ?? relation.toPersonId}</strong>
              <span>{relation.label}{relation.indirect ? ' · 간접 관계' : ''}</span>
            </li>
          ))}
        </ul>
      </article>
      <TimelineCard caseId={caseId} compact />
      <EvidenceCard caseId={caseId} compact />
      <NotesCard caseId={caseId} />
    </div>
  );
}

function AdvancedRelationsPanel({ caseId }: { caseId: string }) {
  const { dataset, saveRelationLayout } = useDemoApp();
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [focused, setFocused] = useState<FocusedGraphElement | null>(null);
  const [saving, setSaving] = useState(false);
  const people = dataset.people.filter((person) => person.caseId === caseId);
  const relations = dataset.relations.filter((relation) => relation.caseId === caseId);
  const personById = new Map(people.map((person) => [person.id, person]));
  const savedPositions = people.flatMap((person) => {
    const draft = draftPositions[person.id];
    const x = draft?.x ?? person.positionX;
    const y = draft?.y ?? person.positionY;
    return typeof x === 'number' && typeof y === 'number'
      ? [{ id: person.id, x, y, locked: person.positionLocked }]
      : [];
  });
  const layout = useMemo(
    () => buildRelationGraphLayout(people, relations, savedPositions),
    [people, relations, savedPositions],
  );
  const dirty = Object.keys(draftPositions).length > 0;

  function moveDraggingNode(event: PointerEvent<SVGSVGElement>) {
    if (!draggingNodeId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setDraftPositions((current) => ({
      ...current,
      [draggingNodeId]: { x: clampGraphCoordinate(x), y: clampGraphCoordinate(y) },
    }));
  }

  async function saveLayout() {
    setSaving(true);
    try {
      await saveRelationLayout(caseId, layout.nodes.map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        locked: true,
      })));
      setDraftPositions({});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '관계도 배치를 저장할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-grid relations-layout">
      <article className="panel relationship-panel advanced-relationship-panel">
        <div className="relationship-title-row">
          <PanelTitle icon={Network} title="관계도" subtitle="화살표 방향과 연결 근거를 확인합니다" />
          <button className="button secondary compact-button" disabled={!dirty || saving} onClick={() => void saveLayout()} type="button">
            {saving ? '저장 중' : '배치 저장'}
          </button>
        </div>
        <div className="relation-map advanced-relation-map">
          <RelationGraphSvg
            draggingNodeId={draggingNodeId}
            layout={layout}
            onMove={moveDraggingNode}
            onSelect={setFocused}
            onStartDrag={setDraggingNodeId}
            onStopDrag={() => setDraggingNodeId(null)}
          />
        </div>
        <p className="relation-help">노드를 끌어 위치를 보정하고, 원 또는 화살표를 클릭하면 해당 관계만 확대해서 볼 수 있습니다.</p>
        <ul className="relation-legend">
          {relations.map((relation) => (
            <li key={relation.id}>
              <strong>{personById.get(relation.fromPersonId)?.label ?? relation.fromPersonId} → {personById.get(relation.toPersonId)?.label ?? relation.toPersonId}</strong>
              <span>{relation.label}{relation.indirect ? ' · 간접 관계' : ''}</span>
            </li>
          ))}
        </ul>
      </article>
      <TimelineCard caseId={caseId} compact />
      <EvidenceCard caseId={caseId} compact />
      <NotesCard caseId={caseId} />
      {focused && (
        <RelationFocusDialog
          caseId={caseId}
          layout={layout}
          onClose={() => setFocused(null)}
          target={focused}
        />
      )}
    </div>
  );
}

function RelationGraphSvg({
  draggingNodeId,
  layout,
  onMove,
  onSelect,
  onStartDrag,
  onStopDrag,
}: {
  draggingNodeId?: string | null;
  layout: RelationGraphLayout;
  onMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onSelect?: (target: FocusedGraphElement) => void;
  onStartDrag?: (id: string) => void;
  onStopDrag?: () => void;
}) {
  return (
    <svg
      aria-label="정밀 관계도"
      className="relation-svg"
      onPointerLeave={onStopDrag}
      onPointerMove={onMove}
      onPointerUp={onStopDrag}
      role="img"
      viewBox="0 0 100 100"
    >
      <defs>
        <marker id="relation-arrow" markerHeight="5" markerWidth="5" orient="auto" refX="4.5" refY="2.5">
          <path d="M0,0 L5,2.5 L0,5 Z" />
        </marker>
      </defs>
      {layout.edges.map((edge) => (
        <g className="relation-edge-group" key={edge.id}>
          <line
            className={`relation-svg-edge ${edge.indirect ? 'dashed' : ''}`}
            markerEnd="url(#relation-arrow)"
            onClick={() => onSelect?.({ kind: 'edge', id: edge.id })}
            x1={edge.from.x}
            x2={edge.to.x}
            y1={edge.from.y}
            y2={edge.to.y}
          />
          <text className="relation-edge-label" x={edge.mid.x} y={edge.mid.y - 1.8}>{edge.label}</text>
        </g>
      ))}
      {layout.nodes.map((node) => (
        <RelationGraphNodeView
          dragging={draggingNodeId === node.id}
          key={node.id}
          node={node}
          onSelect={onSelect}
          onStartDrag={onStartDrag}
        />
      ))}
    </svg>
  );
}

function RelationGraphNodeView({
  dragging,
  node,
  onSelect,
  onStartDrag,
}: {
  dragging: boolean;
  node: RelationGraphNode;
  onSelect?: (target: FocusedGraphElement) => void;
  onStartDrag?: (id: string) => void;
}) {
  const lines = node.label.split('\n');
  return (
    <g
      className={`relation-svg-node ${node.tone} ${dragging ? 'dragging' : ''}`}
      onClick={() => onSelect?.({ kind: 'node', id: node.id })}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onStartDrag?.(node.id);
      }}
      role="button"
      tabIndex={0}
      transform={`translate(${node.x} ${node.y})`}
    >
      <circle r="8.5" />
      {lines.map((line, index) => (
        <text dy={index === 0 ? -1.2 : 3.1} key={`${node.id}-${line}`} textAnchor="middle">{line}</text>
      ))}
      <text className="relation-node-caption" dy="7.4" textAnchor="middle">{node.relation}</text>
    </g>
  );
}

function RelationFocusDialog({
  caseId,
  layout,
  onClose,
  target,
}: {
  caseId: string;
  layout: RelationGraphLayout;
  onClose: () => void;
  target: FocusedGraphElement;
}) {
  const { dataset } = useDemoApp();
  const focusedLayout = focusRelationGraph(layout, target);
  const people = new Map(layout.nodes.map((node) => [node.id, node]));
  const selectedNode = target.kind === 'node' ? people.get(target.id) : null;
  const selectedEdge = target.kind === 'edge' ? layout.edges.find((edge) => edge.id === target.id) : null;
  const labels = focusedLayout.nodes.flatMap((node) => node.label.split('\n').map((line) => line.replace(/[()]/g, '').trim()).filter(Boolean));
  const relatedFacts = dataset.factBlocks.filter((fact) => (
    fact.caseId === caseId
    && labels.some((label) => `${fact.actor ?? ''} ${fact.target ?? ''} ${fact.action}`.includes(label.slice(0, 4)))
  ));
  return (
    <div className="preview-backdrop" role="presentation">
      <section aria-label="관계도 포커스" aria-modal="true" className="preview-dialog relation-focus-dialog" role="dialog">
        <header>
          <div>
            <strong>{selectedNode?.label ?? selectedEdge?.label ?? '관계도 포커스'}</strong>
            <small>{selectedEdge ? `${people.get(selectedEdge.fromPersonId)?.label ?? selectedEdge.fromPersonId} → ${people.get(selectedEdge.toPersonId)?.label ?? selectedEdge.toPersonId}` : selectedNode?.relation}</small>
          </div>
          <button aria-label="관계도 포커스 닫기" className="icon-action" onClick={onClose} type="button">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="relation-focus-body">
          <div className="relation-focus-map">
            <RelationGraphSvg layout={focusedLayout} />
          </div>
          <div className="casefile-panel">
            <p className="eyebrow">Focused casefile</p>
            <h3>선택 요소 주변 관계</h3>
            <ul>
              {focusedLayout.edges.map((edge) => (
                <li key={edge.id}>
                  <strong>{people.get(edge.fromPersonId)?.label ?? edge.fromPersonId} → {people.get(edge.toPersonId)?.label ?? edge.toPersonId}</strong>
                  <span>{edge.label}{edge.indirect ? ' · 간접' : ''}</span>
                </li>
              ))}
            </ul>
            <h3>관련 후보 FactBlock</h3>
            {relatedFacts.length ? relatedFacts.slice(0, 4).map((fact) => (
              <div className="focus-fact" key={fact.id}>
                <strong>진술 {fact.sequence}</strong>
                <span>{fact.action}</span>
                <small>{formatDate(fact.occurredAt)} · {fact.location ?? '장소 확인 필요'}</small>
              </div>
            )) : <p className="quiet-copy">직접 연결된 FactBlock 후보가 아직 없습니다.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function clampGraphCoordinate(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(8, Math.min(92, value));
}

function TimelinePanel({ caseId }: { caseId: string }) {
  return (
    <article className="panel wide-panel">
      <PanelTitle icon={Clock3} title="사건 타임라인" subtitle="학생 확인 FactBlock" />
      <TimelineList caseId={caseId} />
    </article>
  );
}

function TimelineCard({ caseId, compact }: { caseId: string; compact?: boolean }) {
  return (
    <article className="panel timeline-panel">
      <PanelTitle icon={Clock3} title="사건 타임라인" subtitle="시간순 정리" />
      <TimelineList caseId={caseId} compact={compact} />
    </article>
  );
}

function TimelineList({ caseId, compact }: { caseId: string; compact?: boolean }) {
  const { dataset } = useDemoApp();
  const matching = dataset.factBlocks.filter((block) => block.caseId === caseId);
  const blocks = compact ? matching.slice(0, 4) : matching;
  return (
    <ol className="timeline-list">
      {blocks.map((block) => (
        <li key={block.id}>
          <span>{block.sequence}</span>
          <div>
            <small>{formatDate(block.occurredAt)}</small>
            <strong>{block.action}</strong>
            <em>{block.location}</em>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EvidencePanel({ caseId }: { caseId: string }) {
  return (
    <article className="panel wide-panel">
      <PanelTitle icon={Link2} title="증거맵" subtitle="진술과 연결된 원본 자료" />
      <EvidenceList caseId={caseId} />
    </article>
  );
}

function EvidenceCard({ caseId, compact }: { caseId: string; compact?: boolean }) {
  return (
    <article className="panel evidence-panel">
      <PanelTitle icon={Link2} title="증거맵" subtitle="진술 ↔ 증거" />
      <EvidenceList caseId={caseId} compact={compact} />
    </article>
  );
}

function EvidenceList({ caseId, compact }: { caseId: string; compact?: boolean }) {
  const { dataset, downloadEvidence, getEvidencePreviewUrl } = useDemoApp();
  const [previewAsset, setPreviewAsset] = useState<EvidenceAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const matching = dataset.evidence.filter((asset) => asset.caseId === caseId);
  const evidence = compact ? matching.slice(0, 5) : matching;

  async function openPreview(asset: EvidenceAsset) {
    setPreviewAsset(asset);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      setPreviewUrl(await getEvidencePreviewUrl(asset.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '미리보기를 열 수 없습니다.');
      setPreviewAsset(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <>
      <div className="evidence-list">
        {evidence.map((asset) => (
          <div className="evidence-row" key={asset.id}>
            <span>{evidenceFactLabel(asset.id, dataset.factBlocks)}</span>
            <div>
              <strong>{asset.fileName}</strong>
              <small>{asset.kind.toUpperCase()} · {formatBytes(asset.sizeBytes)}</small>
            </div>
            <StatusBadge asset={asset} />
            <div className="evidence-actions">
              <button className="icon-action" onClick={() => void openPreview(asset)} title="증거 자료 미리보기" type="button">
                <Eye size={15} aria-hidden="true" />
              </button>
              <button className="icon-action" onClick={() => downloadEvidence(asset.id)} title="증거 자료 다운로드" type="button">
                <Download size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {previewAsset && (
        <EvidencePreviewDialog
          asset={previewAsset}
          loading={previewLoading}
          onClose={() => setPreviewAsset(null)}
          url={previewUrl}
        />
      )}
    </>
  );
}

function EvidencePreviewDialog({
  asset,
  loading,
  onClose,
  url,
}: {
  asset: EvidenceAsset;
  loading: boolean;
  onClose: () => void;
  url: string | null;
}) {
  return (
    <div className="preview-backdrop" role="presentation">
      <section aria-label={`${asset.fileName} 미리보기`} aria-modal="true" className="preview-dialog" role="dialog">
        <header>
          <div>
            <strong>{asset.fileName}</strong>
            <small>{asset.kind.toUpperCase()} · {formatBytes(asset.sizeBytes)}</small>
          </div>
          <button aria-label="미리보기 닫기" className="icon-action" onClick={onClose} type="button">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="preview-stage">
          {loading && <p>서명 URL을 준비하고 있습니다.</p>}
          {!loading && <EvidencePreviewBody asset={asset} url={url} />}
        </div>
      </section>
    </div>
  );
}

function EvidencePreviewBody({ asset, url }: { asset: EvidenceAsset; url: string | null }) {
  if (!url) return <p>합성 화면 미리보기입니다. 연결 모드에서는 비공개 Storage 원본을 서명 URL로 불러옵니다.</p>;
  if (asset.kind === 'image') return <img alt={`${asset.fileName} 증거 자료`} src={url} />;
  if (asset.kind === 'pdf') return <iframe src={url} title={`${asset.fileName} PDF 미리보기`} />;
  if (asset.kind === 'audio') return <audio controls src={url}><track kind="captions" /></audio>;
  if (asset.kind === 'video') return <video controls src={url}><track kind="captions" /></video>;
  return <p>이 파일 형식은 브라우저 안에서 직접 표시하지 않습니다. 다운로드 버튼으로 원본을 확인해 주세요.</p>;
}

function QuestionsPanel({ caseId }: { caseId: string }) {
  const { dataset } = useDemoApp();
  return (
    <article className="panel wide-panel">
      <PanelTitle icon={AlertCircle} title="확인 필요 항목" subtitle="AI가 판단하지 않고 질문으로 남깁니다" />
      <div className="question-list">
        {dataset.questions.filter((question) => question.caseId === caseId).map((question) => (
          <div className="question-row" key={question.id}>
            <AlertCircle size={18} aria-hidden="true" />
            <div>
              <strong>{question.prompt}</strong>
              <small>{question.resolved ? question.answer : '학생 답변 대기 중'}</small>
            </div>
            <span className={question.resolved ? 'resolved' : 'pending'}>
              {question.resolved ? '확인됨' : '대기'}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function NotesPanel({
  noteDraft,
  notes,
  onChange,
  onSubmit,
}: {
  noteDraft: string;
  notes: { id: string; body: string; createdAt: string }[];
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <article className="panel wide-panel">
      <PanelTitle icon={NotebookPen} title="상담자 메모" subtitle="학생에게 노출되지 않는 내부 기록" />
      <textarea className="note-input" onChange={(event) => onChange(event.target.value)} placeholder="추가 확인 사항을 기록하세요." value={noteDraft} />
      <button className="button primary compact-button" onClick={onSubmit} type="button">메모 저장</button>
      <div className="note-list">
        {notes.map((note) => (
          <div key={note.id}>
            <p>{note.body}</p>
            <small>{formatDate(note.createdAt)}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function NotesCard({ caseId }: { caseId: string }) {
  const { notes } = useDemoApp();
  const note = notes.find((item) => item.caseId === caseId);
  return (
    <article className="panel notes-panel">
      <PanelTitle icon={NotebookPen} title="상담자 메모" subtitle="초기 상담 확인 지점" />
      <ul>
        {note?.body.split('. ').map((line) => <li key={line}>{line}</li>)}
      </ul>
    </article>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Network;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="panel-title">
      <Icon size={20} aria-hidden="true" />
      <h3>{title}</h3>
      <span>{subtitle}</span>
    </header>
  );
}

function StatusBadge({ asset }: { asset: EvidenceAsset }) {
  const copy = {
    queued: '대기',
    processing: '분석 중',
    completed: '완료',
    failed: '실패',
    manual_review: '직접 확인',
  };
  return <span className={`status-badge ${asset.processingStatus}`}>{copy[asset.processingStatus]}</span>;
}

function formatDate(value: string | null) {
  if (!value) return '시기 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value: number) {
  return `${(value / 1_000_000).toFixed(1)}MB`;
}

function caseCode(id: string) {
  return `CASE-${id.slice(-8).toUpperCase()}`;
}

function statusLabel(status: string) {
  return {
    assigned: '배정됨',
    in_review: '검토 중',
    completed: '완료',
    reopened: '학생 수정 중',
    submitted: '제출됨',
  }[status] ?? status;
}

function EmptyCounselorWorkspace({ counselorName }: { counselorName: string }) {
  return (
    <section className="empty-workspace">
      <div className="panel">
        <p className="eyebrow">Counselor workspace</p>
        <h1>아직 확인할 사건이 없습니다.</h1>
        <p>{counselorName} 상담자에게 배정된 사건이나 가져올 수 있는 대기 사건이 생기면 이곳에 표시됩니다.</p>
      </div>
    </section>
  );
}
