export type EvidenceRow = {
  id: string;
  file_name: string;
  mime_type: string;
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'document' | 'other';
  synthetic: boolean;
  size_bytes: number;
  duration_seconds: number | null;
  storage_path: string;
};

export type EvidenceAnalysis = {
  status: 'completed' | 'manual_review';
  extractedText: string | null;
  message: string;
};

export async function analyzeEvidence(asset: EvidenceRow, signedUrl: string): Promise<EvidenceAnalysis> {
  const externalAiMode = Deno.env.get('EXTERNAL_AI_MODE') ?? 'synthetic_only';
  if (externalAiMode !== 'synthetic_only') {
    return { status: 'manual_review', extractedText: null, message: '지원하지 않는 외부 AI 모드입니다. 상담자가 직접 확인합니다.' };
  }
  if (!asset.synthetic) {
    return { status: 'manual_review', extractedText: null, message: '실제 학생 자료는 외부 AI 전송이 차단되어 상담자가 직접 확인합니다.' };
  }
  if (!['image', 'pdf', 'audio'].includes(asset.kind)) {
    return { status: 'manual_review', extractedText: null, message: '이 파일 유형은 저장 후 상담자가 직접 확인합니다.' };
  }
  if (asset.kind === 'audio' && !canTranscribeAudio(asset)) {
    return { status: 'manual_review', extractedText: null, message: 'STT 한도를 확인할 수 없어 상담자가 직접 확인합니다.' };
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { status: 'completed', extractedText: syntheticFallback(asset), message: '합성 OCR·STT 결과를 생성했습니다.' };

  if (asset.kind === 'audio') return transcribeAudio(asset, signedUrl, apiKey);
  return extractFileText(asset, signedUrl, apiKey);
}

async function transcribeAudio(asset: EvidenceRow, signedUrl: string, apiKey: string): Promise<EvidenceAnalysis> {
  const file = await fetch(signedUrl).then((response) => response.blob());
  const body = new FormData();
  body.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe');
  body.append('file', file, asset.file_name);
  const response = await fetch(`${openAiBaseUrl()}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  if (!response.ok) throw new Error(`STT failed: ${response.status}`);
  const result = await response.json();
  return { status: 'completed', extractedText: result.text ?? '', message: '합성 음성 STT를 완료했습니다.' };
}

function canTranscribeAudio(asset: EvidenceRow) {
  return asset.size_bytes <= 25_000_000
    && asset.duration_seconds !== null
    && asset.duration_seconds > 0
    && asset.duration_seconds <= 900;
}

async function extractFileText(asset: EvidenceRow, signedUrl: string, apiKey: string): Promise<EvidenceAnalysis> {
  const source = asset.kind === 'image'
    ? { type: 'input_image', image_url: signedUrl }
    : { type: 'input_file', file_url: signedUrl };
  const response = await fetch(`${openAiBaseUrl()}/v1/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_STRUCTURE_MODEL') ?? 'gpt-5.4-mini',
      store: false,
      input: [{
        role: 'user',
        content: [
          source,
          { type: 'input_text', text: '이 합성 상담 자료에서 화면에 보이는 텍스트만 추출하세요. 판단, 해석, 법률 조언을 추가하지 마세요.' },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`File extraction failed: ${response.status}`);
  const result = await response.json();
  return { status: 'completed', extractedText: result.output_text ?? '', message: '합성 이미지·PDF OCR을 완료했습니다.' };
}

function syntheticFallback(asset: EvidenceRow) {
  return `[합성 분석 결과] ${asset.file_name}에서 상담자가 확인할 텍스트 후보를 추출했습니다.`;
}

function openAiBaseUrl() {
  return (Deno.env.get('OPENAI_API_BASE_URL') ?? 'https://api.openai.com').replace(/\/+$/, '');
}
