// A small Chrome DevTools Protocol driver for browser regression tests. It
// launches the locally installed Chrome or Edge in headless mode, renders WebGL
// through SwiftShader so pixels do not depend on the machine's GPU, and drives
// pages with trusted input events. It needs no npm packages: Node's global
// WebSocket speaks to the DevTools endpoint directly.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BROWSER_ENV = 'HOLO_SWEEPER_BROWSER';

function browserCandidates(env, platform) {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const directories = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  return [
    ...directories.flatMap((directory) => names.map((name) => path.join(directory, name))),
    '/opt/google/chrome/chrome',
  ];
}

export function findBrowserExecutable({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  const configured = env[BROWSER_ENV];
  if (configured) {
    if (!exists(configured)) throw new Error(`${BROWSER_ENV} points to a missing file: ${configured}`);
    return configured;
  }
  const found = browserCandidates(env, platform).find((candidate) => exists(candidate));
  if (!found) {
    throw new Error(
      `Browser regression tests need Chrome, Chromium, or Edge. Install one or set ${BROWSER_ENV} to its executable.`,
    );
  }
  return found;
}

export function browserArguments({ userDataDir, platform = process.platform, headless = true }) {
  return [
    headless ? '--headless=new' : null,
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--force-device-scale-factor=1',
    // Software WebGL keeps rendering identical on developer machines and CI.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // GitHub's Ubuntu runners restrict the user namespaces Chrome's sandbox needs.
    platform === 'linux' ? '--no-sandbox' : null,
    'about:blank',
  ].filter(Boolean);
}

function waitForDevToolsUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Browser did not expose DevTools within ${timeoutMs} ms.\n${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      cleanup();
      resolve(match[1]);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Browser exited with code ${code} before DevTools started.\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}

export class CdpConnection {
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
    });
    return new CdpConnection(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    socket.addEventListener('message', (event) => this.receive(JSON.parse(String(event.data))));
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const { reject, method } of this.pending.values()) {
        reject(new Error(`DevTools connection closed during ${method}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = undefined) {
    if (this.closed) return Promise.reject(new Error(`DevTools connection is closed (${method})`));
    const id = this.nextId;
    this.nextId += 1;
    const message = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify(message));
    });
  }

  receive(message) {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of [...this.listeners]) listener(message);
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    if (!this.closed) this.socket.close();
  }
}

const MOUSE_BUTTON_BITS = Object.freeze({ left: 1, right: 2, middle: 4 });
const KEY_CODES = Object.freeze({
  Tab: 9, Enter: 13, Escape: 27, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
});

function describeRemoteException(details) {
  const exception = details.exception;
  return exception?.description || exception?.value || details.text || 'Page evaluation failed';
}

export class BrowserPage {
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.responses = [];
    this.mouseButtons = 0;
    this.touch = false;
    this.eventWaiters = new Set();
    this.removeListener = connection.on((message) => {
      if (message.sessionId !== sessionId) return;
      this.record(message);
      for (const waiter of [...this.eventWaiters]) waiter(message);
    });
  }

  send(method, params = {}) {
    return this.connection.send(method, params, this.sessionId);
  }

  record({ method, params }) {
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      this.consoleErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') {
      this.consoleWarnings.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      this.pageErrors.push(describeRemoteException(params.exceptionDetails));
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      this.consoleErrors.push(`${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`);
    } else if (method === 'Network.responseReceived') {
      const { url, status, mimeType, headers } = params.response;
      this.responses.push({ url, status, mimeType, headers, type: params.type });
      if (status >= 400) this.failedRequests.push(`${status} ${url}`);
    } else if (method === 'Network.loadingFailed' && !params.canceled) {
      this.failedRequests.push(`${params.errorText} (${params.type})`);
    }
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.eventWaiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const waiter = (message) => {
        if (message.method !== method || !predicate(message.params)) return;
        clearTimeout(timer);
        this.eventWaiters.delete(waiter);
        resolve(message.params);
      };
      this.eventWaiters.add(waiter);
    });
  }

  async initialize({ width, height, mobile = false, touch = false, initScripts = [] }) {
    await Promise.all([
      this.send('Page.enable'),
      this.send('Runtime.enable'),
      this.send('Network.enable'),
      this.send('Log.enable'),
    ]);
    await this.setViewport({ width, height, mobile, touch });
    for (const source of initScripts) {
      await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    }
  }

  async setViewport({ width, height, mobile = false, touch = false }) {
    this.touch = touch;
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  }

  async goto(url, { timeoutMs = 60_000 } = {}) {
    const loaded = this.waitForEvent('Page.loadEventFired', () => true, timeoutMs);
    const result = await this.send('Page.navigate', { url });
    if (result.errorText) throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
    await loaded;
  }

  // Runs `fn` in the page and returns its JSON-serializable result. Arguments
  // are serialized too, so pass plain data only.
  async evaluate(fn, ...args) {
    const expression = `(${fn})(...${JSON.stringify(args)})`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(describeRemoteException(result.exceptionDetails));
    return result.result.value;
  }

  async waitFor(fn, { args = [], timeoutMs = 15_000, intervalMs = 50, message = 'page condition' } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    for (;;) {
      try {
        const value = await this.evaluate(fn, ...args);
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ''}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // Clicks the first element matching `selector` that a user could click:
  // rendered, enabled, and not covered by another element. Touch pages get a
  // finger tap, because the game switches its input mode to whatever the last
  // pointer was.
  async click(selector, { timeoutMs = 15_000 } = {}) {
    const point = await this.waitFor((css) => {
      for (const element of document.querySelectorAll(css)) {
        if (element.disabled || !element.getClientRects().length) continue;
        element.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!rect.width || !rect.height || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === element || element.contains(hit))) return { x, y };
      }
      return null;
    }, { args: [selector], timeoutMs, message: `clickable ${selector}` });
    if (this.touch) await this.tap(point.x, point.y);
    else await this.mouseClick(point.x, point.y);
  }

  async mouseMove(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: this.mouseButtons });
  }

  async mouseDown(x, y, button = 'left', clickCount = 1) {
    this.mouseButtons |= MOUSE_BUTTON_BITS[button];
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button, buttons: this.mouseButtons, clickCount,
    });
  }

  async mouseUp(x, y, button = 'left', clickCount = 1) {
    this.mouseButtons &= ~MOUSE_BUTTON_BITS[button];
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button, buttons: this.mouseButtons, clickCount,
    });
  }

  // Press and release go out together. Sent one after the other, the release
  // waits for the press to be acknowledged, which under software rendering can
  // take longer than the game's 250 ms click window.
  async mouseClick(x, y, { button = 'left' } = {}) {
    await this.mouseMove(x, y);
    await Promise.all([this.mouseDown(x, y, button), this.mouseUp(x, y, button)]);
  }

  async mouseDrag(from, to, { button = 'left', steps = 12 } = {}) {
    await this.mouseMove(from.x, from.y);
    await this.mouseDown(from.x, from.y, button);
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      await this.mouseMove(x, y);
    }
    await this.mouseUp(to.x, to.y, button);
  }

  async mouseWheel(x, y, deltaY) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }

  // Presses one named key (for example ArrowLeft or Escape) on the focused element.
  async press(key) {
    const code = KEY_CODES[key];
    if (!code) throw new Error(`Unsupported key: ${key}`);
    const event = {
      key: key === 'Space' ? ' ' : key,
      code: key,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code,
    };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
    if (key === 'Space' || key === 'Enter') {
      await this.send('Input.dispatchKeyEvent', { type: 'char', ...event, text: key === 'Space' ? ' ' : '\r' });
    }
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  }

  // Sent together for the same reason as mouseClick: a slow acknowledgement
  // must not turn a tap into the game's 420 ms long press.
  async tap(x, y) {
    const touchPoints = [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await Promise.all([
      this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints }),
      this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    ]);
  }

  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }

  async startCoverage() {
    await this.send('Profiler.enable');
    await this.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  }

  async takeCoverage() {
    const { result } = await this.send('Profiler.takePreciseCoverage');
    await this.send('Profiler.stopPreciseCoverage');
    return result;
  }

  async close() {
    this.removeListener();
    this.eventWaiters.clear();
    try {
      await this.connection.send('Target.closeTarget', { targetId: this.targetId });
    } catch {}
  }
}

export class Browser {
  constructor(child, connection, userDataDir) {
    this.child = child;
    this.connection = connection;
    this.userDataDir = userDataDir;
    this.version = null;
  }

  // Each context has its own storage, which keeps two pages from sharing one
  // player identity in multiplayer tests.
  async newPage({ width = 1280, height = 720, mobile = false, touch = false, initScripts = [], isolated = false } = {}) {
    let browserContextId;
    if (isolated) {
      ({ browserContextId } = await this.connection.send('Target.createBrowserContext', { disposeOnDetach: true }));
    }
    const { targetId } = await this.connection.send('Target.createTarget', {
      url: 'about:blank',
      ...(browserContextId ? { browserContextId } : {}),
    });
    const { sessionId } = await this.connection.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new BrowserPage(this.connection, sessionId, targetId);
    await page.initialize({ width, height, mobile, touch, initScripts });
    return page;
  }

  async close() {
    try {
      await Promise.race([
        this.connection.send('Browser.close'),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    } catch {}
    this.connection.close();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      await Promise.race([
        new Promise((resolve) => this.child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
    await removeProfile(this.userDataDir);
  }
}

// Windows releases the profile directory a moment after the browser exits, and
// later under load. Failing to delete a temporary profile must not fail a test.
async function removeProfile(directory) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  process.emitWarning(`Could not remove the temporary browser profile ${directory}`);
}

export async function launchBrowser({ executablePath = findBrowserExecutable(), headless = true, timeoutMs = 30_000 } = {}) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'holo-sweeper-browser-'));
  const child = spawn(executablePath, browserArguments({ userDataDir, headless }), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    const url = await waitForDevToolsUrl(child, timeoutMs);
    const connection = await CdpConnection.open(url);
    const browser = new Browser(child, connection, userDataDir);
    browser.version = await connection.send('Browser.getVersion');
    return browser;
  } catch (error) {
    child.kill('SIGKILL');
    await removeProfile(userDataDir);
    throw error;
  }
}
