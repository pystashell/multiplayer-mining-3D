import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomClient } from './room-client.js';
import { initialLanguage, translate } from './i18n.js';

// -------------------------------------------------------------
// 1. 音效合成器模块 (Web Audio API)
// -------------------------------------------------------------
class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 恢复 AudioContext（因浏览器安全策略，需在用户点击后初始化）
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playDig() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playFlag() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(330, now + 0.05);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playExplosion() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 1.5; // 1.5秒爆炸声
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // 生成白噪音
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 1.2);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 1.4);
    
    // 增加低频震荡增强震撼度
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(90, now);
    subOsc.frequency.linearRampToValueAtTime(30, now + 0.8);
    subGain.gain.setValueAtTime(0.3, now);
    subGain.gain.linearRampToValueAtTime(0.01, now + 0.8);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    
    noiseNode.start(now);
    noiseNode.stop(now + 1.5);
    subOsc.start(now);
    subOsc.stop(now + 0.8);
  }

  playWin() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; // C大调和弦升音
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const delay = idx * 0.1;
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      
      gain.gain.setValueAtTime(0.1, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.005, now + delay + 0.4);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    });
  }

  playHover() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, now);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.02);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.02);
  }
}

const sfx = new SoundSynthesizer();

// -------------------------------------------------------------
// 2. 粒子效果引擎
// -------------------------------------------------------------
class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  createExplosion(position, color = 0xff3366, count = 60) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    const colors = [];
    
    const c = new THREE.Color(color);
    
    for (let i = 0; i < count; i++) {
      positions.push(position.x, position.y, position.z);
      
      // 随机三维方向及速度
      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.acos((Math.random() * 2) - 1);
      const speed = 0.5 + Math.random() * 2.5;
      
      const vx = Math.sin(angle2) * Math.cos(angle1) * speed;
      const vy = Math.sin(angle2) * Math.sin(angle1) * speed;
      const vz = Math.cos(angle2) * speed;
      
      velocities.push(vx, vy, vz);
      
      // 颜色微小扰动
      const r = Math.min(1, c.r + (Math.random() - 0.5) * 0.2);
      const g = Math.min(1, c.g + (Math.random() - 0.5) * 0.2);
      const b = Math.min(1, c.b + (Math.random() - 0.5) * 0.2);
      colors.push(r, g, b);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // 生成粒子发光材质纹理
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    
    const texture = new THREE.CanvasTexture(canvas);
    
    const material = new THREE.PointsMaterial({
      size: 0.25,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    
    this.particles.push({
      points,
      velocities,
      positions,
      life: 1.0, // 生命值 100%
      decay: 0.015 + Math.random() * 0.015
    });
  }

  update(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay;
      
      if (p.life <= 0) {
        this.scene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      
      const posAttr = p.points.geometry.attributes.position;
      const count = posAttr.count;
      
      for (let j = 0; j < count; j++) {
        let x = posAttr.getX(j);
        let y = posAttr.getY(j);
        let z = posAttr.getZ(j);
        
        // 应用速度
        x += p.velocities[j * 3] * deltaTime;
        y += p.velocities[j * 3 + 1] * deltaTime;
        z += p.velocities[j * 3 + 2] * deltaTime;
        
        // 重力微调
        p.velocities[j * 3 + 1] -= 2.0 * deltaTime;
        // 空气阻力
        p.velocities[j * 3] *= 0.96;
        p.velocities[j * 3 + 1] *= 0.96;
        p.velocities[j * 3 + 2] *= 0.96;
        
        posAttr.setXYZ(j, x, y, z);
      }
      
      posAttr.needsUpdate = true;
      p.points.material.opacity = p.life;
      p.points.material.size = 0.25 * p.life;
    }
  }
}

// -------------------------------------------------------------
// 3. 游戏核心逻辑与 UI 绑定
// -------------------------------------------------------------
class HoloSweeperGame {
  constructor() {
    this.language = initialLanguage();
    this.roomClient = new RoomClient({
      onSnapshot: (snapshot, initial) => this.applyRoomSnapshot(snapshot, initial),
      onWelcome: (message) => this.handleRoomWelcome(message),
      onError: (error) => this.handleRoomError(error),
      onStatus: (status) => this.setLobbyStatus(status),
    });
    this.roomSnapshot = null;
    this.currentPlayerId = null;
    this.seenActivityIds = new Set();
    this.seenChatIds = new Set();
    this.revivalTimer = null;
    // 渲染系统变量
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.particles = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // 游戏核心状态
    this.width = 3;
    this.height = 3;
    this.depth = 3;
    this.mineCount = 3;
    this.grid = []; // 3维数组存储方块
    
    this.isFirstClick = true;
    this.isGameOver = false;
    this.isGameWon = false;
    this.activeMode = 'dig'; // 'dig' 挖掘, 'flag' 插旗
    this.revealedCount = 0;
    this.flaggedCount = 0;
    
    // 计时器变量
    this.timer = 0;
    this.timerInterval = null;
    
    // 切片状态范围
    this.slice = {
      xMin: 0, xMax: 2,
      yMin: 0, yMax: 2,
      zMin: 0, zMax: 2
    };
    
    // 鼠标点击判定辅助
    this.mouseDownPos = { x: 0, y: 0 };
    this.mouseDownTime = 0;
    
    // 共享几何体和材质，优化内存占用
    this.geometries = {};
    this.materials = {};
    this.hoveredCell = null;
    
    // 初始化三维时钟
    this.clock = new THREE.Clock();
    
    // UI 绑定
    this.bindUI();
    this.applyLanguage(this.language, true);
    // 初始化 3D 渲染环境
    this.initThree();
    // 开启循环渲染
    this.animate();
    const invitedRoom = this.roomClient.roomFromUrl();
    if (invitedRoom) document.getElementById('input-room').value = invitedRoom;
    this.roomClient.resumeFromUrl();
  }

  // 绑定 HTML 交互元素
  bindUI() {
    // Lobby UI
    document.getElementById('btn-join-room').addEventListener('click', async () => {
      const nickname = document.getElementById('input-nickname').value.trim();
      const roomCode = document.getElementById('input-room').value.trim();
      if (!nickname || !roomCode) {
        this.handleRoomError({ code: !nickname ? 'INVALID_NAME' : 'ROOM_CODE' });
        return;
      }
      localStorage.setItem('holo-sweeper.nickname', nickname);
      try { await this.roomClient.join(roomCode, nickname); } catch (error) { this.handleRoomError(error); }
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
      const nickname = document.getElementById('input-nickname').value.trim();
      if (!nickname) {
        this.handleRoomError({ code: 'INVALID_NAME' });
        return;
      }
      localStorage.setItem('holo-sweeper.nickname', nickname);
      try { await this.roomClient.create(nickname); } catch (error) { this.handleRoomError(error); }
    });

    document.getElementById('input-nickname').value = localStorage.getItem('holo-sweeper.nickname') || this.t('nickname.default');
    document.getElementById('input-room').addEventListener('input', (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
    });
    document.getElementById('btn-copy-invite').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.roomClient.inviteUrl());
        this.appendChatMessage({ system: true, message: this.systemText(this.t('system.inviteCopied')) });
      } catch {
        prompt(this.t('system.copyPrompt'), this.roomClient.inviteUrl());
      }
    });

    const toggleLanguage = () => this.applyLanguage(this.language === 'zh' ? 'en' : 'zh');
    document.getElementById('btn-language-toggle').addEventListener('click', toggleLanguage);
    document.getElementById('btn-language-toggle-lobby').addEventListener('click', toggleLanguage);

    // Chat UI
    const chatInput = document.getElementById('input-chat');
    const sendChatBtn = document.getElementById('btn-send-chat');
    const sendChat = () => {
      const msg = chatInput.value.trim();
      if (msg) {
        this.roomClient.send({ op: 'chat', content: msg }).catch(error => this.handleRoomError(error));
        chatInput.value = '';
      }
    };
    sendChatBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    // 预设难度按钮
    document.getElementById('btn-preset-easy').addEventListener('click', (e) => this.selectPreset(e.currentTarget));
    document.getElementById('btn-preset-medium').addEventListener('click', (e) => this.selectPreset(e.currentTarget));
    document.getElementById('btn-preset-hard').addEventListener('click', (e) => this.selectPreset(e.currentTarget));

    // 自定义面板展开/折叠
    const customToggle = document.getElementById('custom-toggle');
    const customInputs = document.getElementById('custom-inputs');
    customToggle.addEventListener('click', () => {
      customToggle.classList.toggle('active');
      customInputs.classList.toggle('hidden');
    });

    // 常用控制
    document.getElementById('btn-restart').addEventListener('click', () => this.startNewGame());
    document.getElementById('btn-reset-camera').addEventListener('click', () => this.resetCamera());
    
    const soundBtn = document.getElementById('btn-sound-toggle');
    soundBtn.addEventListener('click', () => {
      sfx.enabled = !sfx.enabled;
      soundBtn.innerText = this.t(sfx.enabled ? 'action.soundOn' : 'action.soundOff');
    });

    // 操作模式按钮
    const btnDig = document.getElementById('btn-mode-dig');
    const btnFlag = document.getElementById('btn-mode-flag');
    btnDig.addEventListener('click', () => this.setMode('dig'));
    btnFlag.addEventListener('click', () => this.setMode('flag'));

    // 切片滑块绑定
    const axes = ['x', 'y', 'z'];
    axes.forEach(axis => {
      const minEl = document.getElementById(`slice-${axis}-min`);
      const maxEl = document.getElementById(`slice-${axis}-max`);
      
      minEl.addEventListener('input', () => this.handleSliceChange(axis, 'min'));
      maxEl.addEventListener('input', () => this.handleSliceChange(axis, 'max'));
    });
    
    document.getElementById('btn-reset-slices').addEventListener('click', () => this.resetSlices());

    // 模态弹窗重启按钮
    document.getElementById('btn-modal-restart').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.add('hidden');
      this.startNewGame();
    });

    // 模态弹窗关闭（查看战场）按钮
    document.getElementById('btn-modal-close').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.add('hidden');
    });

    // 恶搞：看广告复活弹窗事件
    document.getElementById('btn-watch-ad').addEventListener('click', () => this.roomClient.send({ op: 'watch_ad' }).catch(error => this.handleRoomError(error)));
    document.getElementById('btn-ad-die').addEventListener('click', () => this.roomClient.send({ op: 'end_game' }).catch(error => this.handleRoomError(error)));

    // 绑定键盘快捷键
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd') this.setMode('dig');
      if (e.key.toLowerCase() === 'f') this.setMode('flag');
      if (e.key === ' ') this.resetCamera(); // 空格重置摄像机
    });
  }

  // 难度预设选择
  selectPreset(element) {
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    
    this.width = parseInt(element.dataset.w);
    this.height = parseInt(element.dataset.h);
    this.depth = parseInt(element.dataset.d);
    this.mineCount = parseInt(element.dataset.m);
    
    // 同步到自定义输入框
    document.getElementById('input-w').value = this.width;
    document.getElementById('input-h').value = this.height;
    document.getElementById('input-d').value = this.depth;
    document.getElementById('input-m').value = this.mineCount;
    
    this.startNewGame();
  }

  // 设置操作模式 (挖矿/插旗)
  setMode(mode) {
    this.activeMode = mode;
    document.getElementById('btn-mode-dig').classList.toggle('active', mode === 'dig');
    document.getElementById('btn-mode-flag').classList.toggle('active', mode === 'flag');
  }

  t(key, params = {}) {
    return translate(this.language, key, params);
  }

  systemText(message) {
    return `${this.t('system.prefix')} ${message}`;
  }

  applyLanguage(language, initializing = false) {
    const previousLanguage = this.language;
    const previousDefault = translate(previousLanguage, 'nickname.default');
    this.language = language;
    try { localStorage.setItem('holo-sweeper.language', language); } catch {}
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = this.t('document.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', this.t('document.description'));
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = this.t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      element.placeholder = this.t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      element.title = this.t(element.dataset.i18nTitle);
    });

    const nicknameInput = document.getElementById('input-nickname');
    const savedNickname = localStorage.getItem('holo-sweeper.nickname');
    if (!savedNickname && (initializing || !nicknameInput.value || nicknameInput.value === previousDefault)) {
      nicknameInput.value = this.t('nickname.default');
    }
    document.getElementById('btn-sound-toggle').innerText = this.t(sfx.enabled ? 'action.soundOn' : 'action.soundOff');
    const code = this.roomSnapshot?.code || '-';
    document.getElementById('room-code-display').innerText = this.t('players.roomCode', { code });
    const me = this.roomSnapshot?.players?.find(player => player.id === this.currentPlayerId);
    document.getElementById('btn-restart').title = me && !me.isHost ? this.t('error.HOST_ONLY') : '';
    if (this.roomSnapshot) {
      this.renderRoomMessages(this.roomSnapshot);
      if (this.roomSnapshot.phase === 'revive') this.syncRevival(this.roomSnapshot);
      if (this.roomSnapshot.phase === 'lost') {
        document.getElementById('modal-title').innerText = this.t('result.lostTitle');
        document.getElementById('modal-message').innerText = this.t('result.lostMessage');
      } else if (this.roomSnapshot.phase === 'won') {
        document.getElementById('modal-title').innerText = this.t('result.wonTitle');
        document.getElementById('modal-message').innerText = this.t('result.wonMessage');
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Three.js 场景搭建
  // -------------------------------------------------------------
  
  
  setLobbyStatus(status) {
    const element = document.getElementById('lobby-status');
    if (element) element.innerText = status ? this.t(`status.${status}`) : '';
  }

  handleRoomWelcome(message) {
    this.currentPlayerId = message.identity.playerId;
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('room-code-display').innerText = this.t('players.roomCode', { code: message.snapshot.code });
    document.getElementById('btn-copy-invite').style.display = '';
  }

  handleRoomError(error) {
    const translated = error?.code ? this.t(`error.${error.code}`) : '';
    const message = translated && translated !== `error.${error.code}` ? translated : (error?.message || this.t('error.roomFallback'));
    const status = document.getElementById('lobby-status');
    if (status && !document.getElementById('lobby-overlay').classList.contains('hidden')) status.innerText = message;
    else this.appendChatMessage({ system: true, message: this.systemText(`⚠️ ${message}`) });
  }

  applyRoomSnapshot(snapshot, initial = false) {
    if (!snapshot) return;
    const previous = this.roomSnapshot;
    if (previous && snapshot.revision < previous.revision) return;
    const configChanged = !previous || ['width', 'height', 'depth', 'mineCount'].some(key => previous.config[key] !== snapshot.config[key]);
    const restarted = previous && snapshot.phase === 'ready' && previous.phase !== 'ready';
    if (configChanged || restarted || !this.grid.length) {
      this.applyConfig(snapshot.config);
      this.buildGridLocal();
      initial = true;
    }

    this.renderPlayers(snapshot.players);
    this.renderRoomMessages(snapshot);

    const desiredFlags = new Set((snapshot.flags || []).map(point => `${point.x}:${point.y}:${point.z}`));
    for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) for (let z = 0; z < this.depth; z++) {
      const shouldFlag = desiredFlags.has(`${x}:${y}:${z}`);
      if (this.grid[x][y][z].isFlagged !== shouldFlag) this.setFlagLocal(x, y, z, shouldFlag, !initial);
    }
    for (const cell of snapshot.revealed || []) this.revealServerCell(cell, !initial);

    this.isFirstClick = snapshot.phase === 'ready';
    this.isGameOver = snapshot.phase === 'lost';
    this.isGameWon = snapshot.phase === 'won';
    this.syncServerTimer(snapshot.startedAt, snapshot.serverTime, ['playing', 'revive'].includes(snapshot.phase));

    if (snapshot.phase === 'revive') {
      if (previous?.phase !== 'revive' && snapshot.pendingMine) this.triggerMineLocal(snapshot.pendingMine.x, snapshot.pendingMine.y, snapshot.pendingMine.z);
      this.syncRevival(snapshot);
    } else if (previous?.phase === 'revive' && previous.pendingMine) {
      this.restorePendingMineVisual(previous.pendingMine);
      document.getElementById('ad-modal-overlay').classList.add('hidden');
      clearInterval(this.revivalTimer);
    }

    if (snapshot.phase === 'lost' && previous?.phase !== 'lost') {
      if (previous?.pendingMine) this.restorePendingMineVisual(previous.pendingMine);
      for (const mine of snapshot.mines || []) this.grid[mine.x][mine.y][mine.z].isMine = true;
      const explosion = snapshot.pendingMine || previous?.pendingMine || snapshot.mines?.[0];
      if (explosion) this.triggerGameOver(explosion.x, explosion.y, explosion.z);
    }
    if (snapshot.phase === 'won' && previous?.phase !== 'won') this.checkVictory();

    const me = snapshot.players.find(player => player.id === this.currentPlayerId);
    const restart = document.getElementById('btn-restart');
    restart.disabled = Boolean(me && !me.isHost);
    restart.title = me && !me.isHost ? this.t('error.HOST_ONLY') : '';
    this.roomSnapshot = snapshot;
    this.updateStats();
  }

  renderPlayers(players) {
    const ul = document.getElementById('player-list-ul');
    if (!ul) return;
    ul.replaceChildren();
    for (const player of players || []) {
      const li = document.createElement('li');
      li.style.cssText = 'padding:5px 0;border-bottom:1px dashed rgba(255,255,255,0.1);';
      const dot = document.createElement('span');
      dot.style.color = player.connected ? '#00f0ff' : '#667788';
      dot.textContent = '● ';
      li.append(dot, document.createTextNode(`${player.name}${player.isHost ? ' 👑' : ''}`));
      ul.appendChild(li);
    }
  }

  renderRoomMessages(snapshot) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.replaceChildren();
    const welcome = document.createElement('div');
    welcome.style.cssText = 'color:#888;font-style:italic;text-align:center;';
    welcome.textContent = this.t('chat.welcome');
    container.appendChild(welcome);
    const entries = [
      ...(snapshot.activity || []).map(activity => ({ kind: 'activity', at: activity.at, value: activity })),
      ...(snapshot.chat || []).map(chat => ({ kind: 'chat', at: chat.at, value: chat })),
    ].sort((left, right) => left.at - right.at);
    for (const entry of entries) {
      if (entry.kind === 'chat') {
        this.appendChatMessage({ system: false, playerName: entry.value.playerName, message: entry.value.message });
      } else {
        const activity = entry.value;
        const localized = activity.key ? this.t(`activity.${activity.key}`, activity.params || {}) : activity.message;
        this.appendChatMessage({ system: true, message: this.systemText(localized || '') });
      }
    }
  }

  appendChatMessage(data) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const div = document.createElement('div');
    if (data.system) {
      div.style.color = '#ffaa00';
      div.style.fontStyle = 'italic';
      div.innerText = data.message;
    } else {
      const name = document.createElement('strong');
      name.style.color = '#00f0ff';
      name.textContent = `${data.playerName}:`;
      div.append(name, document.createTextNode(` ${data.message}`));
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  revealServerCell(data, animate = true) {
    const cell = this.grid[data.x]?.[data.y]?.[data.z];
    if (!cell || cell.isRevealed) return;
    if (cell.isFlagged) this.setFlagLocal(data.x, data.y, data.z, false, false);
    cell.neighborMines = data.count;
    cell.isRevealed = true;
    this.revealedCount++;
    if (animate) {
      sfx.playDig();
      this.animateCellReveal(cell);
    } else {
      cell.mesh.visible = false;
      cell.outline.visible = false;
    }
    if (cell.neighborMines > 0 && !cell.spriteInstance) this.createNumberSprite(cell);
  }

  setFlagLocal(x, y, z, flagged, playSound = true) {
    const cell = this.grid[x]?.[y]?.[z];
    if (!cell || cell.isRevealed || cell.isFlagged === flagged) return;
    if (playSound) sfx.playFlag();
    cell.isFlagged = flagged;
    this.flaggedCount += flagged ? 1 : -1;
    if (flagged) {
      const flag = this.geometries.flag.clone();
      flag.scale.set(0.9, 0.9, 0.9);
      cell.group.add(flag);
      cell.flagInstance = flag;
      cell.mesh.material = this.materials.cellFlagged;
    } else {
      if (cell.flagInstance) {
        cell.group.remove(cell.flagInstance);
        cell.flagInstance = null;
      }
      cell.mesh.material = this.materials.cellUnrevealed;
    }
  }

  syncServerTimer(startedAt, serverTime, running) {
    clearInterval(this.timerInterval);
    if (!startedAt) {
      this.timer = 0;
      document.getElementById('stat-time').innerText = '00:00';
      return;
    }
    const offset = Number(serverTime || Date.now()) - Date.now();
    const update = () => {
      this.timer = Math.max(0, Math.floor((Date.now() + offset - startedAt) / 1000));
      document.getElementById('stat-time').innerText = this.formatTime(this.timer);
    };
    update();
    if (running) this.timerInterval = setInterval(update, 1000);
  }

  syncRevival(snapshot) {
    const button = document.getElementById('btn-watch-ad');
    const endButton = document.getElementById('btn-ad-die');
    const message = document.getElementById('ad-modal-message');
    document.getElementById('ad-modal-overlay').classList.remove('hidden');
    clearInterval(this.revivalTimer);
    if (!snapshot.reviveEndsAt) {
      button.disabled = false;
      button.innerText = this.t('revive.watch');
      endButton.disabled = false;
      endButton.style.display = '';
      message.textContent = this.t('revive.prompt');
      return;
    }
    button.disabled = true;
    endButton.style.display = 'none';
    message.textContent = this.t('revive.playing');
    const offset = snapshot.serverTime - Date.now();
    const update = () => {
      const seconds = Math.max(0, Math.ceil((snapshot.reviveEndsAt - Date.now() - offset) / 1000));
      button.innerText = seconds > 0 ? this.t('revive.countdown', { seconds }) : this.t('revive.finishing');
    };
    update();
    this.revivalTimer = setInterval(update, 250);
  }

  restorePendingMineVisual(point) {
    const cell = this.grid[point.x]?.[point.y]?.[point.z];
    if (!cell) return;
    if (cell.mineInstance) {
      cell.group.remove(cell.mineInstance);
      cell.mineInstance = null;
    }
    cell.isMine = false;
    cell.isRevealed = false;
    cell.mesh.visible = true;
    cell.outline.visible = true;
    cell.mesh.scale.set(1, 1, 1);
    cell.outline.scale.set(1, 1, 1);
    cell.mesh.material = this.materials.cellUnrevealed;
    cell.outline.material = this.materials.wireframe;
    this.pendingGameOver = null;
  }

  applyConfig(config) {
    this.width = config.width;
    this.height = config.height;
    this.depth = config.depth;
    this.mineCount = config.mineCount;
    document.getElementById('input-w').value = this.width;
    document.getElementById('input-h').value = this.height;
    document.getElementById('input-d').value = this.depth;
    document.getElementById('input-m').value = this.mineCount;
  }

  
  handleNetworkAction(action) {
    // Generate accident log
    const name = action.playerName || '未知玩家';
    switch (action.type) {
      case 'dig':
        this.appendChatMessage({ system: true, message: `[系统] ${name} 挖开了一块方块` });
        this.digLocal(action.data.x, action.data.y, action.data.z);
        break;
      case 'flag':
        this.appendChatMessage({ system: true, message: `[系统] ${name} 切换了方块的标记` });
        this.toggleFlagLocal(action.data.x, action.data.y, action.data.z);
        break;
      case 'trigger_mine':
        this.appendChatMessage({ system: true, message: `[系统] 🚨 ${name} 踩到了反物质地雷！全体警报！` });
        this.triggerMineLocal(action.data.x, action.data.y, action.data.z);
        break;
      case 'watch_ad':
        this.appendChatMessage({ system: true, message: `[系统] 📺 ${name} 选择了观看广告，全员进入量子回溯状态...` });
        this.startAdRevivalLocal();
        break;
      case 'end_game':
        this.appendChatMessage({ system: true, message: `[系统] 💥 ${name} 放弃了治疗，矩阵崩溃！` });
        if (this.pendingGameOver) {
          this.triggerGameOver(this.pendingGameOver.x, this.pendingGameOver.y, this.pendingGameOver.z);
          this.pendingGameOver = null;
        }
        break;
      case 'first_click':
        this.appendChatMessage({ system: true, message: `[系统] ${name} 踏出了第一步，地雷已生成` });
        this.isFirstClick = false;
        this.populateMinesNetwork(action.data.mines);
        this.startTimer();
        break;
    }
  }

  replayHistory(history) {
    // Disable animations and sounds during replay to make it fast and silent
    const oldPlayDig = sfx.playDig;
    const oldPlayExplosion = sfx.playExplosion;
    const oldPlayFlag = sfx.playFlag;
    sfx.playDig = () => {};
    sfx.playExplosion = () => {};
    sfx.playFlag = () => {};
    
    // Temporarily override animateCellReveal to snap instantly
    const oldAnimate = this.animateCellReveal;
    this.animateCellReveal = (cell) => {
      cell.mesh.visible = false;
      cell.outline.visible = false;
    };
    
    history.forEach(action => this.handleNetworkAction(action));
    
    // Restore
    sfx.playDig = oldPlayDig;
    sfx.playExplosion = oldPlayExplosion;
    sfx.playFlag = oldPlayFlag;
    this.animateCellReveal = oldAnimate;
  }

  populateMinesNetwork(mines) {
    mines.forEach(m => {
       this.grid[m.x][m.y][m.z].isMine = true;
    });
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          if (this.grid[x][y][z].isMine) continue;
          
          let count = 0;
          const neighbors = this.getNeighbors(x, y, z);
          neighbors.forEach(n => {
            if (this.grid[n.x][n.y][n.z].isMine) {
              count++;
            }
          });
          this.grid[x][y][z].neighborMines = count;
        }
      }
    }
  }

  initThree() {
    const container = document.getElementById('canvas-container');
    
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070f, 0.02);

    // 创建摄像机
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // 摄像机控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI; // 允许俯仰 360 度
    this.controls.minDistance = 2;
    this.controls.maxDistance = 40;

    // 粒子系统
    this.particles = new ParticleSystem(this.scene);

    // 光源设置
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 0.6);
    dirLight1.position.set(10, 20, 15);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffaa00, 0.3);
    dirLight2.position.set(-15, -10, -10);
    this.scene.add(dirLight2);

    // 初始化重用几何体
    this.geometries.cell = new THREE.BoxGeometry(0.78, 0.78, 0.78);
    this.geometries.edges = new THREE.EdgesGeometry(this.geometries.cell);
    
    // 雷体几何体 (二十面体 + 突刺)
    const mineGroup = new THREE.Group();
    const coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.18, 1),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.8 })
    );
    mineGroup.add(coreMesh);
    // 添加尖刺
    const spikeGeo = new THREE.ConeGeometry(0.03, 0.16, 4);
    spikeGeo.translate(0, 0.15, 0);
    const spikeMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    const directions = [
      [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1],
      [1,1,1], [-1,1,1], [1,-1,1], [1,1,-1], [-1,-1,1], [-1,1,-1], [1,-1,-1], [-1,-1,-1]
    ];
    directions.forEach(dir => {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      const v = new THREE.Vector3(...dir).normalize();
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      mineGroup.add(spike);
    });
    this.geometries.mine = mineGroup;

    // 旗帜几何体
    const flagGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), new THREE.MeshBasicMaterial({ color: 0xcccccc }));
    pole.position.y = -0.05;
    flagGroup.add(pole);
    const bannerGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 0.18, 0,
      0.18, 0.12, 0,
      0, 0.06, 0
    ]);
    bannerGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const banner = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide }));
    flagGroup.add(banner);
    this.geometries.flag = flagGroup;

    // 初始化重用材质
    this.materials.cellUnrevealed = new THREE.MeshPhysicalMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.15,
      roughness: 0.2,
      transmission: 0.6,
      thickness: 0.5,
      clearcoat: 0.8
    });
    
    this.materials.cellHovered = new THREE.MeshPhysicalMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      transmission: 0.4,
      thickness: 0.8,
      clearcoat: 1.0
    });

    this.materials.cellFlagged = new THREE.MeshStandardMaterial({
      color: 0xff4422, // 鲜明的橘红色，实体
      roughness: 0.4,
      metalness: 0.5,
      transparent: false // 不要透明
    });

    this.materials.cellFlaggedHovered = new THREE.MeshStandardMaterial({
      color: 0xff8855, // 亮橘红色，带点发光感
      roughness: 0.2,
      metalness: 0.7,
      emissive: 0x331100,
      transparent: false
    });

    this.materials.wireframe = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.35
    });

    this.materials.wireframeHovered = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.95
    });

    // 监听事件
    window.addEventListener('resize', () => this.onWindowResize());
    
    // 精细化鼠标点击判定，防止误触 (区分拖拽旋转与点击)
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.mouseDownPos.x = e.clientX;
      this.mouseDownPos.y = e.clientY;
      this.mouseDownTime = performance.now();

      // 右键按住数字时，立即高亮周围
      if (e.button === 2 && !this.isGameOver && !this.isGameWon) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const targets = [];
        for (let x = 0; x < this.width; x++) {
          for (let y = 0; y < this.height; y++) {
            for (let z = 0; z < this.depth; z++) {
              const cell = this.grid[x][y][z];
              if (cell.group.visible) {
                if (!cell.isRevealed) {
                  targets.push(cell.mesh); // 也把未翻开的方块加入，防止右键穿透实心方块点到背后的数字
                } else if (cell.spriteInstance) {
                  targets.push(cell.spriteInstance);
                }
              }
            }
          }
        }
        
        const intersects = this.raycaster.intersectObjects(targets);
        if (intersects.length > 0) {
          const clickedObject = intersects[0].object;
          const { x, y, z, type } = clickedObject.userData;
          
          // 只有当前方没有任何遮挡，且确切点到了数字上时，才高亮
          if (type === 'number') {
            // 在高亮前，立刻清除当前的 hover 状态，避免 pointermove 里的恢复逻辑强行熄灭下方的方块
            if (this.hoveredCell) {
              if (!this.hoveredCell.isRevealed) {
                this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
                this.hoveredCell.outline.material = this.materials.wireframe;
              }
              this.hoveredCell = null;
            }

            this.highlightNeighborsOn(x, y, z);
            this.activeHighlightCenter = { x, y, z };
          }
        }
      }
    });
    dom.addEventListener('pointerup', (e) => {
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeElapsed = performance.now() - this.mouseDownTime;
      
      // 当鼠标移动距离小于 5px，且持续时间小于 250ms 时判定为点击事件
      if (distance < 5 && timeElapsed < 250) {
        this.handleCanvasClick(e);
      }
    });

    // 监听全局松开事件或被打断事件，熄灭高亮
    const clearHighlight = (e) => {
      // 只有松开的是右键，或者遇到系统取消事件时才熄灭
      if (e.type === 'pointerup' && e.button !== 2) return;
      
      if (this.activeHighlightCenter) {
        this.highlightNeighborsOff(this.activeHighlightCenter.x, this.activeHighlightCenter.y, this.activeHighlightCenter.z);
        this.activeHighlightCenter = null;
      }
    };
    window.addEventListener('pointerup', clearHighlight);
    window.addEventListener('pointercancel', clearHighlight);

    // 鼠标移动监听，用于方块 Hover 效果
    dom.addEventListener('pointermove', (e) => this.handlePointerMove(e));
  }

  // -------------------------------------------------------------
  // 5. 游戏引擎：扫雷核心算法
  // -------------------------------------------------------------
  startNewGame() {
    // 读取自定义设置，如果有的话
    const isCustomActive = document.getElementById('custom-toggle').classList.contains('active');
    if (isCustomActive) {
      const customW = parseInt(document.getElementById('input-w').value) || 5;
      const customH = parseInt(document.getElementById('input-h').value) || 5;
      const customD = parseInt(document.getElementById('input-d').value) || 5;
      const customM = parseInt(document.getElementById('input-m').value) || 15;
      
      this.width = Math.min(15, Math.max(2, customW));
      this.height = Math.min(15, Math.max(2, customH));
      this.depth = Math.min(15, Math.max(2, customD));
      
      const maxMines = Math.floor(this.width * this.height * this.depth * 0.6); // 最大地雷数量限制为 60%
      this.mineCount = Math.min(maxMines, Math.max(1, customM));
    } else {
      const activeBtn = document.querySelector('.btn-preset.active');
      if (activeBtn) {
        this.width = parseInt(activeBtn.dataset.w);
        this.height = parseInt(activeBtn.dataset.h);
        this.depth = parseInt(activeBtn.dataset.d);
        this.mineCount = parseInt(activeBtn.dataset.m);
      }
    }
    
    // 房主向 Durable Object 请求初始化，服务端验证参数并重置权威棋盘
    this.roomClient.send({ op: 'restart', config: { width: this.width, height: this.height, depth: this.depth, mineCount: this.mineCount } })
      .catch(error => this.handleRoomError(error));
  }

  buildGridLocal() {

    // 重置状态
    this.isFirstClick = true;
    this.isGameOver = false;
    this.isGameWon = false;
    this.revealedCount = 0;
    this.flaggedCount = 0;
    this.hoveredCell = null;
    
    // 重置计时器
    this.timer = 0;
    document.getElementById('stat-time').innerText = "00:00";
    clearInterval(this.timerInterval);
    this.timerInterval = null;

    // 清理之前的 3D 场景物体
    if (this.grid.length > 0) {
      for (let x = 0; x < this.grid.length; x++) {
        for (let y = 0; y < this.grid[x].length; y++) {
          for (let z = 0; z < this.grid[x][y].length; z++) {
            const cell = this.grid[x][y][z];
            this.scene.remove(cell.group);
            // 递归释放 Sprite 等资源
            cell.group.traverse(obj => {
              if (obj.geometry && obj.geometry !== this.geometries.cell && obj.geometry !== this.geometries.edges) {
                obj.geometry.dispose();
              }
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach(m => m.dispose());
                } else {
                  obj.material.dispose();
                }
              }
            });
          }
        }
      }
    }

    // 初始化滑块范围
    this.slice.xMin = 0; this.slice.xMax = this.width - 1;
    this.slice.yMin = 0; this.slice.yMax = this.height - 1;
    this.slice.zMin = 0; this.slice.zMax = this.depth - 1;
    this.syncSliceSlidersUI();

    // 构建全新 3D 网格模型
    this.grid = [];
    
    // 计算网格中心，便于三维居中显示
    const offsetX = (this.width - 1) / 2;
    const offsetY = (this.height - 1) / 2;
    const offsetZ = (this.depth - 1) / 2;

    for (let x = 0; x < this.width; x++) {
      this.grid[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.grid[x][y] = [];
        for (let z = 0; z < this.depth; z++) {
          
          // 创建方块容器组
          const group = new THREE.Group();
          group.position.set(x - offsetX, y - offsetY, z - offsetZ);
          
          // 创建未发掘状态的主模型
          const blockMesh = new THREE.Mesh(this.geometries.cell, this.materials.cellUnrevealed);
          // 为 raycast 做标记
          blockMesh.userData = { x, y, z, type: 'cell' };
          group.add(blockMesh);

          // 添加线框轮廓
          const lineSegments = new THREE.LineSegments(this.geometries.edges, this.materials.wireframe);
          group.add(lineSegments);

          this.scene.add(group);

          this.grid[x][y][z] = {
            x, y, z,
            isMine: false,
            neighborMines: 0,
            isRevealed: false,
            isFlagged: false,
            group: group,
            mesh: blockMesh,
            outline: lineSegments,
            flagInstance: null,
            mineInstance: null,
            spriteInstance: null
          };
        }
      }
    }

    this.resetCamera();
    this.updateStats();
    
    // 隐藏遮罩层
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // 生成雷区 (在第一次点击之后，确保首击及周围 26 格必安全)
  generateMines(firstX, firstY, firstZ) {
    const totalCells = this.width * this.height * this.depth;
    let placedMines = 0;

    // 为了防卡死，限制放置地雷的最大尝试次数
    let attempts = 0;
    const maxAttempts = 10000;

    while (placedMines < this.mineCount && attempts < maxAttempts) {
      attempts++;
      const rx = Math.floor(Math.random() * this.width);
      const ry = Math.floor(Math.random() * this.height);
      const rz = Math.floor(Math.random() * this.depth);

      // 首击安全：如果随机落点处于首击格子及其 26 邻域之内，则跳过
      const isTooClose = Math.abs(rx - firstX) <= 1 && Math.abs(ry - firstY) <= 1 && Math.abs(rz - firstZ) <= 1;
      
      // 如果网格太小导致容纳不下雷，则退化为仅要求首击格子自身安全
      const safeThreshold = (totalCells <= 27) ? (rx === firstX && ry === firstY && rz === firstZ) : isTooClose;

      if (!safeThreshold && !this.grid[rx][ry][rz].isMine) {
        this.grid[rx][ry][rz].isMine = true;
        placedMines++;
      }
    }

    // 重新计算每个格子的相邻雷数
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          if (this.grid[x][y][z].isMine) continue;
          
          let count = 0;
          const neighbors = this.getNeighbors(x, y, z);
          neighbors.forEach(n => {
            if (this.grid[n.x][n.y][n.z].isMine) {
              count++;
            }
          });
          this.grid[x][y][z].neighborMines = count;
        }
      }
    }
  }

  // 获取 26 个相邻格子的坐标
  getNeighbors(cx, cy, cz) {
    const list = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          const nz = cz + dz;
          
          // 边界检查
          if (nx >= 0 && nx < this.width && 
              ny >= 0 && ny < this.height && 
              nz >= 0 && nz < this.depth) {
            list.push({ x: nx, y: ny, z: nz });
          }
        }
      }
    }
    return list;
  }

  // -------------------------------------------------------------
  // 6. 交互管理：光线投射 (Raycast) 与事件处理
  // -------------------------------------------------------------
  
  // 监听 Canvas 上的点击
  handleCanvasClick(event) {
    if (this.isGameOver || this.isGameWon) return;

    // 计算鼠标在 3D Viewport 中的标准化坐标 (-1 到 1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 只拾取当前切片下可见的方块或数字
    const targets = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          if (cell.group.visible) {
            if (!cell.isRevealed) {
              targets.push(cell.mesh);
            } else if (cell.spriteInstance) {
              targets.push(cell.spriteInstance);
            }
          }
        }
      }
    }

    const intersects = this.raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
      let clickedObject = null;
      
      // 遍历所有相交物体
      for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        // 如果是左键点击，且碰到了数字，就直接穿透（无视）这个数字，继续寻找后面的方块
        if (obj.userData.type === 'number' && event.button !== 2) {
          continue;
        }
        clickedObject = obj;
        break;
      }
      
      // 如果穿透之后后面没有任何有效方块，就直接返回
      if (!clickedObject) return;

      const { x, y, z, type } = clickedObject.userData;
      
      // 如果有效点击的还是数字（例如右键），不做操作，因为右键高亮已经在 pointerdown 里处理了
      if (type === 'number') return;

      // 判断点击操作类型：右键点击、或按住 Ctrl/Cmd 的点击均默认为“插旗”
      if (event.button === 2 || this.activeMode === 'flag') {
        this.toggleFlag(x, y, z);
      } else {
        this.dig(x, y, z);
      }
    }
  }

  // 按下右键时高亮显示周围的邻居格子
  highlightNeighborsOn(cx, cy, cz) {
    const neighbors = this.getNeighbors(cx, cy, cz);
    sfx.playHover(); // 播放一声提示音
    
    neighbors.forEach(n => {
      const cell = this.grid[n.x][n.y][n.z];
      if (!cell.isRevealed) {
        cell.mesh.material = cell.isFlagged ? this.materials.cellFlaggedHovered : this.materials.cellHovered;
        cell.outline.material = this.materials.wireframeHovered;
      }
    });
  }

  // 松开右键时恢复周围邻居格子的原状
  highlightNeighborsOff(cx, cy, cz) {
    const neighbors = this.getNeighbors(cx, cy, cz);
    neighbors.forEach(n => {
      const cell = this.grid[n.x][n.y][n.z];
      if (!cell.isRevealed) {
        // 如果正好被鼠标悬浮着，不强行恢复为普通材质
        if (this.hoveredCell === cell) {
          cell.mesh.material = cell.isFlagged ? this.materials.cellFlaggedHovered : this.materials.cellHovered;
          cell.outline.material = this.materials.wireframeHovered;
        } else {
          cell.mesh.material = cell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
          cell.outline.material = this.materials.wireframe;
        }
      }
    });
  }

  // 监听鼠标悬浮移动，提供科技感的 Hover 提示
  handlePointerMove(event) {
    if (this.isGameOver || this.isGameWon) return;

    // 当按住右键高亮数字周围时，暂停普通的悬浮高亮效果
    if (this.activeHighlightCenter) {
      if (this.hoveredCell) {
        if (!this.hoveredCell.isRevealed) {
          this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
          this.hoveredCell.outline.material = this.materials.wireframe;
        }
        this.hoveredCell = null;
      }
      return;
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          if (cell.group.visible && !cell.isRevealed) {
            targets.push(cell.mesh);
          }
        }
      }
    }

    const intersects = this.raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
      const hoveredMesh = intersects[0].object;
      const { x, y, z } = hoveredMesh.userData;
      const cell = this.grid[x][y][z];

      if (this.hoveredCell !== cell) {
        // 恢复上一个 Hover 方块的材质
        if (this.hoveredCell && !this.hoveredCell.isRevealed) {
          this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
          this.hoveredCell.outline.material = this.materials.wireframe;
        }
        // 赋予当前 Hover 方块亮丽的霓虹光泽材质（区分是否插旗）
        cell.mesh.material = cell.isFlagged ? this.materials.cellFlaggedHovered : this.materials.cellHovered;
        cell.outline.material = this.materials.wireframeHovered;
        
        // 播放极轻微的微鸣音效
        sfx.playHover();
        
        this.hoveredCell = cell;
      }
    } else {
      if (this.hoveredCell) {
        if (!this.hoveredCell.isRevealed) {
          this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
          this.hoveredCell.outline.material = this.materials.wireframe;
        }
        this.hoveredCell = null;
      }
    }
  }

  // -------------------------------------------------------------
  // 7. 挖掘 (Dig) 与 连锁展开 (Cascade) 算法
  // -------------------------------------------------------------
  
  dig(x, y, z) {
    const cell = this.grid[x][y][z];
    if (cell.isRevealed || cell.isFlagged) return;
    this.roomClient.send({ op: 'dig', x, y, z }).catch(error => this.handleRoomError(error));
  }

  triggerMineLocal(x, y, z) {
    const cell = this.grid[x][y][z];
    cell.isRevealed = true;
    clearInterval(this.timerInterval);
    
    sfx.playExplosion();
    this.animateCellReveal(cell);
    const mineMesh = this.geometries.mine.clone();
    cell.group.add(mineMesh);
    cell.mineInstance = mineMesh;
    
    const worldPos = new THREE.Vector3();
    cell.group.getWorldPosition(worldPos);
    this.particles.createExplosion(worldPos, 0xff3366, 60);

    this.pendingGameOver = { x, y, z };
    const adModal = document.getElementById('ad-modal-overlay');
    document.getElementById('ad-modal-message').textContent = this.t('revive.prompt');
    
    const btnAd = document.getElementById('btn-watch-ad');
    btnAd.innerText = this.t('revive.watch');
    btnAd.disabled = false;
    const btnDie = document.getElementById('btn-ad-die');
    btnDie.disabled = false;
    btnDie.style.display = ''; // Reset display
    
    adModal.classList.remove('hidden');
  }

  digLocal(x, y, z) {
    const cell = this.grid[x][y][z];
    
    // 如果已经插旗标记或者已翻开，则不能挖掘
    if (cell.isRevealed || cell.isFlagged) return;



    // 播放点击音效
    sfx.playDig();



    // 递归自动扫雷队列
    const queue = [{ x, y, z }];
    
    while (queue.length > 0) {
      const current = queue.shift();
      const cCell = this.grid[current.x][current.y][current.z];

      if (cCell.isRevealed || cCell.isFlagged) continue;

      cCell.isRevealed = true;
      this.revealedCount++;
      
      // 动画淡出未发掘方块
      this.animateCellReveal(cCell);

      // 如果是空白方块(周围0颗雷)，深度优先自动连锁翻开周围 26 格
      if (cCell.neighborMines === 0) {
        const neighbors = this.getNeighbors(current.x, current.y, current.z);
        neighbors.forEach(n => {
          const nCell = this.grid[n.x][n.y][n.z];
          if (!nCell.isRevealed && !nCell.isFlagged && !nCell.isMine) {
            queue.push({ x: n.x, y: n.y, z: n.z });
          }
        });
      } else {
        // 创建漂浮的 3D 数字
        this.createNumberSprite(cCell);
      }
    }

    this.updateStats();
    this.checkVictory();
  }

  // 翻开时的 3D 微缩退场动画
  animateCellReveal(cell) {
    const mesh = cell.mesh;
    const outline = cell.outline;
    
    let scale = 1.0;
    const shrink = () => {
      scale -= 0.12;
      if (scale <= 0.05) {
        mesh.visible = false;
        outline.visible = false;
      } else {
        mesh.scale.set(scale, scale, scale);
        outline.scale.set(scale, scale, scale);
        requestAnimationFrame(shrink);
      }
    };
    shrink();
  }

  // 创建酷炫的 3D 浮空数字贴图
  createNumberSprite(cell) {
    const num = cell.neighborMines;
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // 背景微弱发光网格
    ctx.clearRect(0, 0, 128, 128);

    // 数字颜色映射表
    const colorMap = {
      1: '#00f0ff', // 浅蓝
      2: '#39ff14', // 绿
      3: '#ff3366', // 鲜红
      4: '#b026ff', // 紫
      5: '#ffee00', // 黄
      6: '#ff8800', // 橙
      7: '#ff00ff', // 洋红
      8: '#ffffff'  // 白
    };
    const textColor = colorMap[num] || '#ff0055';

    // 绘制数字，加入模糊阴影发光效果
    ctx.shadowColor = textColor;
    ctx.shadowBlur = 15;
    ctx.fillStyle = textColor;
    ctx.font = '900 78px "Orbitron", "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthWrite: false
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    // 数字初始缩放比网格小一点
    sprite.scale.set(0.72, 0.72, 0.72);
    // 添加 userData 用于右键拾取
    sprite.userData = { x: cell.x, y: cell.y, z: cell.z, type: 'number' };
    
    cell.group.add(sprite);
    cell.spriteInstance = sprite;

    // 伴随微小的漂浮浮动动画，增强灵动感
    let t = 0;
    const floatAnim = () => {
      if (!cell.isRevealed || this.isFirstClick) return;
      t += 0.04;
      sprite.position.y = Math.sin(t) * 0.04;
      requestAnimationFrame(floatAnim);
    };
    floatAnim();
  }

  // -------------------------------------------------------------
  // 恶搞机制：看广告复活
  // -------------------------------------------------------------
  startAdRevivalLocal() {
    const btnAd = document.getElementById('btn-watch-ad');
    const btnDie = document.getElementById('btn-ad-die');
    const msg = document.getElementById('ad-modal-message');
    
    btnAd.disabled = true;
    btnDie.style.display = 'none'; // Hide the end game button so it doesn't confuse people
    
    msg.innerHTML = "广告播放中<br>(广告位招租中......)";
    
    let countdown = 10;
    btnAd.innerText = `广告播放中 (${countdown})...`;
    
    const interval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        btnAd.innerText = `广告播放中 (${countdown})...`;
      } else {
        clearInterval(interval);
        // 复活成功：量子回溯，恢复刚才踩中的方块
        if (this.pendingGameOver) {
          const { x, y, z } = this.pendingGameOver;
          const cell = this.grid[x][y][z];
          
          // 移除刚才展示的地雷模型
          if (cell.mineInstance) {
            cell.group.remove(cell.mineInstance);
            cell.mineInstance.traverse(obj => {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
              }
            });
            cell.mineInstance = null;
          }
          
          // 恢复方块外观与状态
          cell.isRevealed = false;
          cell.mesh.scale.set(1, 1, 1);
          cell.outline.scale.set(1, 1, 1);
          cell.mesh.visible = true;
          cell.outline.visible = true;
          cell.mesh.material = this.materials.cellUnrevealed;
          cell.outline.material = this.materials.wireframe;
          
          this.pendingGameOver = null;
        }

        document.getElementById('ad-modal-overlay').classList.add('hidden');
        // 恢复计时器
        this.resumeTimer();
      }
    }, 1000);
  }

  // -------------------------------------------------------------
  // 8. 标记旗帜 (Flag)
  // -------------------------------------------------------------
  
  toggleFlag(x, y, z) {
    const cell = this.grid[x][y][z];
    if (cell.isRevealed) return;
    this.roomClient.send({ op: 'flag', x, y, z }).catch(error => this.handleRoomError(error));
  }

  toggleFlagLocal(x, y, z) {
    const cell = this.grid[x][y][z];
    
    // 如果已经翻开，无法插旗
    if (cell.isRevealed) return;

    sfx.playFlag();

    if (cell.isFlagged) {
      // 取消标记
      cell.isFlagged = false;
      this.flaggedCount--;
      
      // 移除旗帜模型
      if (cell.flagInstance) {
        cell.group.remove(cell.flagInstance);
        cell.flagInstance.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        cell.flagInstance = null;
      }
      
      // 还原方块玻璃透明度
      cell.mesh.material = this.materials.cellUnrevealed;
    } else {
      // 插上旗帜
      cell.isFlagged = true;
      this.flaggedCount++;

      const flag = this.geometries.flag.clone();
      flag.scale.set(0.9, 0.9, 0.9);
      cell.group.add(flag);
      cell.flagInstance = flag;

      // 让插了旗的方块呈实体状，方便识别
      cell.mesh.material = this.materials.cellFlagged;
    }

    this.updateStats();
  }

  // -------------------------------------------------------------
  // 9. 游戏结束 (GameOver) 与 胜利 (Win)
  // -------------------------------------------------------------
  triggerGameOver(explosionX, explosionY, explosionZ) {
    this.isGameOver = true;
    clearInterval(this.timerInterval);
    
    // 隐藏广告弹窗（如果有）
    document.getElementById('ad-modal-overlay').classList.add('hidden');
    
    // 播放地雷大爆炸合成声
    sfx.playExplosion();

    // 在踩雷点绽放巨大粒子火花
    const expCell = this.grid[explosionX][explosionY][explosionZ];
    const worldPos = new THREE.Vector3();
    expCell.group.getWorldPosition(worldPos);
    this.particles.createExplosion(worldPos, 0xff3366, 120);

    // 翻开整个三维立方体中的全部地雷，用于警示玩家
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          
          if (cell.isMine) {
            // 如果是地雷且玩家没插旗，或是玩家标记错了
            // 翻开隐藏的地雷模型
            this.animateCellReveal(cell);
            
            const mineMesh = this.geometries.mine.clone();
            cell.group.add(mineMesh);
            cell.mineInstance = mineMesh;
            
            // 踩雷方块添加强烈的霓虹红色点光源
            if (x === explosionX && y === explosionY && z === explosionZ) {
              const bombLight = new THREE.PointLight(0xff3366, 2.5, 3);
              cell.group.add(bombLight);
            }
          }
        }
      }
    }

    // 延迟 1.2 秒弹出结算面板，让玩家欣赏 3D 爆炸粒子
    setTimeout(() => {
      const modal = document.getElementById('modal-overlay');
      const title = document.getElementById('modal-title');
      const msg = document.getElementById('modal-message');
      const icon = document.getElementById('modal-icon');
      
      icon.innerText = "💀";
      title.innerText = this.t('result.lostTitle');
      title.className = "modal-title text-glow-red";
      msg.innerText = this.t('result.lostMessage');
      
      document.getElementById('modal-stat-time').innerText = this.formatTime(this.timer);
      const totalCells = this.width * this.height * this.depth;
      const progress = Math.round((this.revealedCount / (totalCells - this.mineCount)) * 100);
      document.getElementById('modal-stat-progress').innerText = `${progress}%`;
      
      modal.classList.remove('hidden');
    }, 1200);
  }

  checkVictory() {
    const totalCells = this.width * this.height * this.depth;
    const safeCells = totalCells - this.mineCount;
    
    if (this.revealedCount === safeCells) {
      this.isGameWon = true;
      clearInterval(this.timerInterval);
      
      // 播放清脆的获胜和弦声
      sfx.playWin();

      // 在网格中心爆破多重彩色礼花粒子
      const centerPos = new THREE.Vector3(0, 0, 0);
      this.particles.createExplosion(centerPos, 0x39ff14, 100);
      setTimeout(() => this.particles.createExplosion(centerPos, 0x00f0ff, 100), 200);
      setTimeout(() => this.particles.createExplosion(centerPos, 0xffee00, 100), 400);

      // 延迟展现胜利结算弹窗
      setTimeout(() => {
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const msg = document.getElementById('modal-message');
        const icon = document.getElementById('modal-icon');
        
        icon.innerText = "🏆";
        title.innerText = this.t('result.wonTitle');
        title.className = "modal-title text-glow-green";
        msg.innerText = this.t('result.wonMessage');
        
        document.getElementById('modal-stat-time').innerText = this.formatTime(this.timer);
        document.getElementById('modal-stat-progress').innerText = "100%";
        
        modal.classList.remove('hidden');
      }, 1500);
    }
  }

  // -------------------------------------------------------------
  // 10. 切片过滤 (Slice Filter) 渲染机制
  // -------------------------------------------------------------
  handleSliceChange(axis, type) {
    const minEl = document.getElementById(`slice-${axis}-min`);
    const maxEl = document.getElementById(`slice-${axis}-max`);
    
    let minVal = parseInt(minEl.value);
    let maxVal = parseInt(maxEl.value);
    
    // 双端滑块范围碰撞拦截：确保 min <= max
    if (type === 'min' && minVal > maxVal) {
      maxEl.value = minVal;
      maxVal = minVal;
    } else if (type === 'max' && maxVal < minVal) {
      minEl.value = maxVal;
      minVal = maxVal;
    }
    
    this.slice[`${axis}Min`] = minVal;
    this.slice[`${axis}Max`] = maxVal;
    
    // 同步文字提示标签
    const valEl = document.getElementById(`val-slice-${axis}`);
    if (valEl) {
      valEl.innerText = `${minVal} - ${maxVal}`;
    }
    
    this.updateGridVisibility();
  }

  // 根据当前切片范围，剔除/隐藏超出边界的 3D 方块
  updateGridVisibility() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          
          // 在切片范围内的格子可见，反之从 3D 渲染流程中隐藏
          const inBounds = 
            x >= this.slice.xMin && x <= this.slice.xMax &&
            y >= this.slice.yMin && y <= this.slice.yMax &&
            z >= this.slice.zMin && z <= this.slice.zMax;
            
          cell.group.visible = inBounds;
        }
      }
    }
  }

  // 同步切片滑块的最大范围
  syncSliceSlidersUI() {
    const axes = ['x', 'y', 'z'];
    const dims = { x: this.width, y: this.height, z: this.depth };
    
    axes.forEach(axis => {
      const minEl = document.getElementById(`slice-${axis}-min`);
      const maxEl = document.getElementById(`slice-${axis}-max`);
      const valEl = document.getElementById(`val-slice-${axis}`);
      
      const maxIdx = dims[axis] - 1;
      
      minEl.max = maxIdx;
      minEl.value = 0;
      maxEl.max = maxIdx;
      maxEl.value = maxIdx;
      
      if (valEl) {
        valEl.innerText = `0 - ${maxIdx}`;
      }
    });
  }

  // 重置切片，恢复完整 3D 立方体外观
  resetSlices() {
    this.slice.xMin = 0; this.slice.xMax = this.width - 1;
    this.slice.yMin = 0; this.slice.yMax = this.height - 1;
    this.slice.zMin = 0; this.slice.zMax = this.depth - 1;
    
    this.syncSliceSlidersUI();
    this.updateGridVisibility();
  }

  // -------------------------------------------------------------
  // 11. 统计面板数据同步
  // -------------------------------------------------------------
  updateStats() {
    // 标记数与总雷数
    document.getElementById('stat-mines').innerText = `${this.flaggedCount} / ${this.mineCount}`;
    
    // 计算空间净化率进度条
    const totalCells = this.width * this.height * this.depth;
    const safeCells = totalCells - this.mineCount;
    const progress = safeCells > 0 ? (this.revealedCount / safeCells) : 0;
    const progressPercent = Math.min(100, Math.round(progress * 100));
    
    document.getElementById('stat-progress-percent').innerText = `${progressPercent}%`;
    document.getElementById('stat-progress').style.width = `${progressPercent}%`;
  }

  startTimer() {
    this.timer = 0;
    document.getElementById('stat-time').innerText = this.formatTime(this.timer);
    this.resumeTimer();
  }

  resumeTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timer++;
      document.getElementById('stat-time').innerText = this.formatTime(this.timer);
    }, 1000);
  }

  formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // -------------------------------------------------------------
  // 12. 摄像机控制
  // -------------------------------------------------------------
  resetCamera() {
    // 计算合适观赏相机的对角线距离
    const maxDim = Math.max(this.width, this.height, this.depth);
    const distance = maxDim * 2.2;
    
    // 设置斜向下看 45 度的初始透视视角
    this.camera.position.set(distance, distance * 0.9, distance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // 屏幕缩放自适应
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // -------------------------------------------------------------
  // 13. 渲染主循环 (Frame Render Loop)
  // -------------------------------------------------------------
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(0.1, this.clock.getDelta()); // 限制 delta 避免后台切换突然跳帧
    
    // 更新粒子效果
    if (this.particles) {
      this.particles.update(delta);
    }

    // 如果未开始点击，且网格已完全初始化，让立方体有微微自转，表现其能量漂浮感
    if (this.grid && this.grid.length > 0 && this.grid[0] && this.grid[0][0]) {
      if (this.isFirstClick && !this.isGameOver) {
        // 让场景中所有格子的 group 微弱绕Y轴偏移
        const time = performance.now() * 0.0003;
        for (let x = 0; x < this.width; x++) {
          if (!this.grid[x]) continue;
          for (let y = 0; y < this.height; y++) {
            if (!this.grid[x][y]) continue;
            for (let z = 0; z < this.depth; z++) {
              const cell = this.grid[x][y][z];
              if (!cell) continue;
              // 让各个水平层产生一点相位差，扭曲转动，视觉效果非常炫酷
              const phase = (y - (this.height - 1) / 2) * 0.15;
              cell.group.rotation.y = Math.sin(time + phase) * 0.12;
            }
          }
        }
      } else {
        // 点击开始后，归零自转角度，保持稳定便于玩家点击操作
        for (let x = 0; x < this.width; x++) {
          if (!this.grid[x]) continue;
          for (let y = 0; y < this.height; y++) {
            if (!this.grid[x][y]) continue;
            for (let z = 0; z < this.depth; z++) {
              const cell = this.grid[x][y][z];
              if (!cell) continue;
              cell.group.rotation.y = 0;
            }
          }
        }
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// 启动游戏实例
window.addEventListener('DOMContentLoaded', () => {
  new HoloSweeperGame();
});
