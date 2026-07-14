import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomClient } from './room-client.js';
import { initialLanguage, randomNickname, translate } from './i18n.js';
import { solveMinesweeperHint } from './minesweeper-solver.js';
import { findChordOpportunity } from './tutorial-triggers.js';
import { chooseFloatingAxisPlacement, chooseGuidedCalloutPlacement } from './guided-callout.js';

const TASK_MISSIONS = Object.freeze({
  easy: Object.freeze({ width: 3, height: 3, depth: 3, mineCount: 3 }),
  medium: Object.freeze({ width: 5, height: 5, depth: 5, mineCount: 15 }),
  hard: Object.freeze({ width: 7, height: 7, depth: 7, mineCount: 45 }),
});

const STORY_ART = Object.freeze({
  easy: 'assets/silver-wolf-quantum-pathfinder.png',
  medium: 'assets/silver-wolf-neighbor-hack.png',
  hard: 'assets/silver-wolf-final-protocol.png',
  squad: 'assets/silver-wolf-squad-link.png',
});

const DIALOGUE_ART = Object.freeze({
  easy: Object.freeze({
    main: STORY_ART.easy,
    neighbors: 'assets/silver-wolf-easy-neighbors.webp',
    scan: 'assets/silver-wolf-easy-scan.webp',
    finish: 'assets/silver-wolf-easy-finish.webp',
  }),
  medium: Object.freeze({
    main: STORY_ART.medium,
    tip: 'assets/silver-wolf-medium-tip.webp',
    scan: 'assets/silver-wolf-medium-scan.webp',
    inspect: 'assets/silver-wolf-medium-inspect.webp',
    ready: 'assets/silver-wolf-medium-ready.webp',
  }),
  hard: Object.freeze({
    main: STORY_ART.hard,
  }),
});

const BEGINNER_TUTORIAL_ROUTE = Object.freeze([
  Object.freeze({ x: 2, y: 0, z: 0, action: 'dig', kind: 'first', reason: 'protectedStart', evidence: Object.freeze([]) }),
  Object.freeze({ x: 0, y: 0, z: 0, action: 'flag', kind: 'mine', reason: 'compareMine', evidence: Object.freeze([{ x: 1, y: 2, z: 0 }, { x: 1, y: 1, z: 0 }]) }),
  Object.freeze({ x: 0, y: 1, z: 0, action: 'dig', kind: 'safe', reason: 'directSafe', evidence: Object.freeze([{ x: 1, y: 0, z: 0 }]) }),
  Object.freeze({ x: 0, y: 2, z: 0, action: 'dig', kind: 'safe', reason: 'compareSafe', evidence: Object.freeze([{ x: 1, y: 1, z: 2 }, { x: 1, y: 1, z: 1 }]) }),
  Object.freeze({ x: 0, y: 2, z: 2, action: 'dig', kind: 'safe', reason: 'compareSafe', evidence: Object.freeze([{ x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 1 }]) }),
  Object.freeze({ x: 0, y: 2, z: 1, action: 'flag', kind: 'mine', reason: 'directMine', evidence: Object.freeze([{ x: 1, y: 1, z: 0 }]) }),
  Object.freeze({ x: 2, y: 2, z: 2, action: 'flag', kind: 'mine', reason: 'compareMine', evidence: Object.freeze([{ x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }]) }),
  Object.freeze({ x: 1, y: 2, z: 2, action: 'dig', kind: 'safe', reason: 'directSafe', evidence: Object.freeze([{ x: 1, y: 1, z: 1 }]) }),
]);

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
    this.generatedNickname = randomNickname(this.language);
    this.gameMode = 'solo';
    this.hasObservedMatrix = false;
    this.hasInspectedNeighbors = false;
    this.taskMission = 'easy';
    this.pendingTaskMission = null;
    this.taskExperienceStarted = false;
    this.dialogueState = null;
    this.waitingTutorialAction = null;
    this.guidedTutorialActive = false;
    this.guidedTutorialTarget = null;
    this.guidedTargetMarker = null;
    this.guidedEvidenceMarkers = [];
    this.guidedFlagModeExplained = false;
    this.mediumChordTipShown = false;
    this.guidedCorrectionTimer = null;
    this.solverHint = null;
    this.solverHintMarker = null;
    this.solverHintEvidenceMarkers = [];
    this.reasoningCoordinateAxes = null;
    this.lastReasoningAxesLayoutAt = 0;
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
    this.modalAction = 'restart';
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
    this.isInteractionLocked = false;
    this.activeMode = 'dig'; // 'dig' 挖掘, 'flag' 插旗
    this.revealedCount = 0;
    this.flaggedCount = 0;
    
    // 计时器变量
    this.timer = 0;
    this.timerInterval = null;

    // 本地视图切片只影响可见层，不改变服务端雷阵
    this.slice = { xMin: 0, xMax: 2, yMin: 0, yMax: 2, zMin: 0, zMax: 2 };
    this.hasUsedSlices = false;
    this.hasResetSlices = false;
    
    // 鼠标点击判定辅助
    this.mouseDownPos = { x: 0, y: 0 };
    this.mouseDownTime = 0;
    this.mouseChordTriggered = false;
    this.lastMobileNumberTap = null;
    this.mobileDoubleTapMs = 450;
    this.touchHoldTimer = null;
    this.touchHoldTriggered = false;
    this.touchInspectionActive = false;
    this.activeTouchPointers = new Set();
    this.touchGestureHadMultiplePointers = false;
    
    // 共享几何体和材质，优化内存占用
    this.geometries = {};
    this.materials = {};
    this.hoveredCell = null;
    
    // 初始化三维时钟
    this.clock = new THREE.Clock();
    
    // UI 绑定
    this.bindUI();
    this.applyStoryArt();
    this.applyLanguage(this.language, true);
    // 初始化 3D 渲染环境
    this.initThree();
    // 开启循环渲染
    this.animate();
    const invitedRoom = this.roomClient.roomFromUrl();
    if (invitedRoom) {
      document.getElementById('input-room').value = invitedRoom;
      this.selectLobbyMode('squad');
    }
    this.roomClient.resumeFromUrl();
  }

  // 绑定 HTML 交互元素
  bindUI() {
    // Lobby UI
    const readNickname = () => document.getElementById('input-nickname').value.trim();
    const persistNickname = (nickname) => localStorage.setItem('holo-sweeper.nickname', nickname);
    document.getElementById('btn-lobby-task').addEventListener('click', () => this.selectLobbyMode('solo'));
    document.getElementById('btn-lobby-multiplayer').addEventListener('click', () => this.selectLobbyMode('squad'));
    document.querySelectorAll('.task-mission-option').forEach((button) => {
      button.addEventListener('click', () => this.selectTaskMission(button.dataset.mission));
    });
    document.getElementById('btn-random-nickname').addEventListener('click', () => this.rollNickname());
    document.getElementById('btn-tutorial-next').addEventListener('click', () => this.advanceSilverWolfDialogue());
    document.getElementById('btn-skip-tutorial').addEventListener('click', () => this.skipTutorial());
    const guidedPointer = document.getElementById('guided-cell-pointer');
    guidedPointer.addEventListener('click', () => this.activateGuidedTarget('primary'));
    guidedPointer.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.activateGuidedTarget('secondary');
    });
    document.getElementById('btn-request-solver-hint').addEventListener('click', () => this.requestSolverHint());
    document.getElementById('btn-close-solver-hint').addEventListener('click', () => this.clearSolverHint());
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    document.addEventListener('contextmenu', (event) => {
      if (!event.target.closest('input, textarea')) event.preventDefault();
    }, { capture: true });
    tutorialOverlay.addEventListener('click', (event) => {
      if (event.target === tutorialOverlay) this.advanceSilverWolfDialogue();
    });

    document.getElementById('btn-start-task').addEventListener('click', async () => {
      const nickname = readNickname();
      if (!nickname) {
        this.handleRoomError({ code: 'INVALID_NAME' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'solo';
      this.pendingTaskMission = this.taskMission;
      this.taskExperienceStarted = false;
      this.mediumChordTipShown = false;
      try { await this.roomClient.create(nickname, 'solo'); } catch (error) { this.handleRoomError(error); }
    });

    document.getElementById('btn-join-room').addEventListener('click', async () => {
      const nickname = readNickname();
      const roomCode = document.getElementById('input-room').value.trim();
      if (!nickname || !roomCode) {
        this.handleRoomError({ code: !nickname ? 'INVALID_NAME' : 'ROOM_CODE' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'squad';
      try { await this.roomClient.join(roomCode, nickname); } catch (error) { this.handleRoomError(error); }
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
      const nickname = readNickname();
      if (!nickname) {
        this.handleRoomError({ code: 'INVALID_NAME' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'squad';
      try { await this.roomClient.create(nickname, 'squad'); } catch (error) { this.handleRoomError(error); }
    });

    const nicknameInput = document.getElementById('input-nickname');
    let savedNickname = localStorage.getItem('holo-sweeper.nickname');
    if (savedNickname && ['银狼', 'silver wolf'].includes(savedNickname.trim().toLowerCase())) {
      localStorage.removeItem('holo-sweeper.nickname');
      savedNickname = null;
    }
    nicknameInput.value = savedNickname || this.generatedNickname;
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
    document.getElementById('btn-mobile-dig').addEventListener('click', () => this.setMode('dig'));
    document.getElementById('btn-mobile-flag').addEventListener('click', () => this.setMode('flag'));
    for (const axis of ['x', 'y', 'z']) {
      document.getElementById(`slice-${axis}-min`).addEventListener('input', () => this.handleSliceChange(axis, 'min'));
      document.getElementById(`slice-${axis}-max`).addEventListener('input', () => this.handleSliceChange(axis, 'max'));
    }
    document.getElementById('btn-reset-slices').addEventListener('click', () => this.resetSlices(true));
    document.getElementById('btn-close-slices').addEventListener('click', () => this.closeMobilePanels());
    document.querySelectorAll('[data-mobile-panel]').forEach((button) => {
      button.addEventListener('click', () => this.toggleMobilePanel(button.dataset.mobilePanel));
    });
    document.getElementById('mobile-panel-backdrop').addEventListener('click', () => this.closeMobilePanels());
    const desktopMedia = window.matchMedia('(min-width: 901px)');
    const closeDrawersOnDesktop = (event) => {
      if (event.matches) this.closeMobilePanels();
    };
    if (desktopMedia.addEventListener) desktopMedia.addEventListener('change', closeDrawersOnDesktop);
    else desktopMedia.addListener(closeDrawersOnDesktop);

    // 模态弹窗重启按钮
    document.getElementById('btn-modal-restart').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.add('hidden');
      if (this.modalAction === 'rewind') {
        this.roomClient.send({ op: 'rewind' }).catch(error => {
          this.handleRoomError(error);
          this.showTaskRewindModal();
        });
        return;
      }
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

  selectLobbyMode(mode) {
    const solo = mode !== 'squad';
    document.getElementById('btn-lobby-task').classList.toggle('active', solo);
    document.getElementById('btn-lobby-task').setAttribute('aria-selected', String(solo));
    document.getElementById('btn-lobby-multiplayer').classList.toggle('active', !solo);
    document.getElementById('btn-lobby-multiplayer').setAttribute('aria-selected', String(!solo));
    document.getElementById('lobby-task-panel').classList.toggle('hidden', !solo);
    document.getElementById('lobby-multiplayer-panel').classList.toggle('hidden', solo);
    this.applyStoryArt(solo ? 'solo' : 'squad', this.taskMission);
    this.setLobbyStatus('');
  }

  selectTaskMission(mission) {
    if (!TASK_MISSIONS[mission]) return;
    this.taskMission = mission;
    document.querySelectorAll('.task-mission-option').forEach((button) => {
      const active = button.dataset.mission === mission;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    document.getElementById('task-brief-badge').textContent = this.t(`lobby.task.${mission}Badge`);
    document.getElementById('task-brief-text').textContent = this.t(`lobby.task.${mission}Brief`);
    this.applyStoryArt('solo', mission);
    this.updateSolverHintVisibility(this.roomSnapshot);
  }

  storyArtKey(mode = this.gameMode, mission = this.taskMission) {
    if (mode === 'squad') return 'squad';
    return STORY_ART[mission] ? mission : 'easy';
  }

  applyStoryArt(mode = this.gameMode, mission = this.taskMission) {
    const artKey = this.storyArtKey(mode, mission);
    const source = STORY_ART[artKey];
    document.body.dataset.storyArt = artKey;
    const missionArt = document.getElementById('mission-art');
    if (missionArt?.getAttribute('src') !== source) missionArt?.setAttribute('src', source);
    if (!this.dialogueState) this.setTutorialArt('main', artKey);
  }

  setTutorialArt(artKey = 'main', mission = this.taskMission) {
    const source = DIALOGUE_ART[mission]?.[artKey] ?? STORY_ART[mission] ?? STORY_ART.easy;
    const tutorialArt = document.getElementById('tutorial-art');
    if (tutorialArt?.getAttribute('src') !== source) tutorialArt?.setAttribute('src', source);
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
    document.getElementById('btn-mobile-dig').classList.toggle('active', mode === 'dig');
    document.getElementById('btn-mobile-flag').classList.toggle('active', mode === 'flag');
  }

  toggleMobilePanel(panelId) {
    if (window.innerWidth > 900) return;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const willOpen = !panel.classList.contains('mobile-open');
    this.closeMobilePanels();
    if (!willOpen) return;
    panel.classList.add('mobile-open');
    document.body.classList.add('mobile-panel-active');
    document.getElementById('mobile-panel-backdrop').classList.add('visible');
    document.querySelector(`[data-mobile-panel="${panelId}"]`)?.classList.add('active');
  }

  closeMobilePanels() {
    document.querySelectorAll('#control-panel, #social-panel, #slicing-panel').forEach((panel) => panel.classList.remove('mobile-open'));
    document.querySelectorAll('[data-mobile-panel]').forEach((button) => button.classList.remove('active'));
    document.body.classList.remove('mobile-panel-active');
    document.getElementById('mobile-panel-backdrop')?.classList.remove('visible');
  }

  t(key, params = {}) {
    return translate(this.language, key, params);
  }

  rollNickname() {
    const input = document.getElementById('input-nickname');
    const current = input.value.trim();
    let next = current;
    for (let attempt = 0; attempt < 12 && next === current; attempt++) {
      next = randomNickname(this.language);
    }
    if (next === current) {
      const fallbacks = this.language === 'zh'
        ? ['清脆的键盘', '非常高清的显示屏']
        : ['Clicky Keyboard', 'Crystal Monitor'];
      next = fallbacks.find(name => name !== current) ?? fallbacks[0];
    }
    this.generatedNickname = next;
    input.value = next;
    localStorage.removeItem('holo-sweeper.nickname');
    input.focus();
    input.select();
  }

  storyT(suffix, params = {}) {
    if (this.gameMode === 'squad') return this.t(`squad.${suffix}`, params);
    const missionKey = `task.${this.taskMission}.${suffix}`;
    const missionValue = this.t(missionKey, params);
    return missionValue === missionKey ? this.t(`task.${suffix}`, params) : missionValue;
  }

  systemText(message) {
    return `${this.t('system.prefix')} ${message}`;
  }

  applyLanguage(language, initializing = false) {
    const previousLanguage = this.language;
    const previousGeneratedNickname = this.generatedNickname;
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
    document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
      element.alt = this.t(element.dataset.i18nAlt);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      element.setAttribute('aria-label', this.t(element.dataset.i18nAriaLabel));
    });

    const nicknameInput = document.getElementById('input-nickname');
    const savedNickname = localStorage.getItem('holo-sweeper.nickname');
    if (!savedNickname && (initializing || !nicknameInput.value || nicknameInput.value === previousGeneratedNickname)) {
      if (!initializing || !this.generatedNickname) this.generatedNickname = randomNickname(language);
      nicknameInput.value = this.generatedNickname;
    }
    document.getElementById('btn-sound-toggle').innerText = this.t(sfx.enabled ? 'action.soundOn' : 'action.soundOff');
    const code = this.roomSnapshot?.code || '-';
    document.getElementById('room-code-display').innerText = this.t('players.roomCode', { code });
    const me = this.roomSnapshot?.players?.find(player => player.id === this.currentPlayerId);
    document.getElementById('btn-restart').title = me && !me.isHost ? this.t('error.HOST_ONLY') : '';
    if (this.roomSnapshot) {
      this.renderRoomMessages(this.roomSnapshot);
      if (this.roomSnapshot.phase === 'revive') {
        if (this.gameMode === 'solo') this.showTaskRewindModal();
        else this.syncRevival(this.roomSnapshot);
      }
      if (this.roomSnapshot.phase === 'lost') {
        document.getElementById('modal-title').innerText = this.storyT('result.lostTitle');
        document.getElementById('modal-message').innerText = this.storyT('result.lostMessage');
      } else if (this.roomSnapshot.phase === 'won') {
        document.getElementById('modal-title').innerText = this.storyT('result.wonTitle');
        document.getElementById('modal-message').innerText = this.storyT('result.wonMessage');
      }
    }
    this.selectTaskMission(this.taskMission);
    this.updateMissionGuide();
    if (this.dialogueState && !this.waitingTutorialAction) this.renderSilverWolfDialogue();
    if (this.waitingTutorialAction) this.setTutorialActionHint(this.waitingTutorialAction);
    if (this.guidedTutorialActive) this.updateGuidedTutorial(this.roomSnapshot);
    if (this.solverHint) this.renderSolverHint(this.solverHint);
    this.updateSolverHintVisibility(this.roomSnapshot);
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
    this.gameMode = message.snapshot.mode === 'solo' ? 'solo' : 'squad';
    this.syncGameModeUI();
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('room-code-display').innerText = this.t('players.roomCode', { code: message.snapshot.code });
    document.getElementById('btn-copy-invite').style.display = this.gameMode === 'squad' ? '' : 'none';
    if (this.gameMode === 'solo') {
      if (!this.pendingTaskMission) this.taskMission = this.missionFromConfig(message.snapshot.config);
      const desired = TASK_MISSIONS[this.taskMission] ?? TASK_MISSIONS.easy;
      const differs = ['width', 'height', 'depth', 'mineCount'].some(key => message.snapshot.config[key] !== desired[key]);
      if (this.pendingTaskMission && differs) {
        this.roomClient.send({ op: 'restart', config: desired }).catch(error => this.handleRoomError(error));
      }
    }
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
    this.gameMode = snapshot.mode === 'solo' ? 'solo' : 'squad';
    if (this.gameMode === 'solo') {
      const snapshotMission = this.missionFromConfig(snapshot.config);
      if (!this.pendingTaskMission || this.pendingTaskMission === snapshotMission) {
        this.taskMission = this.pendingTaskMission ?? snapshotMission;
        if (this.pendingTaskMission === snapshotMission) this.pendingTaskMission = null;
      }
    }
    this.syncGameModeUI();
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
    this.isGameOver = snapshot.phase === 'lost' || (this.gameMode === 'solo' && snapshot.phase === 'revive');
    this.isGameWon = snapshot.phase === 'won';
    this.isInteractionLocked = ['revive', 'lost', 'won'].includes(snapshot.phase);
    this.syncServerTimer(snapshot.startedAt, snapshot.serverTime, ['playing', 'revive'].includes(snapshot.phase));

    if (snapshot.phase === 'revive') {
      if (previous?.phase !== 'revive' && snapshot.pendingMine) this.triggerMineLocal(snapshot.pendingMine.x, snapshot.pendingMine.y, snapshot.pendingMine.z);
      if (this.gameMode === 'squad') this.syncRevival(snapshot);
    } else if (previous?.phase === 'revive' && previous.pendingMine) {
      this.restorePendingMineVisual(previous.pendingMine);
      document.getElementById('ad-modal-overlay').classList.add('hidden');
      document.getElementById('modal-overlay').classList.add('hidden');
      this.modalAction = 'restart';
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
    if (previous?.revision !== snapshot.revision && this.isSolverHintCompleted(snapshot)) this.clearSolverHint();
    this.roomSnapshot = snapshot;
    this.updateStats();
    this.updateSolverHintVisibility(snapshot);
    if (this.guidedTutorialActive) this.updateGuidedTutorial(snapshot);
    if (this.gameMode === 'solo') {
      this.maybeStartTaskExperience(snapshot);
      this.maybeShowMediumChordTip(snapshot, previous);
    }
  }

  missionFromConfig(config) {
    if (config?.width >= 7 || config?.mineCount >= 45) return 'hard';
    if (config?.width >= 5 || config?.mineCount >= 15) return 'medium';
    return 'easy';
  }

  configMatchesMission(config, mission = this.taskMission) {
    const desired = TASK_MISSIONS[mission] ?? TASK_MISSIONS.easy;
    return ['width', 'height', 'depth', 'mineCount'].every(key => config?.[key] === desired[key]);
  }

  maybeStartTaskExperience(snapshot) {
    if (this.taskExperienceStarted || !this.configMatchesMission(snapshot.config)) return;
    this.taskExperienceStarted = true;
    if (this.taskMission === 'easy') {
      this.startSilverWolfTutorial();
      return;
    }
    if (this.taskMission === 'medium') {
      this.showSilverWolfDialogue([
        { artKey: 'main', titleKey: 'task.medium.chapterTitle', messageKey: 'task.medium.brief.1', buttonKey: 'tutorial.next' },
        { artKey: 'tip', titleKey: 'task.medium.upgradeTitle', messageKey: 'task.medium.upgrade.1', factKey: 'task.medium.upgrade.fact', buttonKey: 'tutorial.next' },
        { artKey: 'scan', titleKey: 'task.medium.upgradeTitle', messageKey: 'task.medium.upgrade.scan', factKey: 'tutorial.scanFact', buttonKey: 'tutorial.tryScan', action: 'scan' },
        { artKey: 'inspect', titleKey: 'tutorial.inspectTitle', messageKey: 'tutorial.inspect', factKey: 'tutorial.inspectFact', buttonKey: 'tutorial.tryInspect', action: 'inspect' },
        { artKey: 'tip', titleKey: 'tutorial.sliceTitle', messageKey: 'tutorial.slice', factKey: 'tutorial.sliceFact', buttonKey: 'tutorial.trySlice', action: 'slice' },
        { artKey: 'ready', titleKey: 'tutorial.sliceResetTitle', messageKey: 'tutorial.sliceReset', factKey: 'tutorial.sliceResetFact', buttonKey: 'tutorial.trySliceReset', action: 'sliceReset' },
        { artKey: 'ready', titleKey: 'task.medium.chapterTitle', messageKey: 'task.medium.brief.2', factKey: 'task.medium.brief.fact', buttonKey: 'tutorial.startMission' },
      ]);
      return;
    }
    this.showSilverWolfDialogue([
      { artKey: 'main', titleKey: `task.${this.taskMission}.chapterTitle`, messageKey: `task.${this.taskMission}.brief.1`, buttonKey: 'tutorial.next' },
      { artKey: 'main', titleKey: `task.${this.taskMission}.chapterTitle`, messageKey: `task.${this.taskMission}.brief.2`, factKey: `task.${this.taskMission}.brief.fact`, buttonKey: 'tutorial.startMission' },
    ]);
  }

  maybeShowMediumChordTip(snapshot, previous) {
    if (
      this.mediumChordTipShown
      || this.gameMode !== 'solo'
      || this.taskMission !== 'medium'
      || !this.taskExperienceStarted
      || this.dialogueState
      || snapshot.phase !== 'playing'
      || !previous
      || (snapshot.flags?.length ?? 0) <= (previous.flags?.length ?? 0)
    ) return;

    const clue = findChordOpportunity(snapshot);
    if (!clue) return;
    this.mediumChordTipShown = true;
    this.showSilverWolfDialogue([
      {
        artKey: 'tip',
        titleKey: 'task.medium.chordTipTitle',
        messageKey: 'task.medium.chordTip',
        factText: this.t('task.medium.chordTipFact', {
          number: clue.count,
          x: clue.x + 1,
          y: clue.y + 1,
          z: clue.z + 1,
          hidden: clue.hiddenAround,
        }),
        buttonKey: 'tutorial.understood',
      },
    ]);
  }

  startSilverWolfTutorial() {
    this.showSilverWolfDialogue([
      { artKey: 'main', titleKey: 'tutorial.speaker', messageKey: 'tutorial.intro', buttonKey: 'tutorial.next' },
      { artKey: 'neighbors', titleKey: 'tutorial.neighborsTitle', messageKey: 'tutorial.neighbors', factKey: 'tutorial.neighborsFact', buttonKey: 'tutorial.understood' },
      { artKey: 'scan', titleKey: 'tutorial.guidedTitle', messageKey: 'tutorial.guided', factKey: 'tutorial.guidedFact', buttonKey: 'tutorial.followMe' },
    ], { allowSkip: true, onComplete: () => this.beginGuidedTutorial() });
  }

  showSilverWolfDialogue(steps, { allowSkip = false, onComplete = null } = {}) {
    this.dialogueState = { steps, index: 0, allowSkip, onComplete };
    this.waitingTutorialAction = null;
    this.setTutorialActionHint();
    this.renderSilverWolfDialogue();
  }

  renderSilverWolfDialogue() {
    const state = this.dialogueState;
    if (!state) return;
    if (state.index >= state.steps.length) {
      this.finishSilverWolfDialogue();
      return;
    }
    const step = state.steps[state.index];
    this.setTutorialArt(step.artKey ?? 'main');
    this.setTutorialActionHint();
    document.getElementById('tutorial-kicker').textContent = this.t(step.kickerKey ?? 'tutorial.kicker');
    document.getElementById('tutorial-title').textContent = this.t(step.titleKey ?? 'tutorial.speaker');
    document.getElementById('tutorial-message').textContent = this.t(step.messageKey);
    const fact = document.getElementById('tutorial-fact');
    const factText = step.factText ?? (step.factKey ? this.t(step.factKey) : '');
    fact.textContent = factText;
    fact.classList.toggle('hidden', !factText);
    document.getElementById('btn-tutorial-next').textContent = this.t(step.buttonKey ?? 'tutorial.next');
    document.getElementById('btn-skip-tutorial').style.display = state.allowSkip ? '' : 'none';
    document.getElementById('tutorial-overlay').classList.remove('hidden');
  }

  advanceSilverWolfDialogue() {
    const state = this.dialogueState;
    if (!state) return;
    const step = state.steps[state.index];
    if (step?.action) {
      this.waitingTutorialAction = step.action;
      document.getElementById('tutorial-overlay').classList.add('hidden');
      this.setTutorialActionHint(step.action);
      if (step.action === 'slice' || step.action === 'sliceReset') this.focusSliceTutorial(step.action);
      if (this.isTutorialActionComplete(step.action)) this.completeTutorialAction(step.action);
      return;
    }
    state.index += 1;
    this.renderSilverWolfDialogue();
  }

  finishSilverWolfDialogue() {
    const onComplete = this.dialogueState?.onComplete;
    document.getElementById('tutorial-overlay').classList.add('hidden');
    this.dialogueState = null;
    this.waitingTutorialAction = null;
    this.setTutorialArt('main');
    this.setTutorialActionHint();
    onComplete?.();
  }

  skipTutorial() {
    if (!this.dialogueState?.allowSkip) return;
    this.stopGuidedTutorial();
    document.getElementById('tutorial-overlay').classList.add('hidden');
    this.dialogueState = null;
    this.waitingTutorialAction = null;
    this.setTutorialArt('main');
    this.setTutorialActionHint();
    if (this.gameMode === 'solo' && this.taskMission === 'easy') this.advanceTaskMission('medium');
  }

  isTutorialActionComplete(action) {
    if (action === 'observe') return this.hasObservedMatrix;
    if (action === 'scan') return this.revealedCount > 0;
    if (action === 'inspect') return this.hasInspectedNeighbors;
    if (action === 'mark') return this.flaggedCount > 0;
    if (action === 'slice') return this.hasUsedSlices && !this.isSliceFull();
    if (action === 'sliceReset') return this.hasResetSlices && this.isSliceFull();
    return false;
  }

  completeTutorialAction(action) {
    if (this.gameMode !== 'solo' || this.waitingTutorialAction !== action || !this.dialogueState) return;
    this.waitingTutorialAction = null;
    this.setTutorialActionHint();
    if (action === 'sliceReset') this.closeMobilePanels();
    this.dialogueState.index += 1;
    setTimeout(() => this.renderSilverWolfDialogue(), 240);
  }

  setTutorialActionHint(action = null) {
    const hint = document.getElementById('tutorial-action-hint');
    const text = document.getElementById('tutorial-action-hint-text');
    if (!hint || !text) return;
    hint.classList.toggle('hidden', !action);
    if (action) text.textContent = this.t(`tutorial.actionHint.${action}`);
    const sliceAction = action === 'slice' || action === 'sliceReset';
    document.getElementById('slicing-panel')?.classList.toggle('tutorial-target', sliceAction);
    document.getElementById('btn-mobile-slices')?.classList.toggle('tutorial-target', sliceAction);
    document.getElementById('btn-reset-slices')?.classList.toggle('tutorial-target', action === 'sliceReset');
  }

  focusSliceTutorial(action) {
    if (window.innerWidth <= 900) {
      const panel = document.getElementById('slicing-panel');
      if (panel && !panel.classList.contains('mobile-open')) this.toggleMobilePanel('slicing-panel');
    }
    const target = action === 'sliceReset'
      ? document.getElementById('btn-reset-slices')
      : document.getElementById('slice-z-max');
    target?.focus({ preventScroll: true });
  }

  beginGuidedTutorial() {
    if (this.gameMode !== 'solo' || this.taskMission !== 'easy') return;
    this.guidedTutorialActive = true;
    this.guidedFlagModeExplained = false;
    this.updateGuidedTutorial(this.roomSnapshot);
  }

  stopGuidedTutorial() {
    this.guidedTutorialActive = false;
    clearTimeout(this.guidedCorrectionTimer);
    this.guidedCorrectionTimer = null;
    this.clearGuidedTarget();
    this.setTutorialActionHint();
  }

  pointKey(point) {
    return `${point.x}:${point.y}:${point.z}`;
  }

  guidedRouteStepComplete(step, revealed, flags) {
    return (step.action === 'flag' ? flags : revealed).has(this.pointKey(step));
  }

  updateGuidedTutorial(snapshot = this.roomSnapshot) {
    if (!this.guidedTutorialActive || this.gameMode !== 'solo' || this.taskMission !== 'easy' || !snapshot) return;
    if (snapshot.phase === 'won') {
      this.stopGuidedTutorial();
      return;
    }
    if (!['ready', 'playing'].includes(snapshot.phase)) return;

    if (!(snapshot.tutorialMines || []).length || !snapshot.tutorialStart) return;
    const revealed = new Set((snapshot.revealed || []).map((point) => this.pointKey(point)));
    const flags = new Set((snapshot.flags || []).map((point) => this.pointKey(point)));
    if (snapshot.phase === 'ready' && revealed.size === 0 && flags.size === 0) this.guidedFlagModeExplained = false;

    const nextIndex = BEGINNER_TUTORIAL_ROUTE.findIndex((step) => !this.guidedRouteStepComplete(step, revealed, flags));
    if (nextIndex < 0) {
      this.clearGuidedTarget();
      return;
    }
    const target = { ...BEGINNER_TUTORIAL_ROUTE[nextIndex], step: nextIndex + 1, total: BEGINNER_TUTORIAL_ROUTE.length };

    if (nextIndex === 1 && target.action === 'flag' && !this.guidedFlagModeExplained) {
      this.guidedFlagModeExplained = true;
      this.clearGuidedTarget();
      this.showSilverWolfDialogue([
        { artKey: 'scan', titleKey: 'tutorial.flagModeTitle', messageKey: 'tutorial.flagMode', factKey: 'tutorial.flagModeFact', buttonKey: 'tutorial.tryFlag' },
      ], { allowSkip: true, onComplete: () => this.updateGuidedTutorial(this.roomSnapshot) });
      return;
    }

    this.setGuidedTarget(target);
  }

  setGuidedTarget(target) {
    const current = this.guidedTutorialTarget;
    const unchanged = current && current.action === target.action && this.pointKey(current) === this.pointKey(target);
    if (!unchanged) {
      this.clearGuidedTarget();
      this.guidedTutorialTarget = target;
      const cell = this.grid[target.x]?.[target.y]?.[target.z];
      if (!cell) return;
      const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
      this.setMode(target.action === 'dig' || coarsePointer ? target.action : 'dig');
      this.createGuidedTargetMarker(cell, target.action);
      this.createGuidedEvidenceMarkers(target.evidence || []);
      this.syncReasoningCoordinateAxes();
    }

    const digTarget = target.action === 'dig';
    document.getElementById('btn-mode-dig')?.classList.toggle('tutorial-target', digTarget);
    document.getElementById('btn-mobile-dig')?.classList.toggle('tutorial-target', digTarget);
    document.getElementById('btn-mode-flag')?.classList.toggle('tutorial-target', !digTarget);
    document.getElementById('btn-mobile-flag')?.classList.toggle('tutorial-target', !digTarget);
    this.renderGuidedHint();
  }

  createGuidedTargetMarker(cell, action) {
    const color = action === 'flag' ? 0xff4fd8 : 0x29e7ff;
    const marker = new THREE.Group();
    const box = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }));
    outline.renderOrder = 999;
    marker.add(outline);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.32, 6),
      new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }),
    );
    arrow.position.y = 0.78;
    arrow.rotation.z = Math.PI;
    arrow.renderOrder = 1000;
    marker.add(arrow);
    cell.group.add(marker);
    this.guidedTargetMarker = marker;
  }

  createEvidenceReticle() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#ffd75a';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.shadowColor = 'rgba(255, 215, 90, 0.9)';
    context.shadowBlur = 10;
    const center = 64;
    const radius = 43;
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const start = quadrant * Math.PI / 2 + 0.18;
      context.beginPath();
      context.arc(center, center, radius, start, start + 0.72);
      context.stroke();
    }
    context.lineWidth = 5;
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      context.beginPath();
      context.moveTo(center + Math.cos(angle) * 49, center + Math.sin(angle) * 49);
      context.lineTo(center + Math.cos(angle) * 58, center + Math.sin(angle) * 58);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    }));
    marker.scale.set(1.28, 1.28, 1);
    marker.renderOrder = 998;
    return marker;
  }

  createGuidedEvidenceMarkers(points) {
    for (const point of points) {
      const cell = this.grid[point.x]?.[point.y]?.[point.z];
      if (!cell) continue;
      const marker = this.createEvidenceReticle();
      cell.group.add(marker);
      this.guidedEvidenceMarkers.push(marker);
    }
  }

  disposeGuidedMarker(marker) {
    marker?.parent?.remove(marker);
    marker?.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
      else {
        object.material?.map?.dispose?.();
        object.material?.dispose?.();
      }
    });
  }

  createReasoningAxisLabel(label, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(5, 7, 20, 0.88)';
    context.strokeStyle = color;
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(18, 8, 92, 56, 18);
    context.fill();
    context.stroke();
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.fillStyle = '#ffffff';
    context.font = '900 38px "Orbitron", "Share Tech Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 64, 37);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    sprite.scale.set(0.62, 0.35, 1);
    sprite.renderOrder = 1004;
    return sprite;
  }

  createReasoningCoordinateAxes() {
    if (!this.scene || this.reasoningCoordinateAxes) return;
    const group = new THREE.Group();
    group.name = 'reasoning-coordinate-axes';
    group.visible = false;

    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
    );
    origin.renderOrder = 1002;
    group.add(origin);

    const axes = [
      { label: 'X', direction: new THREE.Vector3(1, 0, 0), color: 0xff4fd8, cssColor: '#ff4fd8' },
      { label: 'Y', direction: new THREE.Vector3(0, 1, 0), color: 0x29e7ff, cssColor: '#29e7ff' },
      { label: 'Z', direction: new THREE.Vector3(0, 0, 1), color: 0xffd75a, cssColor: '#ffd75a' },
    ];
    for (const axis of axes) {
      const arrow = new THREE.ArrowHelper(axis.direction, new THREE.Vector3(), 1, axis.color, 0.23, 0.14);
      for (const object of [arrow.line, arrow.cone]) {
        object.material.depthTest = false;
        object.material.depthWrite = false;
        object.material.transparent = true;
        object.material.opacity = 0.92;
        object.renderOrder = 1003;
      }
      group.add(arrow);

      const label = this.createReasoningAxisLabel(axis.label, axis.cssColor);
      label.position.copy(axis.direction).multiplyScalar(1.22);
      group.add(label);
    }

    this.reasoningCoordinateAxes = group;
    this.scene.add(group);

    this.positionReasoningCoordinateAxes(true);
    this.syncReasoningCoordinateAxes();
  }

  positionReasoningCoordinateAxes(force = false) {
    if (!this.reasoningCoordinateAxes) return;
    const active = Boolean(this.guidedTutorialTarget || this.solverHint?.target);
    if (!active || !this.camera || !this.grid.length) {
      this.reasoningCoordinateAxes.visible = false;
      return;
    }

    const now = performance.now();
    if (!force && now - this.lastReasoningAxesLayoutAt < 80) return;
    this.lastReasoningAxesLayoutAt = now;

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const offsetX = (this.width - 1) / 2;
    const offsetY = (this.height - 1) / 2;
    const offsetZ = (this.depth - 1) / 2;
    const originWorld = new THREE.Vector3(-offsetX, -offsetY, -offsetZ);
    const originProjection = originWorld.clone().project(this.camera);
    const originScreen = {
      x: (originProjection.x * 0.5 + 0.5) * window.innerWidth,
      y: (-originProjection.y * 0.5 + 0.5) * window.innerHeight,
    };
    const board = this.guidedBoardScreenBounds();
    const safe = board ? this.guidedCalloutSafeBounds(board) : null;
    const compact = window.innerWidth <= 900;
    const visibleObstacleRect = (id) => {
      const element = document.getElementById(id);
      if (!element) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? {
        left: rect.left - 8,
        right: rect.right + 8,
        top: rect.top - 8,
        bottom: rect.bottom + 8,
      } : null;
    };
    const obstacles = ['guided-cell-pointer']
      .map(visibleObstacleRect)
      .filter(Boolean);
    const placement = chooseFloatingAxisPlacement({
      board,
      safe,
      target: originScreen,
      width: compact ? 68 : 116,
      height: compact ? 68 : 116,
      gap: compact ? 4 : 14,
      obstacles,
    });

    if (!placement) {
      this.reasoningCoordinateAxes.visible = false;
      return;
    }

    const floatingScreen = {
      x: (placement.left + placement.right) / 2,
      y: compact ? placement.top + 10 : (placement.top + placement.bottom) / 2,
    };
    const floatingWorld = new THREE.Vector3(
      floatingScreen.x / window.innerWidth * 2 - 1,
      -(floatingScreen.y / window.innerHeight * 2 - 1),
      originProjection.z,
    ).unproject(this.camera);
    this.reasoningCoordinateAxes.position.copy(floatingWorld);
    this.reasoningCoordinateAxes.scale.setScalar(compact ? 0.42 : 0.84);
    this.reasoningCoordinateAxes.visible = true;
  }

  syncReasoningCoordinateAxes() {
    this.positionReasoningCoordinateAxes(true);
  }

  clearGuidedTarget() {
    this.disposeGuidedMarker(this.guidedTargetMarker);
    for (const marker of this.guidedEvidenceMarkers) this.disposeGuidedMarker(marker);
    this.guidedTargetMarker = null;
    this.guidedEvidenceMarkers = [];
    this.guidedTutorialTarget = null;
    for (const id of ['btn-mode-dig', 'btn-mobile-dig', 'btn-mode-flag', 'btn-mobile-flag']) {
      document.getElementById(id)?.classList.remove('tutorial-target');
    }
    document.getElementById('guided-cell-pointer')?.classList.add('hidden');
    document.getElementById('guided-cell-leader')?.classList.add('hidden');
    this.syncReasoningCoordinateAxes();
  }

  guidedConstraint(point, snapshot = this.roomSnapshot) {
    const number = (snapshot?.revealed || []).find((cell) => this.pointKey(cell) === this.pointKey(point))?.count ?? 0;
    const flagged = new Set((snapshot?.flags || []).map((cell) => this.pointKey(cell)));
    const revealed = new Set((snapshot?.revealed || []).map((cell) => this.pointKey(cell)));
    const neighbors = this.getNeighbors(point.x, point.y, point.z);
    const flaggedCount = neighbors.filter((cell) => flagged.has(this.pointKey(cell))).length;
    const hiddenCount = neighbors.filter((cell) => !flagged.has(this.pointKey(cell)) && !revealed.has(this.pointKey(cell))).length;
    return { number, flagged: flaggedCount, hidden: hiddenCount, remaining: number - flaggedCount };
  }

  guidedReasonParams(target) {
    const params = { x: target.x + 1, y: target.y + 1, z: target.z + 1, step: target.step, total: target.total };
    const [aPoint, bPoint] = target.evidence || [];
    if (aPoint) {
      const a = this.guidedConstraint(aPoint);
      Object.assign(params, { ax: aPoint.x + 1, ay: aPoint.y + 1, az: aPoint.z + 1, aNumber: a.number, aFlagged: a.flagged, aHidden: a.hidden, aRemaining: a.remaining });
    }
    if (bPoint) {
      const b = this.guidedConstraint(bPoint);
      Object.assign(params, { bx: bPoint.x + 1, by: bPoint.y + 1, bz: bPoint.z + 1, bNumber: b.number, bFlagged: b.flagged, bHidden: b.hidden, bRemaining: b.remaining });
    }
    return params;
  }

  renderGuidedHint(correction = false) {
    const target = this.guidedTutorialTarget;
    if (!target) return;
    const params = this.guidedReasonParams(target);
    const key = correction
      ? `tutorial.guided.hint.correction.${target.action}`
      : `tutorial.guided.hint.${target.reason}`;
    const hint = document.getElementById('tutorial-action-hint');
    const hintText = document.getElementById('tutorial-action-hint-text');
    hint?.classList.remove('hidden');
    if (hintText) hintText.textContent = this.t(key, params);

    const pointer = document.getElementById('guided-cell-pointer');
    const leader = document.getElementById('guided-cell-leader');
    const pointerText = document.getElementById('guided-cell-pointer-text');
    const reasonLabel = document.getElementById('guided-cell-reason-label');
    pointer?.classList.remove('hidden', 'safe', 'mine');
    pointer?.classList.add(target.kind === 'mine' ? 'mine' : 'safe');
    leader?.classList.remove('hidden', 'safe', 'mine');
    leader?.classList.add(target.kind === 'mine' ? 'mine' : 'safe');
    if (pointerText) pointerText.textContent = this.t(target.kind === 'mine' ? 'tutorial.guided.pointer.mine' : 'tutorial.guided.pointer.safe');
    if (reasonLabel) {
      const reasonKey = target.reason === 'protectedStart'
        ? 'tutorial.guided.evidence.protected'
        : (target.reason.startsWith('compare') ? 'tutorial.guided.evidence.compare' : 'tutorial.guided.evidence.direct');
      reasonLabel.textContent = this.t(reasonKey, params);
    }
    if (pointer && hintText) pointer.title = hintText.textContent;
    this.updateGuidedPointerPosition();
  }

  showGuidedCorrection() {
    if (!this.guidedTutorialActive || !this.guidedTutorialTarget) return;
    clearTimeout(this.guidedCorrectionTimer);
    this.renderGuidedHint(true);
    this.guidedCorrectionTimer = setTimeout(() => this.renderGuidedHint(), 1200);
  }

  isGuidedActionAllowed(action, x, y, z) {
    if (!this.guidedTutorialActive) return true;
    const target = this.guidedTutorialTarget;
    const matches = target && target.action === action && target.x === x && target.y === y && target.z === z;
    if (!matches) this.showGuidedCorrection();
    return Boolean(matches);
  }

  activateGuidedTarget(inputMethod = 'primary') {
    const target = this.guidedTutorialTarget;
    if (!this.guidedTutorialActive || !target || this.isInteractionLocked) return;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
    if (target.action === 'flag' && !coarsePointer && inputMethod !== 'secondary') {
      this.showGuidedCorrection();
      return;
    }
    if (target.action === 'flag') this.toggleFlag(target.x, target.y, target.z);
    else this.dig(target.x, target.y, target.z);
  }

  updateGuidedPointerPosition() {
    const target = this.guidedTutorialTarget;
    const pointer = document.getElementById('guided-cell-pointer');
    const leader = document.getElementById('guided-cell-leader');
    const cell = target ? this.grid[target.x]?.[target.y]?.[target.z] : null;
    if (!pointer || !leader || !cell || !this.camera || !this.scene) return;
    this.scene.updateMatrixWorld(true);

    const position = new THREE.Vector3();
    cell.group.getWorldPosition(position);
    position.project(this.camera);
    const targetPoint = {
      x: (position.x * 0.5 + 0.5) * window.innerWidth,
      y: (-position.y * 0.5 + 0.5) * window.innerHeight,
    };
    const board = this.guidedBoardScreenBounds();
    if (!board) return;
    const safe = this.guidedCalloutSafeBounds(board);

    pointer.classList.remove('hidden', 'compact');
    let rect = pointer.getBoundingClientRect();
    let placement = chooseGuidedCalloutPlacement({
      board,
      safe,
      target: targetPoint,
      width: rect.width,
      height: rect.height,
      gap: 22,
    });

    if (!placement) {
      pointer.classList.add('compact');
      rect = pointer.getBoundingClientRect();
      placement = chooseGuidedCalloutPlacement({
        board,
        safe: { left: 10, top: 10, right: window.innerWidth - 10, bottom: window.innerHeight - 10 },
        target: targetPoint,
        width: rect.width,
        height: rect.height,
        gap: 16,
      });
    }

    if (!placement) {
      pointer.classList.add('hidden');
      leader.classList.add('hidden');
      return;
    }

    pointer.dataset.side = placement.side;
    pointer.style.left = `${placement.left}px`;
    pointer.style.top = `${placement.top}px`;
    leader.classList.remove('hidden');
    this.positionGuidedLeader(leader, placement, targetPoint);
  }

  guidedBoardScreenBounds() {
    const points = [];
    const half = 0.58;
    for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) for (let z = 0; z < this.depth; z++) {
      const cell = this.grid[x]?.[y]?.[z];
      if (!cell?.group.visible || (!cell.mesh.visible && !cell.spriteInstance && !cell.flagInstance)) continue;
      for (const dx of [-half, half]) for (const dy of [-half, half]) for (const dz of [-half, half]) {
        const corner = new THREE.Vector3(dx, dy, dz).applyMatrix4(cell.group.matrixWorld).project(this.camera);
        points.push({
          x: (corner.x * 0.5 + 0.5) * window.innerWidth,
          y: (-corner.y * 0.5 + 0.5) * window.innerHeight,
        });
      }
    }
    if (!points.length) return null;
    const padding = window.innerWidth <= 900 ? 14 : 18;
    return {
      left: Math.min(...points.map(point => point.x)) - padding,
      right: Math.max(...points.map(point => point.x)) + padding,
      top: Math.min(...points.map(point => point.y)) - padding,
      bottom: Math.max(...points.map(point => point.y)) + padding,
    };
  }

  guidedCalloutSafeBounds(board) {
    const margin = window.innerWidth <= 900 ? 10 : 14;
    const safe = { left: margin, top: margin, right: window.innerWidth - margin, bottom: window.innerHeight - margin };
    const visibleRect = (id) => {
      const element = document.getElementById(id);
      if (!element) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? rect : null;
    };

    if (window.innerWidth > 900) {
      const leftPanel = visibleRect('control-panel');
      const rightPanel = visibleRect('social-panel');
      if (leftPanel) safe.left = Math.max(safe.left, leftPanel.right + 12);
      if (rightPanel) safe.right = Math.min(safe.right, rightPanel.left - 12);
    }

    for (const id of ['slicing-panel', 'mobile-statusbar', 'mobile-control-dock', 'tutorial-action-hint', 'solver-hint-panel', 'solver-hint-result']) {
      const rect = visibleRect(id);
      if (!rect) continue;
      if (rect.bottom <= board.top) safe.top = Math.max(safe.top, rect.bottom + 10);
      if (rect.top >= board.bottom) safe.bottom = Math.min(safe.bottom, rect.top - 10);
    }
    return safe;
  }

  positionGuidedLeader(leader, placement, target) {
    const starts = {
      top: { x: placement.left + (placement.right - placement.left) / 2, y: placement.bottom },
      bottom: { x: placement.left + (placement.right - placement.left) / 2, y: placement.top },
      left: { x: placement.right, y: placement.top + (placement.bottom - placement.top) / 2 },
      right: { x: placement.left, y: placement.top + (placement.bottom - placement.top) / 2 },
    };
    const start = starts[placement.side];
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    leader.style.left = `${start.x}px`;
    leader.style.top = `${start.y}px`;
    leader.style.width = `${Math.hypot(dx, dy)}px`;
    leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  updateSolverHintVisibility(snapshot = this.roomSnapshot) {
    const panel = document.getElementById('solver-hint-panel');
    if (!panel) return;
    const visible = this.gameMode === 'solo'
      && ['medium', 'hard'].includes(this.taskMission)
      && snapshot
      && ['ready', 'playing'].includes(snapshot.phase);
    panel.classList.toggle('hidden', !visible);
    if (!visible) this.clearSolverHint();
  }

  clearSolverHintMarkers() {
    this.disposeGuidedMarker(this.solverHintMarker);
    for (const marker of this.solverHintEvidenceMarkers) this.disposeGuidedMarker(marker);
    this.solverHintMarker = null;
    this.solverHintEvidenceMarkers = [];
  }

  syncSolverHintButton() {
    const button = document.getElementById('btn-request-solver-hint');
    const label = document.getElementById('solver-hint-button-label');
    const note = document.getElementById('solver-hint-button-note');
    const active = Boolean(this.solverHint);
    button?.setAttribute('aria-pressed', String(active));
    if (label) label.textContent = this.t(active ? 'solver.buttonActive' : 'solver.button');
    if (note) note.textContent = this.t(active ? 'solver.buttonActiveNote' : 'solver.buttonNote');
    if (active) this.setTutorialActionHint();
    else if (this.waitingTutorialAction) this.setTutorialActionHint(this.waitingTutorialAction);
  }

  clearSolverHint() {
    this.clearSolverHintMarkers();
    this.solverHint = null;
    document.getElementById('solver-hint-result')?.classList.add('hidden');
    this.syncSolverHintButton();
    this.syncReasoningCoordinateAxes();
  }

  isSolverHintCompleted(snapshot, hint = this.solverHint) {
    if (!hint?.target || !snapshot) return false;
    const completedCells = hint.action === 'flag' ? snapshot.flags : snapshot.revealed;
    return (completedCells || []).some((point) => this.pointKey(point) === this.pointKey(hint.target));
  }

  requestSolverHint() {
    if (this.gameMode !== 'solo' || !['medium', 'hard'].includes(this.taskMission) || !this.roomSnapshot) return;
    if (this.solverHint) {
      this.clearSolverHint();
      return;
    }
    const button = document.getElementById('btn-request-solver-hint');
    button.disabled = true;
    try {
      const { config } = this.roomSnapshot;
      this.solverHint = solveMinesweeperHint({
        width: config.width,
        height: config.height,
        depth: config.depth,
        mineCount: config.mineCount,
        phase: this.roomSnapshot.phase,
        revealed: this.roomSnapshot.revealed || [],
        flags: this.roomSnapshot.flags || [],
      });
      this.renderSolverHint(this.solverHint);
      this.createSolverHintMarkers(this.solverHint);
      this.syncReasoningCoordinateAxes();
    } finally {
      button.disabled = false;
    }
  }

  formatSolverCount(value) {
    const raw = String(value ?? '0');
    if (raw.length <= 18) return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return this.language === 'zh'
      ? `${raw.slice(0, 4)}…（${raw.length} 位）`
      : `${raw.slice(0, 4)}… (${raw.length} digits)`;
  }

  solverHintParams(hint) {
    const details = hint.details || {};
    const params = {
      ...details,
      x: hint.target ? hint.target.x + 1 : 0,
      y: hint.target ? hint.target.y + 1 : 0,
      z: hint.target ? hint.target.z + 1 : 0,
      layouts: this.formatSolverCount(details.totalWays),
      minePercent: `${((details.mineProbability ?? 0) * 100).toFixed(1)}%`,
      safePercent: `${((details.safeProbability ?? 1) * 100).toFixed(1)}%`,
      densityPercent: `${((details.localDensity ?? 0) * 100).toFixed(1)}%`,
    };
    const [a, b] = hint.evidence || [];
    if (a) Object.assign(params, { ax: a.x + 1, ay: a.y + 1, az: a.z + 1, aNumber: a.count });
    if (b) Object.assign(params, { bx: b.x + 1, by: b.y + 1, bz: b.z + 1, bNumber: b.count });
    return params;
  }

  renderSolverHint(hint) {
    const result = document.getElementById('solver-hint-result');
    const badge = document.getElementById('solver-hint-badge');
    const target = document.getElementById('solver-hint-target');
    const reason = document.getElementById('solver-hint-reason');
    const action = document.getElementById('solver-hint-action');
    if (!result || !hint) return;
    const error = ['inconsistent', 'too-complex', 'complete'].includes(hint.status);
    const type = error ? 'error' : (hint.certainty === 'guess' ? 'guess' : (hint.action === 'flag' ? 'mine' : 'safe'));
    result.classList.remove('hidden', 'safe', 'mine', 'guess', 'error');
    result.classList.add(type);
    const params = this.solverHintParams(hint);
    badge.textContent = this.t(error ? `solver.badge.${hint.status}` : (hint.certainty === 'guess' ? 'solver.badge.guess' : 'solver.badge.certain'));
    target.textContent = hint.target
      ? this.t(hint.action === 'flag' ? 'solver.target.mine' : 'solver.target.safe', params)
      : this.t(`solver.target.${hint.status}`);
    reason.textContent = this.t(`solver.reason.${hint.rule}`, params);
    action.textContent = error ? '' : this.t(hint.certainty === 'guess' ? 'solver.action.guess' : `solver.action.${hint.action}`);
    this.syncSolverHintButton();
  }

  createSolverHintMarkers(hint) {
    this.clearSolverHintMarkers();
    if (!hint?.target) return;
    const cell = this.grid[hint.target.x]?.[hint.target.y]?.[hint.target.z];
    if (!cell) return;
    const color = hint.certainty === 'guess' ? 0xffb347 : (hint.action === 'flag' ? 0xff4fd8 : 0x29e7ff);
    const marker = new THREE.Group();
    const box = new THREE.BoxGeometry(1.08, 1.08, 1.08);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    outline.renderOrder = 997;
    marker.add(outline);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.3, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
    );
    arrow.position.y = 0.76;
    arrow.rotation.z = Math.PI;
    arrow.renderOrder = 998;
    marker.add(arrow);
    cell.group.add(marker);
    this.solverHintMarker = marker;

    for (const point of hint.evidence || []) {
      const evidenceCell = this.grid[point.x]?.[point.y]?.[point.z];
      if (!evidenceCell) continue;
      const evidenceMarker = this.createEvidenceReticle();
      evidenceMarker.renderOrder = 996;
      evidenceCell.group.add(evidenceMarker);
      this.solverHintEvidenceMarkers.push(evidenceMarker);
    }
  }

  showTaskCompletion() {
    const mission = this.taskMission;
    const completionArt = {
      easy: ['finish', 'main'],
      medium: ['ready', 'tip'],
      hard: ['main', 'main', 'main'],
    }[mission] ?? ['main', 'main', 'main'];
    const steps = [
      { artKey: completionArt[0], titleKey: `task.${mission}.completeTitle`, messageKey: `task.${mission}.complete.1`, factText: this.t('tutorial.completionFact', { time: this.formatTime(this.timer) }), buttonKey: 'tutorial.next' },
      { artKey: completionArt[1], titleKey: `task.${mission}.completeTitle`, messageKey: `task.${mission}.complete.2`, buttonKey: mission === 'easy' ? 'tutorial.enterMedium' : (mission === 'medium' ? 'tutorial.enterHard' : 'tutorial.next') },
    ];
    if (mission === 'hard') {
      steps.push({ artKey: completionArt[2], titleKey: 'task.hard.finalTitle', messageKey: 'task.hard.complete.3', factKey: 'task.hard.complete.fact', buttonKey: 'tutorial.continue' });
    }
    const nextMission = mission === 'easy' ? 'medium' : (mission === 'medium' ? 'hard' : null);
    this.showSilverWolfDialogue(steps, {
      onComplete: nextMission ? () => this.advanceTaskMission(nextMission) : null,
    });
  }

  advanceTaskMission(mission) {
    const config = TASK_MISSIONS[mission];
    if (!config) return;
    this.stopGuidedTutorial();
    this.taskMission = mission;
    this.pendingTaskMission = mission;
    this.taskExperienceStarted = false;
    if (mission === 'medium') this.mediumChordTipShown = false;
    this.applyStoryArt('solo', mission);
    document.querySelectorAll('.btn-preset').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.w) === config.width);
    });
    document.getElementById('input-w').value = config.width;
    document.getElementById('input-h').value = config.height;
    document.getElementById('input-d').value = config.depth;
    document.getElementById('input-m').value = config.mineCount;
    this.roomClient.send({ op: 'restart', config }).catch(error => this.handleRoomError(error));
  }

  syncGameModeUI() {
    const solo = this.gameMode === 'solo';
    const showTutorialChecklist = solo && this.taskMission === 'easy';
    document.body.dataset.gameMode = solo ? 'task' : 'multiplayer';
    document.getElementById('solo-guide-section').classList.toggle('hidden', !showTutorialChecklist);
    document.getElementById('player-list-section').classList.toggle('hidden', solo);
    document.getElementById('chat-section').classList.toggle('hidden', solo);
    document.getElementById('btn-copy-invite').style.display = solo ? 'none' : (this.currentPlayerId ? '' : 'none');
    this.applyStoryArt(this.gameMode, this.taskMission);
    this.updateSoloGuide();
    this.updateMissionGuide();
  }

  renderPlayers(players) {
    const ul = document.getElementById('player-list-ul');
    if (!ul) return;
    ul.replaceChildren();
    for (const player of players || []) {
      const li = document.createElement('li');
      li.style.cssText = 'padding:5px 0;border-bottom:1px dashed rgba(255,255,255,0.1);';
      const dot = document.createElement('span');
      dot.style.color = player.connected ? '#29e7ff' : '#667788';
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
      div.style.color = '#ff75c8';
      div.style.fontStyle = 'italic';
      div.innerText = data.message;
    } else {
      const name = document.createElement('strong');
      name.style.color = '#29e7ff';
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
      document.getElementById('mobile-stat-time').innerText = '00:00';
      return;
    }
    const offset = Number(serverTime || Date.now()) - Date.now();
    const update = () => {
      this.timer = Math.max(0, Math.floor((Date.now() + offset - startedAt) / 1000));
      const formatted = this.formatTime(this.timer);
      document.getElementById('stat-time').innerText = formatted;
      document.getElementById('mobile-stat-time').innerText = formatted;
    };
    update();
    if (running) this.timerInterval = setInterval(update, 1000);
  }

  syncRevival(snapshot) {
    const title = document.getElementById('ad-modal-title');
    const button = document.getElementById('btn-watch-ad');
    const endButton = document.getElementById('btn-ad-die');
    const message = document.getElementById('ad-modal-message');
    document.getElementById('ad-modal-overlay').classList.remove('hidden');
    clearInterval(this.revivalTimer);
    if (!snapshot.reviveEndsAt) {
      title.textContent = this.t('revive.title');
      button.disabled = false;
      button.innerText = this.t('revive.watch');
      endButton.disabled = false;
      endButton.style.display = '';
      message.textContent = this.t('revive.prompt');
      return;
    }
    button.disabled = true;
    endButton.style.display = 'none';
    title.textContent = this.t('revive.watchingTitle');
    const starter = snapshot.reviveStartedBy;
    if (starter?.id === this.currentPlayerId) message.textContent = this.t('revive.playingSelf');
    else if (starter) message.textContent = this.t('revive.playingTeammate', { name: starter.name });
    else message.textContent = this.t('revive.playing');
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
    cell.revealAnimationId = (cell.revealAnimationId ?? 0) + 1;
    if (cell.mineInstance) {
      cell.group.remove(cell.mineInstance);
      cell.mineInstance = null;
    }

    // 用全新的方块外壳替换爆炸动画操作过的对象，避免旧动画在回溯后再次将它隐藏。
    cell.group.remove(cell.mesh);
    cell.group.remove(cell.outline);
    const blockMesh = new THREE.Mesh(this.geometries.cell, this.materials.cellUnrevealed);
    blockMesh.userData = { x: cell.x, y: cell.y, z: cell.z, type: 'cell' };
    const lineSegments = new THREE.LineSegments(this.geometries.edges, this.materials.wireframe);
    cell.group.add(blockMesh);
    cell.group.add(lineSegments);
    cell.mesh = blockMesh;
    cell.outline = lineSegments;

    cell.isMine = false;
    cell.isRevealed = false;
    cell.neighborMines = 0;
    if (this.hoveredCell === cell) this.hoveredCell = null;
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
    document.querySelectorAll('.btn-preset').forEach((button) => {
      const matches = Number(button.dataset.w) === this.width
        && Number(button.dataset.h) === this.height
        && Number(button.dataset.d) === this.depth
        && Number(button.dataset.m) === this.mineCount;
      button.classList.toggle('active', matches);
    });
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

    const dirLight1 = new THREE.DirectionalLight(0x29e7ff, 0.7);
    dirLight1.position.set(10, 20, 15);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff4fd8, 0.42);
    dirLight2.position.set(-15, -10, -10);
    this.scene.add(dirLight2);

    this.createReasoningCoordinateAxes();

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
      color: 0x6d5dfc,
      transparent: true,
      opacity: 0.15,
      roughness: 0.2,
      transmission: 0.6,
      thickness: 0.5,
      clearcoat: 0.8
    });
    
    this.materials.cellHovered = new THREE.MeshPhysicalMaterial({
      color: 0x29e7ff,
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
    dom.addEventListener('mousedown', (e) => {
      if ((e.buttons & 3) !== 3 || this.mouseChordTriggered) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.mouseChordTriggered = true;
      this.clearPointerHighlights();
      this.chordAtPointer(e);
    }, { capture: true });
    dom.addEventListener('pointerdown', (e) => {
      this.mouseDownPos.x = e.clientX;
      this.mouseDownPos.y = e.clientY;
      this.mouseDownTime = performance.now();
      this.touchHoldTriggered = false;
      this.touchInspectionActive = false;
      clearTimeout(this.touchHoldTimer);
      if (e.button === 2) {
        this.startNeighborInspection(e);
      } else if (e.pointerType === 'touch') {
        this.activeTouchPointers.add(e.pointerId);
        if (this.activeTouchPointers.size > 1) {
          this.touchGestureHadMultiplePointers = true;
          this.touchHoldTimer = null;
          return;
        }
        const touchPoint = { clientX: e.clientX, clientY: e.clientY };
        this.touchHoldTimer = window.setTimeout(() => {
          this.touchHoldTimer = null;
          this.touchHoldTriggered = true;
          window.getSelection?.()?.removeAllRanges();
          this.startNeighborInspection(touchPoint);
          this.touchInspectionActive = Boolean(this.activeHighlightCenter);
          if (this.touchInspectionActive) navigator.vibrate?.(18);
        }, 420);
      }
    }, { capture: true });
    dom.addEventListener('pointerup', (e) => {
      clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
      if (e.pointerType === 'mouse' && this.mouseChordTriggered) {
        if ((e.buttons & 3) === 0) this.mouseChordTriggered = false;
        this.clearPointerHighlights();
        return;
      }
      const wasMultiTouchGesture = e.pointerType === 'touch' && (
        this.touchGestureHadMultiplePointers || this.activeTouchPointers.size > 1
      );
      if (e.pointerType === 'touch') this.activeTouchPointers.delete(e.pointerId);
      if (e.pointerType === 'touch' && this.touchHoldTriggered) {
        if (this.touchInspectionActive) this.clearPointerHighlights();
        this.touchInspectionActive = false;
        this.touchHoldTriggered = false;
        if (this.activeTouchPointers.size === 0) this.touchGestureHadMultiplePointers = false;
        return;
      }
      if (wasMultiTouchGesture) {
        if (this.activeTouchPointers.size === 0) this.touchGestureHadMultiplePointers = false;
        return;
      }
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeElapsed = performance.now() - this.mouseDownTime;
      if (distance >= 5 && this.gameMode === 'solo') {
        this.hasObservedMatrix = true;
        this.updateSoloGuide();
        this.completeTutorialAction('observe');
      }
      
      const clickDistance = e.pointerType === 'touch' ? 12 : 5;
      const clickDuration = e.pointerType === 'touch' ? 500 : 250;
      if (distance < clickDistance && timeElapsed < clickDuration) {
        this.handleCanvasClick(e);
      }
      if (e.pointerType === 'touch' && this.activeTouchPointers.size === 0) {
        this.touchGestureHadMultiplePointers = false;
      }
    });

    const stopNeighborInspection = (event) => {
      if (event.pointerType === 'mouse' && (event.buttons & 3) === 0) this.mouseChordTriggered = false;
      if (event.type === 'pointercancel') {
        clearTimeout(this.touchHoldTimer);
        this.touchHoldTimer = null;
        this.touchHoldTriggered = false;
        this.touchInspectionActive = false;
        if (event.pointerType === 'touch') this.activeTouchPointers.delete(event.pointerId);
        if (this.activeTouchPointers.size === 0) this.touchGestureHadMultiplePointers = false;
      }
      if (event.type === 'pointerup' && event.button !== 2) return;
      this.clearPointerHighlights();
    };
    window.addEventListener('pointerup', stopNeighborInspection);
    window.addEventListener('pointercancel', stopNeighborInspection);

    // 鼠标移动监听，用于方块 Hover 效果
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && this.touchHoldTimer) {
        const dx = e.clientX - this.mouseDownPos.x;
        const dy = e.clientY - this.mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(this.touchHoldTimer);
          this.touchHoldTimer = null;
        }
      }
      this.handlePointerMove(e);
    });
    dom.addEventListener('pointerleave', (event) => {
      clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
      this.touchHoldTriggered = false;
      this.touchInspectionActive = false;
      if (event.pointerType === 'touch') this.activeTouchPointers.delete(event.pointerId);
      if (this.activeTouchPointers.size === 0) this.touchGestureHadMultiplePointers = false;
      this.clearPointerHighlights();
    });
    dom.addEventListener('contextmenu', (event) => event.preventDefault());
    dom.addEventListener('selectstart', (event) => event.preventDefault());
    dom.addEventListener('dragstart', (event) => event.preventDefault());
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

    this.clearGuidedTarget();
    this.clearSolverHint();

    // 重置状态
    this.isFirstClick = true;
    this.isGameOver = false;
    this.isGameWon = false;
    this.isInteractionLocked = false;
    this.revealedCount = 0;
    this.flaggedCount = 0;
    this.hoveredCell = null;
    this.activeHighlightCenter = null;
    this.hasObservedMatrix = false;
    this.hasInspectedNeighbors = false;
    this.hasUsedSlices = false;
    this.hasResetSlices = false;
    this.slice.xMin = 0; this.slice.xMax = this.width - 1;
    this.slice.yMin = 0; this.slice.yMax = this.height - 1;
    this.slice.zMin = 0; this.slice.zMax = this.depth - 1;
    this.syncSliceSlidersUI();
    
    // 重置计时器
    this.timer = 0;
    document.getElementById('stat-time').innerText = "00:00";
    document.getElementById('mobile-stat-time').innerText = "00:00";
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
            spriteInstance: null,
            revealAnimationId: 0
          };
        }
      }
    }

    this.positionReasoningCoordinateAxes(true);

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
  handleMobileNumberTap(x, y, z) {
    const now = performance.now();
    const previous = this.lastMobileNumberTap;
    const sameNumber = previous
      && previous.x === x
      && previous.y === y
      && previous.z === z
      && now - previous.at <= this.mobileDoubleTapMs;
    if (!sameNumber) {
      this.lastMobileNumberTap = { x, y, z, at: now };
      return;
    }
    this.lastMobileNumberTap = null;
    navigator.vibrate?.(12);
    this.chord(x, y, z);
  }

  chordAtPointer(event) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) return;
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          if (!cell.group.visible) continue;
          if (!cell.isRevealed) targets.push(cell.mesh);
          else if (cell.spriteInstance) targets.push(cell.spriteInstance);
        }
      }
    }

    const target = this.raycaster.intersectObjects(targets)[0]?.object;
    if (target?.userData.type !== 'number') return;
    const { x, y, z } = target.userData;
    this.chord(x, y, z);
  }

  handleCanvasClick(event) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) return;

    // 计算鼠标在 3D Viewport 中的标准化坐标 (-1 到 1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 只拾取当前可见的方块或数字
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
      const topObject = intersects[0].object;
      if (event.pointerType === 'touch' && topObject.userData.type === 'number') {
        const { x, y, z } = topObject.userData;
        this.handleMobileNumberTap(x, y, z);
        return;
      }
      if (event.pointerType === 'touch') this.lastMobileNumberTap = null;
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

  startNeighborInspection(event) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) return;
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          if (!cell.group.visible) continue;
          if (!cell.isRevealed) targets.push(cell.mesh);
          else if (cell.spriteInstance) targets.push(cell.spriteInstance);
        }
      }
    }

    const target = this.raycaster.intersectObjects(targets)[0]?.object;
    if (target?.userData.type !== 'number') return;
    const { x, y, z } = target.userData;
    if (this.hoveredCell && !this.hoveredCell.isRevealed) {
      this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
      this.hoveredCell.outline.material = this.materials.wireframe;
    }
    this.hoveredCell = null;
    this.highlightNeighborsOn(x, y, z);
    this.activeHighlightCenter = { x, y, z };
    this.hasInspectedNeighbors = true;
    this.updateSoloGuide();
    this.completeTutorialAction('inspect');
  }

  // 右键按住数字时高亮显示周围的邻居格子
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

  clearPointerHighlights() {
    if (this.activeHighlightCenter) {
      const { x, y, z } = this.activeHighlightCenter;
      this.highlightNeighborsOff(x, y, z);
      this.activeHighlightCenter = null;
    }
    if (this.hoveredCell && !this.hoveredCell.isRevealed) {
      this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
      this.hoveredCell.outline.material = this.materials.wireframe;
    }
    this.hoveredCell = null;
  }

  // 监听鼠标悬浮移动，提供科技感的 Hover 提示
  handlePointerMove(event) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) return;

    if (this.activeHighlightCenter) {
      if (this.hoveredCell && !this.hoveredCell.isRevealed) {
        this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.materials.cellFlagged : this.materials.cellUnrevealed;
        this.hoveredCell.outline.material = this.materials.wireframe;
      }
      this.hoveredCell = null;
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
          if (!cell.group.visible) continue;
          if (!cell.isRevealed) targets.push(cell.mesh);
        }
      }
    }

    const intersects = this.raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
      const hoveredObject = intersects[0].object;
      const { x, y, z } = hoveredObject.userData;
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
    if (this.isInteractionLocked) return;
    if (!this.isGuidedActionAllowed('dig', x, y, z)) return;
    const cell = this.grid[x][y][z];
    if (cell.isRevealed || cell.isFlagged) return;
    this.roomClient.send({ op: 'dig', x, y, z }).catch(error => this.handleRoomError(error));
  }

  chord(x, y, z) {
    if (this.isInteractionLocked) return;
    if (!this.isGuidedActionAllowed('chord', x, y, z)) return;
    const cell = this.grid[x]?.[y]?.[z];
    if (!cell?.isRevealed || cell.neighborMines <= 0) return;
    const flaggedAround = this.getNeighbors(x, y, z)
      .filter((point) => this.grid[point.x][point.y][point.z].isFlagged)
      .length;
    if (flaggedAround !== cell.neighborMines) return;
    this.roomClient.send({ op: 'chord', x, y, z }).catch(error => this.handleRoomError(error));
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
    if (this.gameMode === 'solo') {
      this.isGameOver = true;
      setTimeout(() => this.showTaskRewindModal(), 1200);
      return;
    }

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

  showTaskRewindModal() {
    if (this.gameMode !== 'solo' || this.roomSnapshot?.phase !== 'revive') return;
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const closeButton = document.getElementById('btn-modal-close');
    const restartButton = document.getElementById('btn-modal-restart');

    this.modalAction = 'rewind';
    document.getElementById('modal-icon').innerText = '↺';
    title.innerText = this.t('task.result.lostTitle');
    title.className = 'modal-title text-glow-red';
    document.getElementById('modal-message').innerText = this.t('task.result.lostMessage');
    closeButton.style.display = 'none';
    restartButton.innerText = this.t('task.result.rewind');
    document.getElementById('modal-stat-time').innerText = this.formatTime(this.timer);
    const totalSafeCells = this.width * this.height * this.depth - this.mineCount;
    const progress = Math.round((this.revealedCount / totalSafeCells) * 100);
    document.getElementById('modal-stat-progress').innerText = `${progress}%`;
    modal.classList.remove('hidden');
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
    const animationId = (cell.revealAnimationId ?? 0) + 1;
    cell.revealAnimationId = animationId;
    
    let scale = 1.0;
    const shrink = () => {
      if (cell.revealAnimationId !== animationId) return;
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
      1: '#29e7ff', // 量子青
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
    if (this.isInteractionLocked) return;
    if (!this.isGuidedActionAllowed('flag', x, y, z)) return;
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
      const closeButton = document.getElementById('btn-modal-close');
      const restartButton = document.getElementById('btn-modal-restart');

      this.modalAction = 'restart';
      icon.innerText = "💀";
      title.innerText = this.storyT('result.lostTitle');
      title.className = "modal-title text-glow-red";
      msg.innerText = this.storyT('result.lostMessage');
      closeButton.style.display = '';
      restartButton.innerText = this.t('result.restart');
      
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
      setTimeout(() => this.particles.createExplosion(centerPos, 0x29e7ff, 100), 200);
      setTimeout(() => this.particles.createExplosion(centerPos, 0xff4fd8, 100), 400);

      // 任务模式由银狼亲自给出章节结算；多人模式保留战绩弹窗
      if (this.gameMode === 'solo') {
        setTimeout(() => this.showTaskCompletion(), 1200);
        return;
      }
      setTimeout(() => {
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const msg = document.getElementById('modal-message');
        const icon = document.getElementById('modal-icon');

        this.modalAction = 'restart';
        icon.innerText = "🏆";
        title.innerText = this.storyT('result.wonTitle');
        title.className = "modal-title text-glow-green";
        msg.innerText = this.storyT('result.wonMessage');
        document.getElementById('btn-modal-close').style.display = '';
        document.getElementById('btn-modal-restart').innerText = this.t('result.restart');
        
        document.getElementById('modal-stat-time').innerText = this.formatTime(this.timer);
        document.getElementById('modal-stat-progress').innerText = "100%";
        
        modal.classList.remove('hidden');
      }, 1500);
    }
  }

  // -------------------------------------------------------------
  // 10. 本地切片视图
  // -------------------------------------------------------------
  isSliceFull() {
    return this.slice.xMin === 0 && this.slice.xMax === this.width - 1
      && this.slice.yMin === 0 && this.slice.yMax === this.height - 1
      && this.slice.zMin === 0 && this.slice.zMax === this.depth - 1;
  }

  handleSliceChange(axis, type) {
    const minElement = document.getElementById(`slice-${axis}-min`);
    const maxElement = document.getElementById(`slice-${axis}-max`);
    let minValue = Number.parseInt(minElement.value, 10);
    let maxValue = Number.parseInt(maxElement.value, 10);
    if (type === 'min' && minValue > maxValue) {
      maxValue = minValue;
      maxElement.value = String(maxValue);
    } else if (type === 'max' && maxValue < minValue) {
      minValue = maxValue;
      minElement.value = String(minValue);
    }
    this.slice[`${axis}Min`] = minValue;
    this.slice[`${axis}Max`] = maxValue;
    this.updateSliceValue(axis);
    this.clearPointerHighlights();
    this.updateGridVisibility();
    if (!this.isSliceFull()) {
      this.hasUsedSlices = true;
      if (this.waitingTutorialAction === 'slice') this.completeTutorialAction('slice');
    }
  }

  updateSliceValue(axis) {
    const minValue = this.slice[`${axis}Min`];
    const maxValue = this.slice[`${axis}Max`];
    const output = document.getElementById(`val-slice-${axis}`);
    if (output) output.textContent = `${minValue + 1}–${maxValue + 1}`;
    document.getElementById(`slice-${axis}-min`)?.setAttribute('aria-valuetext', String(minValue + 1));
    document.getElementById(`slice-${axis}-max`)?.setAttribute('aria-valuetext', String(maxValue + 1));
  }

  updateGridVisibility() {
    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let z = 0; z < this.depth; z += 1) {
          const cell = this.grid[x]?.[y]?.[z];
          if (!cell) continue;
          cell.group.visible = x >= this.slice.xMin && x <= this.slice.xMax
            && y >= this.slice.yMin && y <= this.slice.yMax
            && z >= this.slice.zMin && z <= this.slice.zMax;
        }
      }
    }
  }

  syncSliceSlidersUI() {
    const dimensions = { x: this.width, y: this.height, z: this.depth };
    for (const axis of ['x', 'y', 'z']) {
      const minElement = document.getElementById(`slice-${axis}-min`);
      const maxElement = document.getElementById(`slice-${axis}-max`);
      if (!minElement || !maxElement) continue;
      const maxIndex = dimensions[axis] - 1;
      minElement.max = String(maxIndex);
      maxElement.max = String(maxIndex);
      minElement.value = String(this.slice[`${axis}Min`]);
      maxElement.value = String(this.slice[`${axis}Max`]);
      this.updateSliceValue(axis);
    }
  }

  resetSlices(userInitiated = false) {
    const hadReducedView = !this.isSliceFull() || this.hasUsedSlices;
    this.slice.xMin = 0; this.slice.xMax = this.width - 1;
    this.slice.yMin = 0; this.slice.yMax = this.height - 1;
    this.slice.zMin = 0; this.slice.zMax = this.depth - 1;
    this.syncSliceSlidersUI();
    this.updateGridVisibility();
    if (userInitiated && hadReducedView) {
      this.hasResetSlices = true;
      if (this.waitingTutorialAction === 'sliceReset') this.completeTutorialAction('sliceReset');
    }
  }

  // -------------------------------------------------------------
  // 11. 统计面板数据同步
  // -------------------------------------------------------------
  updateStats() {
    // 标记数与总雷数
    const mineStatus = `${this.flaggedCount} / ${this.mineCount}`;
    document.getElementById('stat-mines').innerText = mineStatus;
    document.getElementById('mobile-stat-mines').innerText = mineStatus;
    
    // 计算空间净化率进度条
    const totalCells = this.width * this.height * this.depth;
    const safeCells = totalCells - this.mineCount;
    const progress = safeCells > 0 ? (this.revealedCount / safeCells) : 0;
    const progressPercent = Math.min(100, Math.round(progress * 100));
    
    document.getElementById('stat-progress-percent').innerText = `${progressPercent}%`;
    document.getElementById('stat-progress').style.width = `${progressPercent}%`;
    document.getElementById('mobile-stat-progress').innerText = `${progressPercent}%`;
    this.updateMissionGuide(progressPercent);
  }

  updateMissionGuide(progressPercent = null) {
    const totalCells = this.width * this.height * this.depth;
    const safeCells = Math.max(1, totalCells - this.mineCount);
    const progress = progressPercent ?? Math.min(100, Math.round((this.revealedCount / safeCells) * 100));
    const objective = document.getElementById('mission-objective');
    const dialogue = document.getElementById('mission-dialogue');
    const bar = document.getElementById('mission-progress');
    if (!objective || !dialogue || !bar) return;

    let state = 'ready';
    if (this.isGameWon || progress >= 100) state = 'won';
    else if (this.isGameOver) state = 'lost';
    else if (progress >= 70) state = 'final';
    else if (progress >= 35) state = 'mid';
    else if (progress > 0) state = 'started';

    objective.textContent = this.storyT(`mission.objective.${state}`, { progress });
    dialogue.textContent = this.storyT(`mission.dialogue.${state}`);
    bar.style.width = `${progress}%`;
    this.updateSoloGuide();
  }

  updateSoloGuide() {
    if (this.gameMode !== 'solo') return;
    if (this.revealedCount > 0) this.completeTutorialAction('scan');
    if (this.flaggedCount > 0) this.completeTutorialAction('mark');
    if (this.taskMission !== 'easy') return;
    const flagged = new Set((this.roomSnapshot?.flags || []).map((point) => this.pointKey(point)));
    const tutorialMines = this.roomSnapshot?.tutorialMines || [];
    const allTutorialMinesFlagged = tutorialMines.length > 0 && tutorialMines.every((point) => flagged.has(this.pointKey(point)));
    const states = [
      { id: 'solo-step-guided-start', complete: this.revealedCount > 0 },
      { id: 'solo-step-guided-mines', complete: allTutorialMinesFlagged },
      { id: 'solo-step-guided-clear', complete: this.isGameWon },
    ];
    const completed = states.filter(step => step.complete).length;
    const activeIndex = states.findIndex(step => !step.complete);
    for (const [index, step] of states.entries()) {
      const element = document.getElementById(step.id);
      if (!element) continue;
      element.classList.toggle('complete', step.complete);
      element.classList.toggle('active', index === activeIndex);
    }
    const count = document.getElementById('solo-guide-count');
    if (count) count.textContent = `${completed} / ${states.length}`;
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
    this.positionReasoningCoordinateAxes(true);
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

    if (this.guidedTargetMarker) {
      const pulse = 1 + Math.sin(performance.now() * 0.007) * 0.09;
      this.guidedTargetMarker.scale.setScalar(pulse);
      const evidenceOpacity = 0.68 + Math.sin(performance.now() * 0.005) * 0.24;
      for (const marker of this.guidedEvidenceMarkers) marker.material.opacity = evidenceOpacity;
      this.updateGuidedPointerPosition();
    }

    if (this.solverHintMarker) {
      const hintPulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
      this.solverHintMarker.scale.setScalar(hintPulse);
      const evidenceOpacity = 0.64 + Math.sin(performance.now() * 0.0045) * 0.24;
      for (const marker of this.solverHintEvidenceMarkers) marker.material.opacity = evidenceOpacity;
    }

    if (this.guidedTutorialTarget || this.solverHint?.target) this.positionReasoningCoordinateAxes();

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
