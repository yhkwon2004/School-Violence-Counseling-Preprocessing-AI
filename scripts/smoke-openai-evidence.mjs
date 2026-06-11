import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'openai-smoke');
const officialOpenAiBaseUrl = 'https://api.openai.com';
const defaultStructureModel = 'gpt-4.1-mini';
const defaultTranscribeModel = 'gpt-4o-mini-transcribe';
const defaultTtsModel = 'gpt-4o-mini-tts';

const syntheticOcrLines = [
  'IEUMLOG SYNTHETIC OCR SMOKE',
  'CASE: SYNTH-OCR-20260606',
  'MARKER: BLUE LAKE 729',
  'ACTOR: STUDENT B',
  'NO REAL STUDENT DATA',
];
const syntheticSpeechText = 'Synthetic speech smoke test. Marker blue lake seven two nine. No real student data.';

async function main() {
  const env = await loadEnvironment();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Save a project key to .env.local before running this smoke test.');
  }

  const externalAiMode = env.EXTERNAL_AI_MODE ?? 'synthetic_only';
  if (externalAiMode !== 'synthetic_only') {
    throw new Error(`EXTERNAL_AI_MODE must stay synthetic_only for this smoke test, got ${externalAiMode}.`);
  }

  const baseUrl = normalizeBaseUrl(env.OPENAI_API_BASE_URL ?? officialOpenAiBaseUrl);
  if (baseUrl !== officialOpenAiBaseUrl) {
    throw new Error(`Refusing non-official OPENAI_API_BASE_URL for a real OpenAI smoke test: ${baseUrl}`);
  }

  assertPrivateEnvBoundary();
  await assertNoPublicOpenAiKey();
  await fs.mkdir(outDir, { recursive: true });

  const structureModel = env.OPENAI_STRUCTURE_MODEL || defaultStructureModel;
  const transcribeModel = env.OPENAI_TRANSCRIBE_MODEL || defaultTranscribeModel;
  const ttsModel = env.OPENAI_TTS_MODEL || defaultTtsModel;
  const imagePath = path.join(outDir, 'synthetic-ocr-smoke.png');
  const audioPath = path.join(outDir, 'synthetic-speech-smoke.wav');

  await writeSyntheticPng(imagePath, syntheticOcrLines);
  await writeSyntheticSpeechWav(audioPath, syntheticSpeechText, { apiKey, baseUrl, model: ttsModel });

  const imageStat = await fs.stat(imagePath);
  const audioStat = await fs.stat(audioPath);
  if (imageStat.size <= 0 || audioStat.size <= 1024) {
    throw new Error('Synthetic evidence generation produced an empty file.');
  }

  console.log(`openai_smoke_env=ok mode=${externalAiMode} base_url=${baseUrl}`);
  console.log(`openai_smoke_assets=ok image_bytes=${imageStat.size} audio_bytes=${audioStat.size}`);
  console.log(`openai_smoke_models structure=${structureModel} transcribe=${transcribeModel} tts_fallback=${ttsModel}`);

  const ocrText = await smokeOcr({ apiKey, baseUrl, model: structureModel, imagePath });
  assertTextContains(ocrText, ['BLUE', 'LAKE', '729'], 'OCR');
  console.log(`openai_ocr_smoke=ok chars=${ocrText.length} excerpt=${formatExcerpt(ocrText)}`);

  const transcript = await smokeStt({ apiKey, baseUrl, model: transcribeModel, audioPath });
  assertTextContains(transcript, ['SYNTHETIC', 'SMOKE', 'BLUE'], 'STT');
  console.log(`openai_stt_smoke=ok chars=${transcript.length} excerpt=${formatExcerpt(transcript)}`);
  console.log('openai_evidence_smoke=ok');
}

async function loadEnvironment() {
  const fileEnv = {};
  for (const relativePath of ['.env', '.env.local']) {
    const absolutePath = path.join(root, relativePath);
    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      Object.assign(fileEnv, parseDotEnv(content));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return { ...fileEnv, ...process.env };
}

function parseDotEnv(content) {
  const values = {};
  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function assertPrivateEnvBoundary() {
  const result = spawnSync('git', ['check-ignore', '-q', '--', '.env.local'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error('.env.local is not ignored by git; refusing to run a real-key smoke test.');
  }
}

async function assertNoPublicOpenAiKey() {
  const publicEnvFiles = [
    path.join(root, 'apps', 'web', '.env.local'),
    path.join(root, 'apps', 'mobile', '.env.local'),
  ];
  for (const envFile of publicEnvFiles) {
    let content = '';
    try {
      content = await fs.readFile(envFile, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (/^\s*(VITE_|EXPO_PUBLIC_)?OPENAI_API_KEY\s*=/m.test(content)) {
      throw new Error(`Public env file must not contain an OpenAI API key: ${path.relative(root, envFile)}`);
    }
  }
}

async function smokeOcr({ apiKey, baseUrl, model, imagePath }) {
  const imageBytes = await fs.readFile(imagePath);
  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/png;base64,${imageBytes.toString('base64')}` },
          {
            type: 'input_text',
            text: 'Extract only the visible text from this synthetic safety-report image. Do not add analysis or advice.',
          },
        ],
      }],
    }),
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(`OpenAI OCR smoke failed: ${safeOpenAiError(response, payload)}`);
  const text = extractOutputText(payload);
  if (!text) throw new Error('OpenAI OCR smoke returned no output text.');
  return text;
}

async function smokeStt({ apiKey, baseUrl, model, audioPath }) {
  const audioBytes = await fs.readFile(audioPath);
  const body = new FormData();
  body.append('model', model);
  body.append('response_format', 'json');
  body.append('file', new Blob([audioBytes], { type: 'audio/wav' }), 'synthetic-speech-smoke.wav');

  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(`OpenAI STT smoke failed: ${safeOpenAiError(response, payload)}`);
  const text = typeof payload?.text === 'string' ? payload.text : '';
  if (!text) throw new Error('OpenAI STT smoke returned no transcript text.');
  return text;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

function safeOpenAiError(response, payload) {
  const error = payload?.error ?? {};
  const parts = [`status=${response.status}`];
  if (error.type) parts.push(`type=${error.type}`);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.message) parts.push(`message=${String(error.message).replace(/\s+/g, ' ').slice(0, 300)}`);
  return parts.join(' ');
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks = [];
  visit(payload?.output);
  return chunks.join('\n').trim();

  function visit(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    if ((value.type === 'output_text' || value.type === 'text') && typeof value.text === 'string') {
      chunks.push(value.text);
    }
    if (value.content) visit(value.content);
  }
}

function assertTextContains(text, expectedTokens, label) {
  const normalized = text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  const missing = expectedTokens.filter((token) => !normalized.includes(token));
  if (missing.length > 0) {
    throw new Error(`${label} smoke output missed expected synthetic marker(s): ${missing.join(', ')}`);
  }
}

function formatExcerpt(text) {
  return JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 160));
}

async function writeSyntheticSpeechWav(outputPath, text, ttsFallback) {
  await fs.rm(outputPath, { force: true });
  const command = [
    '$ErrorActionPreference = "Stop"',
    'try {',
    '  Add-Type -AssemblyName System.Speech',
    '  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '  $synth.Rate = -2',
    '  $synth.Volume = 100',
    '  $synth.SetOutputToWaveFile($env:IEUMLOG_SMOKE_WAV)',
    '  $synth.Speak($env:IEUMLOG_SMOKE_TEXT) | Out-Null',
    '  $synth.Dispose()',
    '} catch {',
    '  $stream = New-Object -ComObject SAPI.SpFileStream',
    '  $stream.Open($env:IEUMLOG_SMOKE_WAV, 3, $false)',
    '  try {',
    '    $voice = New-Object -ComObject SAPI.SpVoice',
    '    $voice.Rate = -2',
    '    $voice.Volume = 100',
    '    $voice.AudioOutputStream = $stream',
    '    $voice.Speak($env:IEUMLOG_SMOKE_TEXT) | Out-Null',
    '  } finally {',
    '    $stream.Close()',
    '  }',
    '}',
  ].join('; ');
  try {
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      IEUMLOG_SMOKE_WAV: outputPath,
      IEUMLOG_SMOKE_TEXT: text,
    });
    return;
  } catch (error) {
    console.log(`synthetic_speech_local=unavailable reason=${formatDiagnostic(error)}`);
    await writeOpenAiSpeechWav({ outputPath, text, ...ttsFallback });
  }
}

async function writeOpenAiSpeechWav({ apiKey, baseUrl, model, outputPath, text }) {
  const candidates = Array.from(new Set([model, 'tts-1']));
  let lastError = null;
  for (const candidate of candidates) {
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: candidate,
        voice: 'alloy',
        input: text,
        response_format: 'wav',
      }),
    });
    if (response.ok) {
      const audio = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, audio);
      console.log(`openai_tts_fallback=ok model=${candidate} bytes=${audio.length}`);
      return;
    }
    const payload = await readJsonResponse(response);
    lastError = new Error(`OpenAI TTS fallback failed: ${safeOpenAiError(response, payload)}`);
  }
  throw lastError ?? new Error('OpenAI TTS fallback failed.');
}

function run(command, args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

function formatDiagnostic(error) {
  return JSON.stringify(String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 180));
}

async function writeSyntheticPng(outputPath, lines) {
  const width = 1200;
  const height = 520;
  const pixels = Buffer.alloc(width * height * 3, 255);
  fillRect(pixels, width, height, 0, 0, width, height, [255, 255, 255]);
  fillRect(pixels, width, height, 28, 28, width - 56, height - 56, [242, 247, 255]);
  fillRect(pixels, width, height, 46, 46, width - 92, height - 92, [255, 255, 255]);
  let y = 78;
  for (const line of lines) {
    drawText(pixels, width, height, 82, y, line, 7, [7, 24, 48]);
    y += 82;
  }
  await fs.writeFile(outputPath, encodePngRgb(width, height, pixels));
}

function fillRect(pixels, width, height, x, y, rectWidth, rectHeight, color) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + rectWidth);
  const y1 = Math.min(height, y + rectHeight);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const offset = (py * width + px) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

function drawText(pixels, width, height, x, y, text, scale, color) {
  let cursor = x;
  for (const rawChar of text.toUpperCase()) {
    const glyph = font[rawChar] ?? font[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== '1') continue;
        fillRect(pixels, width, height, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function encodePngRgb(width, height, pixels) {
  const scanlineWidth = width * 3 + 1;
  const raw = Buffer.alloc(scanlineWidth * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * scanlineWidth;
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const font = {
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  '-': ['00000', '00000', '00000', '11110', '00000', '00000', '00000'],
  ':': ['000', '010', '010', '000', '010', '010', '000'],
  '.': ['000', '000', '000', '000', '000', '010', '010'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

try {
  await main();
} catch (error) {
  console.error(`openai_evidence_smoke=failed reason=${formatDiagnostic(error)}`);
  process.exitCode = 1;
}
