import { FactBlock, MissingInfoQuestion, type QuestionField } from './models';
import type { AnalysisInput, AnalysisResult, Analyzer } from './ports';

const LOCATION_PATTERNS = ['복도', '교실', '계단', '운동장', '급식실', '단톡방', '채팅방', 'SNS'];
const ACTION_PATTERNS = ['욕설', '밀쳤', '촬영', '조롱', '무시', '제외', '유포', '소문', '협박', '때렸'];
const DATE_PATTERN = /(20\d{2}[.\-/년]\s?\d{1,2}(?:[.\-/월]\s?\d{1,2})?일?|\d{1,2}월\s?\d{1,2}일)/;

const QUESTION_COPY: Record<QuestionField, string> = {
  occurred_at: '이 일이 발생한 날짜나 대략적인 시기를 기억하시나요?',
  location: '사건이 발생한 장소는 어디인가요?',
  actor: '이 일에 관련된 다른 사람이 있나요?',
  target: '누구에게 일어난 일인지 확인해 주세요.',
  action: '어떤 일이 있었는지 짧게 적어 주세요.',
  evidence: '관련 캡처, 사진, 문서 또는 녹취가 있다면 업로드할 수 있나요?',
};

export class RuleBasedAnalyzer implements Analyzer {
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const sentences = input.memo
      .split(/[.!?\n]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    const blocks = (sentences.length ? sentences : ['학생이 입력한 사건 메모']).map((sentence, index) => {
      const location = LOCATION_PATTERNS.find((candidate) => sentence.includes(candidate)) ?? null;
      const action = ACTION_PATTERNS.find((candidate) => sentence.includes(candidate)) ?? sentence;
      const evidenceIds = input.evidence.filter((asset) => asset.canAnalyze).map((asset) => asset.id);
      return new FactBlock(
        `fact-${input.caseId}-${index + 1}`,
        input.caseId,
        index + 1,
        sentence.match(DATE_PATTERN)?.[0] ?? null,
        location,
        sentence.includes('B') ? '가해 학생 B(익명)' : null,
        '피해 학생(익명)',
        action,
        evidenceIds,
        false,
      );
    });

    const questions = blocks.flatMap((block) =>
      block.missingFields.map(
        (field, index) =>
          new MissingInfoQuestion(
            `question-${block.id}-${index + 1}`,
            input.caseId,
            block.id,
            field,
            QUESTION_COPY[field],
          ),
      ),
    );

    return {
      factBlocks: blocks,
      questions,
      summary: `${blocks.length}개의 사건 기록과 ${questions.length}개의 확인 질문을 정리했습니다.`,
      usedExternalAi: false,
    };
  }
}
export class CompositeAnalyzer implements Analyzer {
  constructor(
    private readonly rules: Analyzer,
    private readonly external?: Analyzer,
    private readonly externalAiMode: 'disabled' | 'synthetic_only' = 'synthetic_only',
  ) {}

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const baseline = await this.rules.analyze(input);
    const mayUseExternal = this.externalAiMode === 'synthetic_only' && input.synthetic && this.external;
    if (!mayUseExternal) return baseline;

    try {
      return await mayUseExternal.analyze(input);
    } catch {
      return baseline;
    }
  }
}
