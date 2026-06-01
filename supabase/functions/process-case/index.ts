import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { sha256 } from '../_shared/hash.ts';
import { adminClient, requestClient, requireUser } from '../_shared/supabase.ts';

type FactCandidate = {
  action: string;
  occurredAt: string | null;
  location: string | null;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['POST']);
  if (unsupportedMethod) return unsupportedMethod;

  try {
    const user = await requireUser(request);
    const { caseId } = await request.json();
    const requester = requestClient(request);
    const admin = adminClient();
    const { data: caseRecord, error } = await requester.from('cases').select('id, student_id, memo, status').eq('id', caseId).single();
    if (error || !caseRecord) throw error ?? new Error('사건을 찾을 수 없습니다.');
    if (caseRecord.student_id !== user.id) {
      return json({ message: '학생 본인만 기록을 다시 정리할 수 있습니다.' }, 403);
    }
    if (!['draft', 'analyzing', 'student_review', 'reopened'].includes(caseRecord.status)) {
      return json({ message: '제출된 사건은 다시 분석할 수 없습니다.' }, 409);
    }

    const { error: analyzingError } = await admin.from('cases').update({ status: 'analyzing' }).eq('id', caseId);
    if (analyzingError) throw analyzingError;
    const { error: questionDeleteError } = await admin.from('missing_questions').delete().eq('case_id', caseId);
    if (questionDeleteError) throw questionDeleteError;
    const { error: factDeleteError } = await admin.from('fact_blocks').delete().eq('case_id', caseId);
    if (factDeleteError) throw factDeleteError;

    const facts = extractFacts(caseRecord.memo);
    if (facts.length) {
      const { error: factError } = await admin.from('fact_blocks').insert(
        facts.map((fact, index) => ({
          case_id: caseId,
          sequence: index + 1,
          occurred_at: fact.occurredAt,
          location: fact.location,
          action: fact.action,
          confirmed: false,
        })),
      );
      if (factError) throw factError;
    }

    const questions = buildQuestions(caseId, facts);
    if (questions.length) {
      const { error: questionError } = await admin.from('missing_questions').insert(questions);
      if (questionError) throw questionError;
    }

    const { error: reviewError } = await admin.from('cases').update({ status: 'student_review', analyzed_memo_hash: await sha256(caseRecord.memo) }).eq('id', caseId);
    if (reviewError) throw reviewError;
    return json({ factCount: facts.length, questionCount: questions.length, status: 'student_review' });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '사건을 정리할 수 없습니다.' }, 400);
  }
});

function extractFacts(memo: string): FactCandidate[] {
  return memo
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 2)
    .slice(0, 12)
    .map((action) => ({
      action,
      occurredAt: extractDate(action),
      location: extractLocation(action),
    }));
}

function extractDate(sentence: string) {
  const match = sentence.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!match) return null;
  const year = new Date().getFullYear();
  return new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2]))).toISOString();
}

function extractLocation(sentence: string) {
  const knownLocations = ['복도', '교실', '계단', '운동장', '화장실', '급식실', '채팅방', '단톡방'];
  return knownLocations.find((location) => sentence.includes(location)) ?? null;
}

function buildQuestions(caseId: string, facts: FactCandidate[]) {
  const questions: Array<{ case_id: string; field: string; prompt: string }> = [];
  if (!facts.length) {
    return [{ case_id: caseId, field: 'action', prompt: '기억나는 일을 한 문장이라도 적어 줄 수 있나요?' }];
  }
  if (facts.some((fact) => !fact.occurredAt)) {
    questions.push({ case_id: caseId, field: 'occurred_at', prompt: '정확하지 않아도 괜찮아요. 일이 있었던 날짜나 시간대를 기억하나요?' });
  }
  if (facts.some((fact) => !fact.location)) {
    questions.push({ case_id: caseId, field: 'location', prompt: '학교 안이나 온라인 중 어디에서 있었던 일인지 알려 줄 수 있나요?' });
  }
  questions.push({ case_id: caseId, field: 'actor', prompt: '함께 있었거나 상황을 본 사람이 더 있었나요?' });
  return questions;
}
