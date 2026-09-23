import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
} from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

import {
  desktopUrlForSoloSave,
  isTrustedDesktopUrl,
  normalizeSoloSaveId,
  soloSaveIdFromDesktopUrl,
} from './runtime-state.mjs';

const APP_SCHEME = 'holo';
const APP_HOST = 'game';
const PRODUCT_NAME = 'Zero Domain Protocol - Sector Purge';
const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const preloadPath = resolve(dirname(fileURLToPath(import.meta.url)), 'preload.cjs');
const smokeTest = process.argv.includes('--steam-smoke-test');
const smokeResultPath = process.env.HOLO_STEAM_SMOKE_RESULT
  ? resolve(process.env.HOLO_STEAM_SMOKE_RESULT)
  : '';
const smokeUserData = smokeTest
  ? join(tmpdir(), `zero-domain-steam-smoke-${process.pid}`)
  : '';
const smokeLog = (message) => {
  if (smokeTest) process.stderr.write(`STEAM_SMOKE_TRACE=${message}\n`);
};

let mainWindow = null;
let smokeFinished = false;
const desktopRuntime = Object.freeze({
  distribution: 'steam',
  capabilities: Object.freeze({
    multiplayer: false,
    steamworks: false,
    multiplayerTransport: 'none',
  }),
  steam: Object.freeze({
    available: false,
    appId: 0,
    playerId: '',
    playerName: '',
    reason: 'STEAM_SINGLE_PLAYER_RELEASE',
    transport: '',
  }),
});

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    codeCache: true,
  },
}]);

app.setName(PRODUCT_NAME);
app.enableSandbox();
if (smokeUserData) {
  mkdirSync(smokeUserData, { recursive: true });
  app.setPath('userData', smokeUserData);
}

function registerRuntimeIpc() {
  ipcMain.on('holo:runtime:get', (event) => {
    event.returnValue = desktopRuntime;
  });
  ipcMain.handle('holo:desktop:quit', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow !== mainWindow) return false;
    setImmediate(() => sourceWindow.close());
    return true;
  });
}

registerRuntimeIpc();
smokeLog('runtime-registered');

function response(status, message) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function servePackagedFile(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return response(405, 'Method Not Allowed');

  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.protocol !== `${APP_SCHEME}:` || requestUrl.hostname !== APP_HOST) {
      return response(404, 'Not Found');
    }

    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const requestedPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    let filePath = resolve(publicRoot, requestedPath);
    const relativePath = relative(publicRoot, filePath);
    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
      return response(403, 'Forbidden');
    }

    if (!existsSync(filePath)) return response(404, 'Not Found');
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return response(404, 'Not Found');

    return net.fetch(pathToFileURL(filePath).toString(), {
      bypassCustomProtocolHandlers: true,
    });
  } catch {
    return response(400, 'Bad Request');
  }
}

function desktopStatePath() {
  return join(app.getPath('userData'), 'desktop-session.json');
}

function readResumeSaveId() {
  try {
    const record = JSON.parse(readFileSync(desktopStatePath(), 'utf8'));
    return normalizeSoloSaveId(record?.soloSaveId);
  } catch {
    return '';
  }
}

function persistResumeSaveId(url) {
  const statePath = desktopStatePath();
  const saveId = soloSaveIdFromDesktopUrl(url);
  if (!saveId) {
    rmSync(statePath, { force: true });
    return;
  }

  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ version: 1, soloSaveId: saveId }, null, 2)}\n`, 'utf8');
}

function writeSmokeResult(payload) {
  if (!smokeResultPath) return;
  mkdirSync(dirname(smokeResultPath), { recursive: true });
  writeFileSync(smokeResultPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function finishSmoke(pass, details) {
  if (!smokeTest || smokeFinished) return;
  smokeFinished = true;
  const payload = {
    pass,
    product: PRODUCT_NAME,
    details,
  };
  writeSmokeResult(payload);
  process.stdout.write(`STEAM_SMOKE_TEST=${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(details)}\n`);
  setImmediate(() => app.exit(pass ? 0 : 1));
}

async function runRendererSmokeTest(window) {
  smokeLog('renderer-smoke-start');
  try {
    const details = await window.webContents.executeJavaScript(`
      (async () => {
        let networkCalls = 0;
        window.fetch = () => {
          networkCalls += 1;
          return Promise.reject(new Error('Steam single-player smoke test blocked fetch'));
        };
        window.WebSocket = class ForbiddenSteamSmokeSocket {
          constructor() {
            networkCalls += 1;
            throw new Error('Steam single-player smoke test blocked WebSocket');
          }
        };

        const nickname = document.getElementById('input-nickname');
        if (nickname) nickname.value = 'Steam Smoke';
        document.getElementById('btn-start-task')?.click();

        const deadline = Date.now() + 7000;
        while (
          Date.now() < deadline
          && !document.body.classList.contains('in-room')
          && !document.getElementById('debug-error-banner')
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const multiplayerButton = document.getElementById('btn-lobby-multiplayer');
        const localSaveId = new URL(location.href).searchParams.get('solo') || '';
        return {
          protocol: location.protocol,
          title: document.title,
          runtime: window.holoRuntime,
          steamBridgeExposed: typeof window.holoSteamMultiplayer !== 'undefined',
          desktopExitButtonsVisible: ['btn-exit-game', 'btn-exit-game-lobby'].every((id) => {
            const button = document.getElementById(id);
            return Boolean(button) && !button.hidden;
          }),
          multiplayerHidden: Boolean(multiplayerButton?.hidden),
          multiplayerDisabled: Boolean(multiplayerButton?.disabled),
          subtitleKey: document.querySelector('.lobby-subtitle')?.dataset.i18n || '',
          canvasReady: Boolean(document.querySelector('#canvas-container canvas')),
          enteredSoloGame: document.body.classList.contains('in-room'),
          localSaveInUrl: Boolean(localSaveId),
          localSaveId,
          networkCalls,
          runtimeError: document.getElementById('debug-error-banner')?.innerText || '',
        };
      })()
    `, true);

    details.desktopResumePersisted = Boolean(details.localSaveId)
      && readResumeSaveId() === details.localSaveId;
    const pass = details.protocol === 'holo:'
      && details.runtime?.distribution === 'steam'
      && details.runtime?.capabilities?.multiplayer === false
      && details.runtime?.capabilities?.multiplayerTransport === 'none'
      && details.runtime?.steam?.reason === 'STEAM_SINGLE_PLAYER_RELEASE'
      && details.steamBridgeExposed === false
      && details.desktopExitButtonsVisible
      && details.multiplayerHidden
      && details.multiplayerDisabled
      && details.subtitleKey === 'lobby.subtitle.singlePlayer'
      && details.canvasReady
      && details.enteredSoloGame
      && details.localSaveInUrl
      && details.desktopResumePersisted
      && details.networkCalls === 0
      && !details.runtimeError;
    finishSmoke(pass, details);
  } catch (error) {
    finishSmoke(false, { error: error?.stack || String(error) });
  }
}

function createWindow() {
  smokeLog('create-window');
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    fullscreen: !smokeTest,
    show: !smokeTest,
    autoHideMenuBar: true,
    backgroundColor: '#020711',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: Boolean(process.defaultApp),
      spellcheck: false,
    },
  });
  smokeLog('browser-window-created');

  window.setMenuBarVisibility(false);
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      let allowed = false;
      try {
        const protocolName = new URL(details.url).protocol;
        allowed = ['holo:', 'file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:'].includes(protocolName);
      } catch {}
      callback({ cancel: !allowed });
    },
  );
  smokeLog('security-handlers-ready');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedDesktopUrl(url)) event.preventDefault();
  });
  window.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame && isTrustedDesktopUrl(url)) persistResumeSaveId(url);
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (!process.defaultApp && input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault();
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    smokeLog(`render-process-gone:${details.reason}`);
    finishSmoke(false, { error: `Renderer exited: ${details.reason}` });
  });
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    smokeLog(`did-fail-load:${code}:${description}`);
    if (isMainFrame) finishSmoke(false, { error: `${code}: ${description}`, url });
  });
  window.on('close', () => smokeLog('window-close'));
  window.on('closed', () => {
    smokeLog('window-closed');
    if (mainWindow === window) mainWindow = null;
    if (smokeTest && !smokeFinished) finishSmoke(false, { error: 'Window closed before smoke completion.' });
  });

  if (smokeTest) {
    const timeout = setTimeout(() => finishSmoke(false, { error: 'Desktop smoke test timed out.' }), 15000);
    window.webContents.once('did-finish-load', () => {
      smokeLog('did-finish-load');
      clearTimeout(timeout);
      void runRendererSmokeTest(window);
    });
  }

  const startUrl = desktopUrlForSoloSave(readResumeSaveId());
  smokeLog(`load-url:${startUrl}`);
  void window.loadURL(startUrl);
  smokeLog('load-url-dispatched');
  return window;
}

app.whenReady().then(() => {
  smokeLog('app-ready');
  protocol.handle(APP_SCHEME, servePackagedFile);
  mainWindow = createWindow();
}).catch((error) => finishSmoke(false, { error: error?.stack || String(error) }));

app.on('activate', () => {
  if (!mainWindow && !smokeTest) mainWindow = createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.once('quit', () => {
  if (smokeUserData) rmSync(smokeUserData, { recursive: true, force: true });
});

if (smokeTest) {
  process.on('uncaughtException', (error) => {
    finishSmoke(false, { error: error?.stack || String(error) });
  });
  process.on('unhandledRejection', (error) => {
    finishSmoke(false, { error: error?.stack || String(error) });
  });
}
