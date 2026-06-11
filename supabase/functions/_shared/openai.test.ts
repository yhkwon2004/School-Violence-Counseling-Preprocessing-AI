import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeEvidence, type EvidenceRow } from './openai.ts';

const env = new Map<string, string>();

function asset(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    id: 'evidence-1',
    file_name: 'synthetic.png',
    mime_type: 'image/png',
    kind: 'image',
    synthetic: true,
    size_bytes: 7,
    duration_seconds: null,
    storage_path: 'synthetic/evidence-1.png',
    ...overrides,
  };
}

describe('analyzeEvidence', () => {
  beforeEach(() => {
    env.clear();
    env.set('EXTERNAL_AI_MODE', 'synthetic_only');
    env.set('OPENAI_API_KEY', 'local-stub-key');
    env.set('OPENAI_API_BASE_URL', 'http://openai.stub/');
    vi.stubGlobal('Deno', { env: { get: (name: string) => env.get(name) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends synthetic image OCR to the Responses API and uses the stub output', async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_text: 'stub image text' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeEvidence(asset(), 'http://storage.local/synthetic.png');

    expect(result.extractedText).toBe('stub image text');
    expect(result.message).toContain('OCR');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://openai.stub/v1/responses');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer local-stub-key' });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'gpt-4.1-mini',
      store: false,
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'http://storage.local/synthetic.png' },
          {
            type: 'input_text',
            text: '이 합성 상담 자료에서 화면에 보이는 텍스트만 추출하세요. 판단, 해석, 법률 조언을 추가하지 마세요.',
          },
        ],
      }],
    });
  });

  it('sends synthetic PDF OCR to the Responses API as a file input', async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_text: 'stub pdf text' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeEvidence(asset({
      file_name: 'synthetic.pdf',
      mime_type: 'application/pdf',
      kind: 'pdf',
    }), 'http://storage.local/synthetic.pdf');

    expect(result.extractedText).toBe('stub pdf text');
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.input[0].content[0]).toEqual({
      type: 'input_file',
      file_url: 'http://storage.local/synthetic.pdf',
    });
  });

  it('sends eligible synthetic audio to transcription and uses the stub output', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'http://storage.local/synthetic.m4a') {
        return new Response(new Blob(['AUDIODA'], { type: 'audio/mp4' }));
      }
      return Response.json({ text: 'stub audio text' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeEvidence(asset({
      file_name: 'synthetic.m4a',
      mime_type: 'audio/mp4',
      kind: 'audio',
      duration_seconds: 120,
    }), 'http://storage.local/synthetic.m4a');

    expect(result.extractedText).toBe('stub audio text');
    expect(result.message).toContain('STT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://openai.stub/v1/audio/transcriptions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer local-stub-key' });
    const body = init?.body as FormData;
    expect(body.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(body.get('file')).toBeInstanceOf(Blob);
  });

  it('never fetches external AI for a real student asset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeEvidence(asset({ synthetic: false }), 'http://storage.local/real.png');

    expect(result.status).toBe('manual_review');
    expect(result.message).toContain('실제 학생 자료');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps audio with unknown duration in manual review without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeEvidence(asset({
      file_name: 'duration-unknown.m4a',
      mime_type: 'audio/mp4',
      kind: 'audio',
    }), 'http://storage.local/duration-unknown.m4a');

    expect(result.status).toBe('manual_review');
    expect(result.message).toContain('STT 한도');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
