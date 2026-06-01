import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [name, ...value] = argument.replace(/^--/, '').split('=');
    return [name, value.join('=')];
  }),
);
const webUrl = options.webUrl ?? 'http://127.0.0.1:5173';
const debugUrl = options.debugUrl ?? 'http://127.0.0.1:9224';
const screenshotDir = options.screenshotDir ?? 'C:\\tmp\\ieumlog-web-ui-smoke';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data.toString());
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(client, fileName) {
  const response = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: true,
    format: 'png',
    fromSurface: true,
  });
  await writeFile(join(screenshotDir, fileName), Buffer.from(response.data, 'base64'));
}

async function login(client, email) {
  await waitFor(client, 'document.querySelector(".staff-login-form")', 'staff login form');
  await evaluate(client, `(() => {
    const setInput = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput(document.querySelector('input[type="email"]'), ${JSON.stringify(email)});
    setInput(document.querySelector('input[type="password"]'), 'demo1234');
    document.querySelector('.staff-login-form').requestSubmit();
    return true;
  })()`);
}

await mkdir(screenshotDir, { recursive: true });
const targets = await fetch(`${debugUrl}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === 'page');
assert(page, 'Headless Chrome did not expose a page target.');
const client = new CdpClient(page.webSocketDebuggerUrl);

try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: webUrl });
  await login(client, 'counselor@wee.demo');
  await waitFor(client, 'document.querySelector(".counselor-workspace")', 'counselor workspace');

  const counselor = await evaluate(client, `(() => ({
    caseCodes: [...document.querySelectorAll('.case-code')].map((node) => node.textContent.trim()),
    evidenceLabels: [...document.querySelectorAll('.evidence-row > span:first-child')].map((node) => node.textContent.trim()),
    institution: document.querySelector('.sidebar-footer small')?.textContent.trim(),
  }))()`);
  assert(counselor.caseCodes.includes('CASE-00000001'), 'Counselor workspace did not render the selected case code.');
  assert(counselor.institution === '부산 이음 Wee센터', 'Counselor workspace did not render the active institution.');
  assert(counselor.evidenceLabels.includes('진술 1'), 'Evidence map did not render the first stored FactBlock link.');
  assert(counselor.evidenceLabels.includes('진술 2, 진술 3'), 'Evidence map did not render the stored multi-FactBlock link.');
  await evaluate(client, `(() => {
    const button = [...document.querySelectorAll('.tab-list button')].find((node) => node.textContent.trim() === '증거맵');
    button?.click();
    return Boolean(button);
  })()`);
  await sleep(250);
  await screenshot(client, 'counselor-evidence-map.png');
  console.log('connected_counselor_ui=ok');

  await evaluate(client, `(() => {
    localStorage.removeItem('ieumlog:staff-session');
    location.reload();
    return true;
  })()`);
  await login(client, 'platform@ieumlog.demo');
  await waitFor(client, 'document.querySelector(".admin-layout")', 'platform admin workspace');
  const platformNavigation = await evaluate(client, `[...document.querySelectorAll('.admin-sidebar nav button')].map((node) => node.textContent.trim())`);
  assert(platformNavigation.includes('기관 관리'), 'Platform admin workspace did not render institution management.');
  assert(!platformNavigation.includes('보관 정책'), 'Platform admin workspace exposed institution-only retention controls.');
  await screenshot(client, 'platform-admin-menu.png');
  console.log('connected_platform_ui=ok');
  console.log(`web_ui_screenshots=${screenshotDir}`);
} finally {
  client.close();
}
