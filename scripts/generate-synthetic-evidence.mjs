import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'apps', 'web', 'public', 'demo-evidence', 'case-synthetic-001');
let WebSocketCtor = globalThis.WebSocket;
if (!WebSocketCtor) {
  WebSocketCtor = (await import('ws')).default;
}

await fs.mkdir(outDir, { recursive: true });

await Promise.all([
  writeText('chat-capture-001.svg', chatCaptureSvg()),
  writeText('stair-location-map-002.svg', stairLocationMapSvg()),
  writeText('chat-share-003.svg', chatShareSvg()),
  writeText('teacher-note-004.txt', teacherNoteText()),
  writeText('witness-memo-005.txt', witnessMemoText()),
  writeText('timeline-board-006.svg', timelineBoardSvg()),
]);

try {
  await generateWebm(path.join(outDir, 'stair-video-003.webm'));
} catch (error) {
  console.warn(`synthetic_webm_generation=skipped ${error instanceof Error ? error.message : String(error)}`);
  await writeText('stair-video-storyboard-003.svg', stairVideoStoryboardSvg());
}

console.log(`synthetic_evidence_dir=${outDir}`);

async function writeText(name, content) {
  await fs.writeFile(path.join(outDir, name), content, 'utf8');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function svgFrame(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#edf4ff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#062d62" flood-opacity=".14"/>
    </filter>
    <style>
      .bg{fill:#f6f9fd}
      .card{fill:url(#paper);stroke:#dbe6f3;filter:url(#shadow)}
      .navy{fill:#062d62}
      .gold{fill:#c8a66a}
      .muted{fill:#6d7e95}
      .line{stroke:#9fb1c7;stroke-width:2}
      .strong{font:700 30px "Malgun Gothic","Apple SD Gothic Neo",sans-serif}
      .body{font:500 22px "Malgun Gothic","Apple SD Gothic Neo",sans-serif}
      .small{font:500 17px "Malgun Gothic","Apple SD Gothic Neo",sans-serif}
      .mono{font:600 19px Consolas,"Malgun Gothic",monospace}
    </style>
  </defs>
  <rect class="bg" width="${width}" height="${height}"/>
  <rect class="card" x="34" y="30" width="${width - 68}" height="${height - 60}" rx="30"/>
  <text class="strong navy" x="68" y="82">${escapeXml(title)}</text>
  ${body}
</svg>
`;
}

function chatCaptureSvg() {
  return svgFrame(1000, 720, '합성 증거 001 · 단체 채팅 캡처', `
  <text class="small muted" x="68" y="118">사건번호 CASE-24-0510 · 실제 학생 자료 아님 · 욕설 표현은 생략 처리</text>
  <rect x="88" y="150" width="824" height="500" rx="34" fill="#f9fbff" stroke="#d9e4f2"/>
  <rect x="120" y="188" width="760" height="54" rx="18" fill="#062d62"/>
  <text class="body" x="150" y="223" fill="#fff">3학년 단체 채팅방 · 2024.05.10 14:29</text>
  ${bubble(140, 282, 470, 'C: 방금 계단 쪽 영상 올려도 돼?', '#ffffff', '#1b2f4d')}
  ${bubble(386, 356, 468, 'B: 올려. 애들 다 보게 해.', '#eaf1fb', '#1b2f4d')}
  ${bubble(140, 430, 612, '익명 학생: [욕설 표현 생략] 라고 말한 장면 맞아?', '#ffffff', '#1b2f4d')}
  ${bubble(356, 504, 498, '방장 E: 지금 31명 읽음. 더 보내지 마.', '#fff7e5', '#1b2f4d')}
  <rect x="145" y="592" width="300" height="26" rx="13" fill="#dce8f8"/>
  <text class="small muted" x="464" y="612">OCR 추출 후보: B, C, 방장 E, 14:29-14:31</text>
  `);
}

function chatShareSvg() {
  return svgFrame(1000, 720, '합성 증거 003 · 영상 공유 메시지', `
  <text class="small muted" x="68" y="118">영상 파일 공유 경로와 읽음 인원 확인용 캡처</text>
  <rect x="92" y="154" width="816" height="496" rx="28" fill="#fbfdff" stroke="#d9e4f2"/>
  <rect x="134" y="202" width="732" height="118" rx="26" fill="#eef5ff" stroke="#cad8ea"/>
  <text class="body navy" x="170" y="248">첨부: stair-video-003.webm</text>
  <text class="small muted" x="170" y="286">업로드 시각 14:30 · 읽음 31명 · 전달자 C</text>
  <path d="M170 380h624" class="line"/>
  <circle cx="216" cy="430" r="24" fill="#c8a66a"/>
  <text class="small navy" x="258" y="438">B가 C에게 촬영 후 공유 지시로 보이는 메시지</text>
  <circle cx="216" cy="510" r="24" fill="#062d62"/>
  <text class="small navy" x="258" y="518">방장 E가 채팅방 유포 중단 요청</text>
  <circle cx="216" cy="590" r="24" fill="#8ca0b6"/>
  <text class="small navy" x="258" y="598">피해 학생 관련 표현은 상담자 확인 필요</text>
  `);
}

function stairLocationMapSvg() {
  return svgFrame(1000, 720, '합성 증거 002 · 위치 도면', `
  <text class="small muted" x="68" y="118">학교 2층 복도와 계단 사이 동선 · 좌표는 시연용</text>
  <rect x="108" y="166" width="784" height="428" rx="22" fill="#ffffff" stroke="#d6e2f0"/>
  <rect x="164" y="232" width="330" height="90" rx="14" fill="#edf4ff" stroke="#b8c9de"/>
  <text class="body navy" x="230" y="287">2층 복도</text>
  <rect x="548" y="218" width="220" height="240" rx="18" fill="#fff6e2" stroke="#d4b978"/>
  <text class="body navy" x="610" y="348">계단</text>
  <path d="M332 318 C390 370, 502 382, 588 332" fill="none" stroke="#062d62" stroke-width="8" stroke-linecap="round"/>
  <polygon points="588,332 552,323 572,357" fill="#062d62"/>
  <circle cx="328" cy="318" r="20" fill="#c8a66a"/>
  <text class="small navy" x="184" y="384">14:20 B 발언 위치</text>
  <circle cx="594" cy="332" r="20" fill="#d95454"/>
  <text class="small navy" x="560" y="508">14:25 밀침·촬영 주장 위치</text>
  <rect x="144" y="620" width="712" height="36" rx="18" fill="#edf4ff"/>
  <text class="small muted" x="176" y="644">확인 필요: CCTV 사각 여부, 복도 목격자 D 위치, 교사 도착 시각</text>
  `);
}

function stairVideoStoryboardSvg() {
  return svgFrame(1000, 720, '합성 영상 스토리보드 · stair-video-003', `
  <text class="small muted" x="68" y="118">실제 학생 자료 아님 · WebM 생성 실패 시 미리보기 대체본</text>
  ${frameBox(92, 172, '14:24:58', '복도 진입', '피해 학생, B, C가 계단 쪽으로 이동')}
  ${frameBox(358, 172, '14:25:04', '계단 앞', 'B가 앞쪽으로 다가서고 C가 휴대폰을 들고 있음')}
  ${frameBox(624, 172, '14:25:12', '계단 하단', '피해 학생이 뒤로 물러남 · 원본 확인 필요')}
  <path d="M280 392h78M546 392h78" stroke="#c8a66a" stroke-width="8" stroke-linecap="round"/>
  <polygon points="358,392 333,378 333,406" fill="#c8a66a"/>
  <polygon points="624,392 599,378 599,406" fill="#c8a66a"/>
  <rect x="104" y="540" width="792" height="76" rx="24" fill="#f7faff" stroke="#d9e4f2"/>
  <text class="small navy" x="140" y="572">분석 메모: 영상은 AI 판단 대상이 아니라 상담자가 원본을 보며 사실 확인합니다.</text>
  <text class="small muted" x="140" y="604">후보 연결: FactBlock #2, #3 · 관련 인물: 피해 학생, B, C, 방장 E</text>
  `);
}

function timelineBoardSvg() {
  return svgFrame(1000, 720, '합성 증거 006 · 사건 타임라인 보드', `
  <text class="small muted" x="68" y="118">상담 전처리 요약용 보드 · 판단 문구 없음</text>
  ${timelineRow(158, '14:20', '2층 복도', 'B의 모욕성 발언 주장', '#c8a66a')}
  ${timelineRow(242, '14:25', '계단', 'B 접근, C 촬영 주장', '#d95454')}
  ${timelineRow(326, '14:30', '단체 채팅방', '영상 공유와 읽음 인원 발생', '#062d62')}
  ${timelineRow(410, '14:36', '교실', '친구 A에게 상황 전달', '#2f8f75')}
  ${timelineRow(494, '15:10', '복도/상담실', '목격자 D 진술 후보와 교사 보고', '#8ca0b6')}
  <rect x="92" y="600" width="816" height="42" rx="21" fill="#fff7e5"/>
  <text class="small navy" x="126" y="628">확인 필요: CCTV 보존 여부, 목격자 D의 정확 위치, 원본 영상 보유자</text>
  `);
}

function teacherNoteText() {
  return `이음로그 합성 증거 004 - 상담 교사 메모

사건번호: CASE-24-0510
작성시각: 2024-05-10 15:35
작성자: 담임 선생님(익명)

학생이 2층 복도와 계단에서 있었던 일을 상담실에서 설명함.
학생은 B의 발언, 계단 앞 밀침 주장, C의 촬영 정황, 단체 채팅방 공유를 순서대로 진술함.
감정 상태가 불안정해 보였으며, 친구 A가 함께 동행함.

상담 전 확인할 자료:
- 단체 채팅 캡처 원본과 읽음 인원
- 계단 근처 CCTV 보존 가능 여부
- 목격자 D의 위치와 진술 가능 여부
- 영상 원본 보유자 확인

주의: 이 문서는 합성 시연 자료이며 법률 판단 또는 학교폭력 인정 판단을 포함하지 않음.
`;
}

function witnessMemoText() {
  return `이음로그 합성 증거 005 - 목격자 D 메모 후보

사건번호: CASE-24-0510
작성시각: 2024-05-10 16:05
작성자: 목격자 D(익명)

14시 25분 무렵 계단 위쪽에서 B와 C가 피해 학생 가까이에 있었던 것을 봄.
C가 휴대폰을 들고 있었고, 피해 학생은 계단 벽 쪽으로 물러나는 것처럼 보였음.
정확한 말 내용은 듣지 못함.

확인 필요:
- D가 서 있던 위치
- 당시 주변 학생 수
- C 휴대폰 화면이 녹화 중이었는지 여부
`;
}

function bubble(x, y, w, text, fill, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="52" rx="20" fill="${fill}" stroke="#d8e3f1"/>
  <text class="small" x="${x + 24}" y="${y + 34}" fill="${color}">${escapeXml(text)}</text>`;
}

function frameBox(x, y, time, label, desc) {
  return `<rect x="${x}" y="${y}" width="224" height="246" rx="26" fill="#fbfdff" stroke="#d7e3f0"/>
  <rect x="${x + 20}" y="${y + 24}" width="184" height="114" rx="18" fill="#edf4ff"/>
  <circle cx="${x + 82}" cy="${y + 90}" r="18" fill="#062d62"/>
  <circle cx="${x + 142}" cy="${y + 82}" r="18" fill="#c8a66a"/>
  <path d="M${x + 66} ${y + 126} C${x + 104} ${y + 106}, ${x + 132} ${y + 132}, ${x + 174} ${y + 110}" fill="none" stroke="#8ca0b6" stroke-width="6" stroke-linecap="round"/>
  <text class="mono navy" x="${x + 24}" y="${y + 172}">${time}</text>
  <text class="body navy" x="${x + 24}" y="${y + 204}">${escapeXml(label)}</text>
  <foreignObject x="${x + 24}" y="${y + 214}" width="176" height="54"><div xmlns="http://www.w3.org/1999/xhtml" style="font:500 14px Malgun Gothic, sans-serif;color:#6d7e95;line-height:1.35">${escapeXml(desc)}</div></foreignObject>`;
}

function timelineRow(y, time, place, action, color) {
  return `<circle cx="128" cy="${y}" r="14" fill="${color}"/>
  <line x1="128" x2="128" y1="${y + 14}" y2="${y + 70}" stroke="#ccd8e6" stroke-width="3"/>
  <text class="mono navy" x="164" y="${y + 8}">${time}</text>
  <text class="small muted" x="260" y="${y + 8}">${escapeXml(place)}</text>
  <text class="body navy" x="430" y="${y + 8}">${escapeXml(action)}</text>`;
}

async function generateWebm(outputPath) {
  const chromePath = await findChromePath();
  const port = 9227 + Math.floor(Math.random() * 400);
  const userDataDir = path.join(os.tmpdir(), `ieumlog-chrome-record-${Date.now()}`);
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const pageWsUrl = await waitForPageWebSocket(port);
    const result = await evaluateInPage(pageWsUrl, recordingExpression());
    if (!result?.base64 || result.size < 1024) {
      throw new Error('Chrome returned an empty WebM payload.');
    }
    await fs.writeFile(outputPath, Buffer.from(result.base64, 'base64'));
    console.log(`synthetic_webm=${outputPath} bytes=${result.size} type=${result.type}`);
  } finally {
    chrome.kill();
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Chrome or Edge was not found.');
}

async function waitForPageWebSocket(port) {
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (response.ok) {
        const target = await response.json();
        if (target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome DevTools endpoint did not become ready: ${lastError instanceof Error ? lastError.message : 'timeout'}`);
}

async function evaluateInPage(wsUrl, expression) {
  const ws = new WebSocketCtor(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket failed.')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });
  function send(method, params = {}) {
    const requestId = ++id;
    ws.send(JSON.stringify({ id: requestId, method, params }));
    return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
  }
  await send('Runtime.enable');
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 20_000,
  });
  ws.close();
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed.');
  }
  return result.result.value;
}

function recordingExpression() {
  return `(${async function recordSyntheticEvidence() {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();

    const frames = [
      ['14:24:58', '복도 진입', '피해 학생, B, C가 계단 방향으로 이동'],
      ['14:25:04', '계단 앞 접근', 'B가 앞쪽으로 다가서고 C가 휴대폰을 들고 있음'],
      ['14:25:12', '뒤로 물러남', '피해 학생이 벽 쪽으로 물러나는 장면 후보'],
      ['14:30:20', '채팅방 공유', '영상이 단체 채팅방에 공유된 정황'],
    ];

    function roundRect(x, y, w, h, r, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    function drawPerson(x, y, color, label) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + 22);
      ctx.lineTo(x, y + 92);
      ctx.stroke();
      ctx.font = '600 20px Malgun Gothic, Arial';
      ctx.fillText(label, x - 28, y + 126);
    }

    function drawFrame(i) {
      const phase = Math.floor(i / 18) % frames.length;
      const t = (i % 18) / 17;
      const [time, label, desc] = frames[phase];
      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, '#f8fbff');
      grad.addColorStop(1, '#eaf2ff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 540);
      roundRect(34, 30, 892, 480, 30, '#ffffff', '#d8e4f2');
      ctx.fillStyle = '#062d62';
      ctx.font = '800 34px Malgun Gothic, Arial';
      ctx.fillText('이음로그 합성 영상 증거 · stair-video-003', 72, 88);
      ctx.fillStyle = '#6d7e95';
      ctx.font = '500 20px Malgun Gothic, Arial';
      ctx.fillText('실제 학생 자료 아님 · 상담 전처리 시연용 · AI 판단 없음', 72, 122);
      ctx.strokeStyle = '#cbd8e8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(120, 390);
      ctx.lineTo(820, 390);
      ctx.stroke();
      ctx.fillStyle = '#fff7e5';
      roundRect(594, 178, 226, 132, 22, '#fff7e5', '#d8bd7c');
      ctx.fillStyle = '#062d62';
      ctx.font = '800 28px Malgun Gothic, Arial';
      ctx.fillText(time, 626, 224);
      ctx.fillStyle = '#1b2f4d';
      ctx.font = '700 24px Malgun Gothic, Arial';
      ctx.fillText(label, 626, 260);
      ctx.fillStyle = '#6d7e95';
      ctx.font = '500 17px Malgun Gothic, Arial';
      ctx.fillText(desc, 626, 292);
      const victimX = 220 + phase * 22 + t * 18;
      drawPerson(victimX, 228, '#062d62', '피해');
      drawPerson(416 - phase * 5, 220, '#c8a66a', 'B');
      drawPerson(510 + Math.sin(i / 5) * 8, 218, '#8ca0b6', 'C');
      ctx.strokeStyle = '#d95454';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(424, 260);
      ctx.quadraticCurveTo(470, 292, victimX + 40, 286);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d95454';
      ctx.beginPath();
      ctx.moveTo(victimX + 45, 286);
      ctx.lineTo(victimX + 82, 273);
      ctx.lineTo(victimX + 68, 306);
      ctx.closePath();
      ctx.fill();
      roundRect(72, 430, 814, 48, 24, '#edf4ff', null);
      ctx.fillStyle = '#062d62';
      ctx.font = '600 18px Malgun Gothic, Arial';
      ctx.fillText('후보 연결: FactBlock #2 밀침·촬영, FactBlock #3 채팅방 공유 · 원본 확인 필요', 104, 461);
    }

    for (let i = 0; i < 72; i += 1) {
      drawFrame(i);
      await new Promise((resolve) => setTimeout(resolve, 84));
    }
    recorder.stop();
    await new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: 'video/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return { base64: btoa(binary), size: bytes.length, type: blob.type };
  }})()`;
}
