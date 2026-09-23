const {
  contextBridge,
  ipcRenderer,
} = require('electron');

const fallbackRuntime = {
  distribution: 'steam',
  capabilities: {
    multiplayer: false,
    steamworks: false,
    multiplayerTransport: 'none',
  },
  steam: {
    available: false,
    reason: 'RUNTIME_UNAVAILABLE',
  },
};

let runtime = fallbackRuntime;
try {
  runtime = ipcRenderer.sendSync('holo:runtime:get') || fallbackRuntime;
} catch {}

contextBridge.exposeInMainWorld('holoRuntime', Object.freeze({
  distribution: runtime.distribution === 'steam' ? 'steam' : 'web',
  capabilities: Object.freeze({
    multiplayer: runtime.capabilities?.multiplayer === true,
    steamworks: runtime.capabilities?.steamworks === true,
    multiplayerTransport: runtime.capabilities?.multiplayerTransport === 'none' ? 'none' : 'web',
  }),
  steam: Object.freeze({
    available: runtime.steam?.available === true,
    appId: Number(runtime.steam?.appId) || 0,
    playerId: String(runtime.steam?.playerId || ''),
    playerName: String(runtime.steam?.playerName || ''),
    reason: String(runtime.steam?.reason || ''),
    transport: String(runtime.steam?.transport || ''),
  }),
}));

const EXIT_COPY = Object.freeze({
  zh: Object.freeze({
    label: '⏻ 退出游戏',
    title: '关闭游戏并返回桌面',
    exiting: '正在退出…',
    error: '无法退出，请使用 Alt+F4。',
  }),
  en: Object.freeze({
    label: '⏻ Exit Game',
    title: 'Close the game and return to the desktop',
    exiting: 'Exiting…',
    error: 'Unable to exit. Use Alt+F4.',
  }),
});

function installDesktopExitControls() {
  if (document.getElementById('holo-desktop-shell-style')) return;

  const controlFooter = document.querySelector('#control-panel .panel-footer');
  const lobbyModal = document.getElementById('lobby-modal');
  if (!controlFooter || !lobbyModal) return;

  const style = document.createElement('style');
  style.id = 'holo-desktop-shell-style';
  style.textContent = `
    .desktop-exit-button {
      flex: none;
      width: 100%;
      min-height: 40px;
      color: #ffd7e8;
      border-color: rgba(255, 71, 126, .42);
      background: linear-gradient(110deg, rgba(255, 51, 102, .1), rgba(255, 79, 216, .045));
      font-weight: 800;
      letter-spacing: .5px;
    }
    .desktop-exit-button:hover {
      color: #fff;
      border-color: rgba(255, 71, 126, .82);
      background: linear-gradient(110deg, rgba(255, 51, 102, .2), rgba(255, 79, 216, .1));
      box-shadow: 0 0 18px rgba(255, 51, 102, .16);
    }
    .desktop-exit-button:disabled { cursor: wait; opacity: .65; }
    .lobby-exit-button { margin-top: clamp(6px, 1.2dvh, 12px); }
  `;
  document.head.append(style);

  const createExitButton = (id, extraClass = '') => {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = `btn-secondary desktop-exit-button ${extraClass}`.trim();
    return button;
  };

  const panelButton = createExitButton('btn-exit-game');
  controlFooter.append(panelButton);

  const lobbyButton = createExitButton('btn-exit-game-lobby', 'lobby-exit-button');
  const lobbyStatus = document.getElementById('lobby-status');
  if (lobbyStatus) lobbyStatus.insertAdjacentElement('afterend', lobbyButton);
  else lobbyModal.append(lobbyButton);

  const buttons = [panelButton, lobbyButton];
  let exiting = false;
  let failed = false;
  const currentCopy = () => EXIT_COPY[
    document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  ];
  const render = () => {
    const copy = currentCopy();
    for (const button of buttons) {
      button.textContent = exiting ? copy.exiting : copy.label;
      button.title = failed ? copy.error : copy.title;
      button.setAttribute('aria-label', copy.label.replace(/^⏻\s*/, ''));
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (exiting) return;
      exiting = true;
      failed = false;
      for (const exitButton of buttons) exitButton.disabled = true;
      render();
      try {
        const accepted = await ipcRenderer.invoke('holo:desktop:quit');
        if (!accepted) throw new Error('Desktop shell rejected quit request');
      } catch {
        exiting = false;
        failed = true;
        for (const exitButton of buttons) exitButton.disabled = false;
        render();
      }
    });
  }

  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  render();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', installDesktopExitControls, { once: true });
} else {
  installDesktopExitControls();
}
