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

async function waitForWorkspaceOrLoginError(client, selector, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector(${JSON.stringify(selector)})),
      error: document.querySelector('.form-error')?.textContent.trim() ?? '',
    }))()`);
    if (state.ready) return;
    if (state.error) throw new Error(`${label} login failed: ${state.error}`);
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
    return true;
  })()`);
  await sleep(100);
  await evaluate(client, `(() => {
    document.querySelector('.staff-login-form').requestSubmit();
    return true;
  })()`);
}

async function logout(client) {
  await evaluate(client, `(() => {
    localStorage.removeItem('ieumlog:staff-session');
    location.reload();
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
  await waitForWorkspaceOrLoginError(client, '.counselor-workspace', 'counselor workspace');

  const counselor = await evaluate(client, `(() => ({
    caseCodes: [...document.querySelectorAll('.case-code')].map((node) => node.textContent.trim()),
    evidenceLabels: [...document.querySelectorAll('.evidence-row > span:first-child')].map((node) => node.textContent.trim()),
    institution: document.querySelector('.sidebar-footer small')?.textContent.trim(),
  }))()`);
  assert(counselor.caseCodes.includes('CASE-00000001'), 'Counselor workspace did not render the selected case code.');
  assert(counselor.institution === '부산 이음 Wee센터', 'Counselor workspace did not render the active institution.');
  assert(counselor.evidenceLabels.includes('진술 1'), 'Evidence map did not render the first stored FactBlock link.');
  assert(counselor.evidenceLabels.includes('진술 2, 진술 3'), 'Evidence map did not render the stored multi-FactBlock link.');
  const relationMatrix = await evaluate(client, `(() => ({
    headers: [...document.querySelectorAll('.relation-matrix-table th')].map((node) => node.textContent.trim()),
    rows: document.querySelectorAll('.relation-matrix-table tbody tr').length,
  }))()`);
  for (const header of ['사건', '시간', '장소', '행위', '인물', '관계', '증거']) {
    assert(relationMatrix.headers.includes(header), `Relation case-action matrix is missing the ${header} column.`);
  }
  assert(relationMatrix.rows >= 3, 'Relation case-action matrix did not render the seeded FactBlocks.');
  await evaluate(client, `(() => {
    document.querySelector('.relation-matrix-table tbody tr')?.click();
    return true;
  })()`);
  await waitFor(client, 'document.querySelector(".relation-matrix-table tbody tr.active")', 'active relation matrix row');
  const relationSpotlight = await evaluate(client, `(() => ({
    activeRows: document.querySelectorAll('.relation-matrix-table tbody tr.active').length,
    dimmedNodes: document.querySelectorAll('.relation-svg-node.dimmed').length,
    spotlightEdges: document.querySelectorAll('.relation-edge-group.spotlight').length,
    spotlightNodes: document.querySelectorAll('.relation-svg-node.spotlight').length,
  }))()`);
  assert(relationSpotlight.activeRows === 1, 'Relation matrix row selection did not stay visible.');
  assert(relationSpotlight.spotlightNodes >= 2, 'Relation graph did not spotlight the FactBlock people.');
  assert(relationSpotlight.spotlightEdges >= 1, 'Relation graph did not spotlight the FactBlock relation edge.');
  assert(relationSpotlight.dimmedNodes >= 1, 'Relation graph did not dim unrelated people.');
  await screenshot(client, 'counselor-relation-matrix.png');
  await evaluate(client, `(() => {
    const button = [...document.querySelectorAll('.tab-list button')].find((node) => node.textContent.trim() === '증거맵');
    button?.click();
    return Boolean(button);
  })()`);
  await sleep(250);
  await screenshot(client, 'counselor-evidence-map.png');
  console.log('connected_counselor_ui=ok');

  await logout(client);
  await login(client, 'admin@wee.demo');
  await waitForWorkspaceOrLoginError(client, '.admin-layout', 'institution admin workspace');
  const institutionAdminNavigation = await evaluate(client, `[...document.querySelectorAll('.admin-sidebar nav button')].map((node) => node.textContent.trim())`);
  assert(institutionAdminNavigation.includes('보관 정책'), 'Institution admin workspace did not render retention controls.');
  assert(!institutionAdminNavigation.includes('기관 관리'), 'Institution admin workspace exposed platform-only institution management.');
  await evaluate(client, `(() => {
    const button = [...document.querySelectorAll('.admin-sidebar nav button')].find((node) => node.textContent.trim() === '보관 정책');
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor(client, 'document.querySelector(".policy-card")', 'institution retention policy');
  const retentionValues = await evaluate(client, `[...document.querySelectorAll('.policy-card input')].map((node) => node.value)`);
  assert(retentionValues[0] === '30', 'Institution retention policy did not restore the seed retention period.');
  assert(retentionValues[1] === '7', 'Institution retention policy did not render the deletion recovery period.');
  const desktopRetentionLayout = await evaluate(client, `(() => {
    const card = document.querySelector('.policy-card').getBoundingClientRect();
    const inputs = [...document.querySelectorAll('.policy-card input')].map((node) => node.getBoundingClientRect());
    return { cardRight: card.right, inputRights: inputs.map((input) => input.right) };
  })()`);
  assert(
    desktopRetentionLayout.inputRights.every((right) => right <= desktopRetentionLayout.cardRight + 1),
    'Institution retention policy input overflowed its desktop card.',
  );
  await screenshot(client, 'institution-admin-retention.png');

  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 844,
    mobile: true,
    width: 390,
  });
  await sleep(250);
  const mobileRetentionLayout = await evaluate(client, `(() => {
    const labels = [...document.querySelectorAll('.policy-card label')].map((node) => node.getBoundingClientRect());
    return {
      firstTop: labels[0].top,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      secondTop: labels[1].top,
    };
  })()`);
  assert(mobileRetentionLayout.secondTop > mobileRetentionLayout.firstTop, 'Institution retention controls did not stack on a mobile viewport.');
  assert(!mobileRetentionLayout.hasHorizontalOverflow, 'Institution retention workspace overflowed horizontally on a mobile viewport.');
  await screenshot(client, 'institution-admin-retention-mobile.png');
  await client.send('Emulation.clearDeviceMetricsOverride');
  await sleep(250);
  console.log('connected_institution_admin_ui=ok');

  await logout(client);
  await login(client, 'platform@ieumlog.demo');
  await waitForWorkspaceOrLoginError(client, '.admin-layout', 'platform admin workspace');
  const platformNavigation = await evaluate(client, `[...document.querySelectorAll('.admin-sidebar nav button')].map((node) => node.textContent.trim())`);
  assert(platformNavigation.includes('기관 관리'), 'Platform admin workspace did not render institution management.');
  assert(!platformNavigation.includes('보관 정책'), 'Platform admin workspace exposed institution-only retention controls.');
  await screenshot(client, 'platform-admin-menu.png');
  console.log('connected_platform_ui=ok');
  console.log(`web_ui_screenshots=${screenshotDir}`);
} catch (error) {
  await screenshot(client, 'web-ui-failure.png').catch(() => undefined);
  console.error(`web_ui_failure_screenshot=${join(screenshotDir, 'web-ui-failure.png')}`);
  throw error;
} finally {
  client.close();
}
