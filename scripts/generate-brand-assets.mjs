import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
let WebSocketCtor = globalThis.WebSocket;
if (!WebSocketCtor) {
  WebSocketCtor = (await import('ws')).default;
}

const outputs = [
  { name: 'mobile-icon', width: 1024, height: 1024, full: false, files: ['apps/mobile/assets/icon.png', 'apps/mobile/assets/adaptive-icon.png', 'apps/web/public/ieumlog-icon.png'] },
  { name: 'mobile-logo', width: 1200, height: 700, full: true, files: ['apps/mobile/assets/logo.png', 'apps/web/public/ieumlog-logo.png'] },
];

const chromePath = await findChromePath();
const port = 9320 + Math.floor(Math.random() * 400);
const userDataDir = path.join(os.tmpdir(), `ieumlog-brand-${Date.now()}`);
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
  const generated = await evaluateInPage(pageWsUrl, renderExpression(outputs));
  for (const item of generated) {
    const bytes = Buffer.from(item.base64, 'base64');
    for (const relativePath of item.files) {
      const filePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, bytes);
      console.log(`brand_asset=${relativePath} bytes=${bytes.length}`);
    }
  }
} finally {
  chrome.kill();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
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

function renderExpression(assetOutputs) {
  return `(${async function renderBrandAssets(outputs) {
    const navy = '#062d62';
    const navy2 = '#0d427e';
    const slate = '#7f8d9c';
    const gold = '#c8a66a';
    const ink = '#43566d';

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawBook(ctx, cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = navy;
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(-310, 50);
      ctx.bezierCurveTo(-185, 48, -94, 96, 0, 184);
      ctx.bezierCurveTo(94, 96, 185, 48, 310, 50);
      ctx.stroke();
      ctx.lineWidth = 19;
      ctx.beginPath();
      ctx.moveTo(-310, 105);
      ctx.bezierCurveTo(-192, 106, -78, 122, 0, 184);
      ctx.bezierCurveTo(78, 122, 192, 106, 310, 105);
      ctx.stroke();
      ctx.strokeStyle = '#d7e1ec';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-14, 185);
      ctx.lineTo(0, 218);
      ctx.lineTo(14, 185);
      ctx.stroke();
      ctx.restore();
    }

    function drawMark(ctx, cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const left = ctx.createLinearGradient(-280, -170, -20, 180);
      left.addColorStop(0, navy2);
      left.addColorStop(1, navy);
      const right = ctx.createLinearGradient(20, -170, 280, 180);
      right.addColorStop(0, '#9eabb7');
      right.addColorStop(1, '#6e7f90');
      ctx.strokeStyle = left;
      ctx.lineWidth = 48;
      ctx.beginPath();
      ctx.arc(-110, -70, 118, Math.PI * 0.08, Math.PI * 1.72, false);
      ctx.stroke();
      ctx.strokeStyle = right;
      ctx.beginPath();
      ctx.arc(110, -70, 118, Math.PI * 1.15, Math.PI * 2.92, false);
      ctx.stroke();
      ctx.strokeStyle = navy;
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(-154, 16);
      ctx.lineTo(-28, -22);
      ctx.stroke();
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-18, -22);
      ctx.lineTo(118, -22);
      ctx.stroke();
      ctx.fillStyle = navy;
      ctx.beginPath();
      ctx.arc(-38, -22, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(130, -22, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(2, 154);
      ctx.stroke();
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(2, 190);
      ctx.lineTo(-22, 154);
      ctx.lineTo(24, 154);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawBackground(ctx, width, height, full) {
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#f4f8fd');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      if (!full) {
        ctx.save();
        ctx.shadowColor = 'rgba(6,45,98,.16)';
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 24;
        roundRect(ctx, 88, 88, width - 176, height - 176, 210);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(200,166,106,.11)';
      ctx.beginPath();
      ctx.arc(width * .78, height * .18, width * .18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(6,45,98,.06)';
      ctx.beginPath();
      ctx.arc(width * .18, height * .82, width * .24, 0, Math.PI * 2);
      ctx.fill();
    }

    async function canvasToBase64(canvas) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    const results = [];
    for (const output of outputs) {
      const canvas = document.createElement('canvas');
      canvas.width = output.width;
      canvas.height = output.height;
      const ctx = canvas.getContext('2d');
      drawBackground(ctx, output.width, output.height, output.full);
      if (output.full) {
        drawBook(ctx, output.width / 2, 282, .84);
        drawMark(ctx, output.width / 2, 198, .84);
        ctx.fillStyle = navy;
        ctx.textAlign = 'center';
        ctx.font = '900 104px Malgun Gothic, Apple SD Gothic Neo, Arial';
        ctx.fillText('이음로그', output.width / 2, 532);
        ctx.strokeStyle = '#99a6b3';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(output.width / 2 - 42, 584);
        ctx.lineTo(output.width / 2 + 42, 584);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = '500 31px Malgun Gothic, Apple SD Gothic Neo, Arial';
        ctx.fillText('기록이 이어지고, 신뢰가 쌓입니다.', output.width / 2, 642);
      } else {
        drawBook(ctx, output.width / 2, 640, 1.08);
        drawMark(ctx, output.width / 2, 390, 1.2);
      }
      results.push({ files: output.files, base64: await canvasToBase64(canvas) });
    }
    return results;
  }})(${JSON.stringify(assetOutputs)})`;
}
