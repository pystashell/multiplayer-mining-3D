import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomClient } from './room-client.js?v=20260717-reduction-hint-4';
import { initialLanguage, randomNickname, translateForInput } from './i18n.js?v=20260719-chord-target-1';
import {
  detectInitialInputMode,
  inputModeFromPointerType,
} from './input-mode.js?v=20260718-input-copy-1';
import { solveMinesweeperHint } from './minesweeper-solver.js';
import {
  chordOpportunityAt,
  findChordOpportunity,
  findNewChordOpportunity,
  isNewSuccessfulChord,
} from './tutorial-triggers.js?v=20260719-chord-target-1';
import { chooseFloatingAxisPlacement, chooseGuidedCalloutPlacement } from './guided-callout.js';
import {
  BOARD_ANIMATION_TIMING,
  revealAnimationTiming,
  sectorPurgeAnimationTiming,
} from './reveal-animation.js';
import {
  intersectionHitsVisibleNumberPixel,
  mergeTwoButtonState,
  resolveTwoButtonGestureTargets,
  resolveTwoButtonRayHits,
  targetFromFocusedCell,
  targetFromFocusedNumber,
} from './pointer-targeting.js';
import {
  CONTROL_PRESETS,
  cloneControlSettings,
  controlPresetForSettings,
  formatControlKey,
  isBindableControlKey,
  loadControlSettings,
  normalizeWheelDelta,
  saveControlSettings,
  validateControlSettings,
  wheelActionForEvent,
} from './control-settings.js';

const TASK_MISSIONS = Object.freeze({
  easy: Object.freeze({ width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', autoPurge: false, reduction: false, campaign: true }),
  medium: Object.freeze({ width: 5, height: 5, depth: 5, mineCount: 10, ruleset: 'sector', autoPurge: true, reduction: false, campaign: true }),
  hard: Object.freeze({ width: 7, height: 7, depth: 7, mineCount: 30, ruleset: 'reduction', autoPurge: true, reduction: true, campaign: true }),
  ultimate: Object.freeze({ width: 9, height: 9, depth: 9, mineCount: 60, ruleset: 'reduction', autoPurge: true, reduction: true, campaign: true }),
});

const FREEPLAY_DEFAULT_ADDONS = Object.freeze({
  ruleset: 'reduction',
  autoPurge: true,
  reduction: true,
  campaign: false,
});

const CONFIG_KEYS = Object.freeze([
  'width', 'height', 'depth', 'mineCount', 'ruleset', 'autoPurge', 'reduction', 'campaign',
]);

const LOBBY_ENTRY_TIMEOUT_MS = 25000;

function rulesetForFeatures(autoPurge, reduction) {
  if (reduction) return 'reduction';
  if (autoPurge) return 'sector';
  return 'classic';
}

const STORY_ART = Object.freeze({
  easy: 'assets/silver-wolf-quantum-pathfinder.png',
  medium: 'assets/silver-wolf-neighbor-hack.png',
  hard: 'assets/silver-wolf-final-protocol.png',
  ultimate: 'assets/silver-wolf-final-protocol.png',
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
  ultimate: Object.freeze({
    main: STORY_ART.ultimate,
  }),
});

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
    this.texture = this.createParticleTexture();
  }

  createParticleTexture() {
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
    return new THREE.CanvasTexture(canvas);
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
    
    const material = new THREE.PointsMaterial({
      size: 0.25,
      map: this.texture,
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
    const frameScale = Math.min(3, deltaTime * 60);
    const drag = Math.pow(0.96, frameScale);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * frameScale;
      
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
        p.velocities[j * 3] *= drag;
        p.velocities[j * 3 + 1] *= drag;
        p.velocities[j * 3 + 2] *= drag;
        
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
    this.inputMode = detectInitialInputMode({
      matchMedia: window.matchMedia?.bind(window),
      maxTouchPoints: navigator.maxTouchPoints,
    });
    document.body.dataset.inputMode = this.inputMode;
    this.generatedNickname = randomNickname(this.language);
    this.gameMode = 'solo';
    this.hasInspectedNeighbors = false;
    this.taskMission = 'easy';
    this.taskFlow = 'campaign';
    this.pendingTaskMission = null;
    this.pendingTaskConfig = null;
    this.taskExperienceStarted = false;
    this.dialogueState = null;
    this.waitingTutorialAction = null;
    this.guidedTutorialActive = false;
    this.beginnerBoardInputLocked = false;
    this.guidedTutorialTarget = null;
    this.guidedTargetMarker = null;
    this.guidedEvidenceMarkers = [];
    this.guidedInspectExplained = false;
    this.guidedInspectLessonActive = false;
    this.guidedFlagModeExplained = false;
    this.guidedTutorialStep = 0;
    this.guidedTutorialProgressSignature = null;
    this.guidedPendingAction = null;
    this.guidedRecoveryPending = false;
    this.guidedRecoveryRevision = null;
    this.mediumChordTipShown = false;
    this.mediumChordObjectiveActive = false;
    this.mediumChordObjectiveTarget = null;
    this.mediumChordObjectiveMarker = null;
    this.lobbyEntryPending = false;
    this.lobbyEntryTimer = null;
    this.lobbyEntryRetryReady = false;
    this.lobbyEntryButtonId = null;
    this.guidedCorrectionTimer = null;
    this.solverHint = null;
    this.solverHintCollapsed = false;
    this.solverHintMarker = null;
    this.solverHintEvidenceMarkers = [];
    this.reasoningCoordinateAxes = null;
    this.lastReasoningAxesLayoutAt = 0;
    this.sectorPurgeAnimations = [];
    this.cellRevealAnimations = [];
    this.boardAnimationGeneration = 0;
    this.revealAnimationEndsAt = 0;
    this.successReplay = null;
    this.successReplayTimer = null;
    this.pendingReplaySnapshot = null;
    this.ultimateHackClient = null;
    this.ultimateHackStepTimer = null;
    this.ultimateHackStartPending = false;
    this.automatedFlagKeys = new Set();
    this.lastSectorPurgeId = null;
    this.sectorPurgeBannerTimer = null;
    this.returningToLobby = false;
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
    this.controlSettings = loadControlSettings();
    this.pendingControlSettings = null;
    this.controlKeyCaptureField = null;
    this.cameraPointerStartDirection = null;
    this.particles = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // 游戏核心状态
    this.width = 3;
    this.height = 3;
    this.depth = 3;
    this.mineCount = 3;
    this.ruleset = 'classic';
    this.autoPurgeEnabled = false;
    this.reductionEnabled = false;
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
    
    // 鼠标点击判定辅助
    this.mouseDownPos = { x: 0, y: 0 };
    this.mouseDownTime = 0;
    this.mouseChordTriggered = false;
    this.mouseChordButtons = 0;
    this.mouseChordAnchor = null;
    this.mouseChordFocusTarget = null;
    this.lastMobileNumberTap = null;
    this.lastMobileCellTap = null;
    this.automatedFlagKeys = new Set();
    this.mobileDoubleTapMs = 450;
    this.mobileCellDoubleTapMs = 320;
    this.touchHoldTimer = null;
    this.touchHoldTriggered = false;
    this.touchInspectionActive = false;
    this.activeTouchPointers = new Set();
    this.touchGestureHadMultiplePointers = false;
    
    // 共享几何体和材质，优化内存占用
    this.geometries = {};
    this.materials = {};
    this.hoveredCell = null;
    this.hoveredNumberCell = null;
    
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
    this.bindInputModeTracking();
    // Lobby UI
    const readNickname = () => document.getElementById('input-nickname').value.trim();
    const persistNickname = (nickname) => {
      try { localStorage.setItem('holo-sweeper.nickname', nickname); } catch {}
    };
    document.getElementById('btn-lobby-task').addEventListener('click', () => this.selectLobbyMode('solo'));
    document.getElementById('btn-lobby-multiplayer').addEventListener('click', () => this.selectLobbyMode('squad'));
    document.getElementById('btn-return-lobby').addEventListener('click', () => this.returnToLobby());
    document.querySelectorAll('.task-mission-option').forEach((button) => {
      button.addEventListener('click', () => this.selectTaskMission(button.dataset.mission));
    });
    document.getElementById('btn-task-campaign').addEventListener('click', () => this.selectTaskFlow('campaign'));
    document.getElementById('btn-task-freeplay').addEventListener('click', () => this.selectTaskFlow('freeplay'));
    document.getElementById('btn-random-nickname').addEventListener('click', () => this.rollNickname());
    document.getElementById('btn-tutorial-next').addEventListener('click', () => this.advanceSilverWolfDialogue());
    document.getElementById('btn-skip-tutorial').addEventListener('click', () => this.skipTutorial());
    document.getElementById('btn-tutorial-replay').addEventListener('click', () => this.startSuccessReplay());
    document.getElementById('btn-modal-replay').addEventListener('click', () => this.startSuccessReplay());
    document.getElementById('btn-replay-pause').addEventListener('click', () => this.toggleSuccessReplayPause());
    document.getElementById('btn-replay-exit').addEventListener('click', () => this.stopSuccessReplay());
    document.getElementById('btn-ultimate-hack-start').addEventListener('click', () => this.startUltimateHack());
    document.getElementById('btn-ultimate-hack-cancel').addEventListener('click', () => this.cancelUltimateHack());
    const guidedPointer = document.getElementById('guided-cell-pointer');
    guidedPointer.addEventListener('click', () => this.activateGuidedTarget('primary'));
    guidedPointer.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.activateGuidedTarget('secondary');
    });
    document.getElementById('btn-request-solver-hint').addEventListener('click', () => this.requestSolverHint());
    document.getElementById('btn-collapse-solver-hint').addEventListener('click', () => this.toggleSolverHintCollapsed());
    document.getElementById('btn-close-solver-hint').addEventListener('click', () => this.clearSolverHint());
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    document.addEventListener('contextmenu', (event) => {
      if (!event.target.closest('input, textarea')) event.preventDefault();
    }, { capture: true });
    // Advance only when a fresh primary press actually starts on the visible
    // backdrop. Mobile browsers may dispatch a compatibility click after the
    // board touch has already opened this overlay; listening to click here
    // would immediately dismiss a newly shown one-step dialogue.
    tutorialOverlay.addEventListener('pointerdown', (event) => {
      if (
        event.button === 0
        && event.isPrimary !== false
        && event.target === tutorialOverlay
        && !this.currentDialogueRequiresExplicitAction()
      ) {
        event.preventDefault();
        this.advanceSilverWolfDialogue();
      }
    });

    document.getElementById('btn-start-task').addEventListener('click', async () => {
      if (this.retryPendingLobbyConnection('btn-start-task')) return;
      if (this.lobbyEntryPending) return;
      const nickname = readNickname();
      if (!nickname) {
        this.handleRoomError({ code: 'INVALID_NAME' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'solo';
      const mission = TASK_MISSIONS[this.taskMission] ?? TASK_MISSIONS.easy;
      const desired = this.taskFlow === 'campaign'
        ? mission
        : { ...mission, ...FREEPLAY_DEFAULT_ADDONS };
      this.pendingTaskMission = this.taskMission;
      this.pendingTaskConfig = { ...desired };
      this.taskExperienceStarted = false;
      this.mediumChordTipShown = false;
      this.mediumChordObjectiveActive = false;
      this.mediumChordObjectiveTarget = null;
      this.lobbyEntryRetryReady = false;
      this.setLobbyEntryPending(true, 'btn-start-task');
      try {
        await this.roomClient.create(nickname, 'solo');
      } catch (error) {
        this.handleRoomError(error);
      }
    });

    document.getElementById('btn-join-room').addEventListener('click', async () => {
      if (this.retryPendingLobbyConnection('btn-join-room')) return;
      if (this.lobbyEntryPending) return;
      const nickname = readNickname();
      const roomCode = document.getElementById('input-room').value.trim();
      if (!nickname || !roomCode) {
        this.handleRoomError({ code: !nickname ? 'INVALID_NAME' : 'ROOM_CODE' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'squad';
      this.lobbyEntryRetryReady = false;
      this.setLobbyEntryPending(true, 'btn-join-room');
      try {
        await this.roomClient.join(roomCode, nickname);
      } catch (error) {
        this.handleRoomError(error);
      }
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
      if (this.retryPendingLobbyConnection('btn-create-room')) return;
      if (this.lobbyEntryPending) return;
      const nickname = readNickname();
      if (!nickname) {
        this.handleRoomError({ code: 'INVALID_NAME' });
        return;
      }
      persistNickname(nickname);
      this.gameMode = 'squad';
      this.lobbyEntryRetryReady = false;
      this.setLobbyEntryPending(true, 'btn-create-room');
      try {
        await this.roomClient.create(nickname, 'squad');
      } catch (error) {
        this.handleRoomError(error);
      }
    });

    const nicknameInput = document.getElementById('input-nickname');
    let savedNickname = null;
    try { savedNickname = localStorage.getItem('holo-sweeper.nickname'); } catch {}
    if (savedNickname && ['银狼', 'silver wolf'].includes(savedNickname.trim().toLowerCase())) {
      try { localStorage.removeItem('holo-sweeper.nickname'); } catch {}
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
    document.querySelectorAll('[data-feature]').forEach((button) => {
      button.addEventListener('click', () => this.toggleGameFeature(button.dataset.feature));
    });

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

    const openControlSettings = () => this.openControlSettings();
    document.getElementById('btn-control-settings').addEventListener('click', openControlSettings);
    document.getElementById('btn-control-settings-lobby').addEventListener('click', openControlSettings);
    document.getElementById('btn-control-settings-close').addEventListener('click', () => this.closeControlSettings());
    document.getElementById('btn-control-settings-cancel').addEventListener('click', () => this.closeControlSettings());
    document.getElementById('btn-control-settings-save').addEventListener('click', () => this.commitControlSettings());
    document.getElementById('btn-control-settings-reset').addEventListener('click', () => {
      this.pendingControlSettings = cloneControlSettings(CONTROL_PRESETS.classic);
      this.controlKeyCaptureField = null;
      this.setControlSettingsStatus('');
      this.renderControlSettings();
    });
    document.getElementById('control-settings-overlay').addEventListener('click', (event) => {
      if (event.target.id === 'control-settings-overlay') this.closeControlSettings();
    });
    document.querySelectorAll('[data-control-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        this.pendingControlSettings = cloneControlSettings(CONTROL_PRESETS[button.dataset.controlPreset]);
        this.controlKeyCaptureField = null;
        this.setControlSettingsStatus('');
        this.renderControlSettings();
      });
    });
    document.querySelectorAll('[data-control-setting]').forEach((select) => {
      select.addEventListener('change', () => {
        if (!this.pendingControlSettings) this.pendingControlSettings = cloneControlSettings(this.controlSettings);
        this.pendingControlSettings[select.dataset.controlSetting] = select.value;
        this.setControlSettingsStatus('');
        this.renderControlSettings();
      });
    });
    document.querySelectorAll('[data-control-key-field]').forEach((button) => {
      button.addEventListener('click', () => {
        this.controlKeyCaptureField = button.dataset.controlKeyField;
        this.setControlSettingsStatus('');
        this.renderControlSettings();
        button.focus();
      });
      button.addEventListener('keydown', (event) => this.captureControlHotkey(event, button.dataset.controlKeyField));
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
    window.addEventListener('keydown', (event) => this.handleControlShortcut(event));
  }

  openControlSettings() {
    this.closeMobilePanels();
    this.pendingControlSettings = cloneControlSettings(this.controlSettings);
    this.controlKeyCaptureField = null;
    this.setControlSettingsStatus('');
    this.renderControlSettings();
    document.getElementById('control-settings-overlay').classList.remove('hidden');
    document.getElementById('btn-control-settings-close').focus();
  }

  closeControlSettings() {
    document.getElementById('control-settings-overlay').classList.add('hidden');
    this.pendingControlSettings = null;
    this.controlKeyCaptureField = null;
    this.setControlSettingsStatus('');
    document.querySelectorAll('[data-control-key-field]').forEach(button => button.classList.remove('capturing'));
  }

  setControlSettingsStatus(key = '', ok = false) {
    const status = document.getElementById('control-settings-status');
    if (!status) return;
    status.textContent = key ? this.t(key) : '';
    status.classList.toggle('ok', Boolean(key && ok));
  }

  captureControlHotkey(event, field) {
    if (this.controlKeyCaptureField !== field) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      this.controlKeyCaptureField = null;
      this.setControlSettingsStatus('');
      this.renderControlSettings();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !isBindableControlKey(event.code)) {
      this.setControlSettingsStatus('controls.error.invalidKey');
      return;
    }
    if (!this.pendingControlSettings) this.pendingControlSettings = cloneControlSettings(this.controlSettings);
    const duplicate = ['digKey', 'flagKey', 'resetKey']
      .some(keyField => keyField !== field && this.pendingControlSettings[keyField] === event.code);
    if (duplicate) {
      this.setControlSettingsStatus('controls.error.duplicateKeys');
      return;
    }
    this.pendingControlSettings[field] = event.code;
    this.controlKeyCaptureField = null;
    this.setControlSettingsStatus('');
    this.renderControlSettings();
  }

  commitControlSettings() {
    const result = validateControlSettings(this.pendingControlSettings ?? this.controlSettings);
    if (!result.valid) {
      this.setControlSettingsStatus(`controls.error.${result.errors[0]}`);
      return;
    }
    saveControlSettings(result.settings);
    this.controlSettings = result.settings;
    this.applyControlBindings();
    this.updateControlCopy();
    if (this.dialogueState && !this.waitingTutorialAction) this.renderSilverWolfDialogue();
    if (this.waitingTutorialAction) this.setTutorialActionHint(this.waitingTutorialAction);
    this.setControlSettingsStatus('controls.saved', true);
    window.setTimeout(() => this.closeControlSettings(), 180);
  }

  renderControlSettings() {
    const settings = this.pendingControlSettings ?? this.controlSettings;
    if (!settings) return;
    document.querySelectorAll('[data-control-setting]').forEach((select) => {
      select.value = settings[select.dataset.controlSetting];
    });
    const preset = controlPresetForSettings(settings);
    document.querySelectorAll('[data-control-preset]').forEach((button) => {
      const active = button.dataset.controlPreset === preset;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    const presetLabel = this.t(`controls.preset.${preset}`);
    document.getElementById('control-settings-current').textContent = this.t('controls.current', { preset: presetLabel });
    document.querySelectorAll('[data-control-key-field]').forEach((button) => {
      const field = button.dataset.controlKeyField;
      const capturing = this.controlKeyCaptureField === field;
      button.classList.toggle('capturing', capturing);
      button.textContent = capturing ? this.t('controls.capture') : formatControlKey(settings[field]);
    });
    const validation = validateControlSettings(settings);
    document.getElementById('btn-control-settings-save').disabled = !validation.valid || Boolean(this.controlKeyCaptureField);
    if (!validation.valid && !this.controlKeyCaptureField) {
      this.setControlSettingsStatus(`controls.error.${validation.errors[0]}`);
    }
  }

  applyControlBindings() {
    if (!this.controls) return;
    this.controls.enableZoom = true;
    const dragActions = {
      rotate: THREE.MOUSE.ROTATE,
      zoom: THREE.MOUSE.DOLLY,
      none: null,
    };
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.RIGHT = dragActions[this.controlSettings.rightDragAction];
    this.controls.mouseButtons.MIDDLE = dragActions[this.controlSettings.middleDragAction];
  }

  controlBindingSummary(actionType) {
    const settings = this.controlSettings;
    const bindings = [
      ['controls.gesture.middleDrag', settings.middleDragAction],
      ['controls.gesture.rightDrag', settings.rightDragAction],
      ['controls.gesture.wheel', settings.wheelAction],
      ['controls.gesture.shiftWheel', settings.shiftWheelAction],
      ['controls.gesture.ctrlWheel', settings.ctrlWheelAction],
    ];
    return bindings
      .filter(([, action]) => actionType === 'rotation'
        ? ['rotate', 'yaw', 'pitch'].includes(action)
        : action === 'zoom')
      .map(([gestureKey, action]) => this.t('controls.binding', {
        gesture: this.t(gestureKey),
        action: this.t(`controls.action.${action}`),
      }))
      .join(' / ');
  }

  controlInstructionParams() {
    return {
      rotate: this.controlBindingSummary('rotation'),
      zoom: this.controlBindingSummary('zoom'),
      dig: formatControlKey(this.controlSettings.digKey),
      flag: formatControlKey(this.controlSettings.flagKey),
      reset: formatControlKey(this.controlSettings.resetKey),
    };
  }

  updateControlCopy() {
    const params = this.controlInstructionParams();
    const rotateGuide = document.getElementById('guide-rotate');
    const zoomGuide = document.getElementById('guide-zoom');
    const keyGuide = document.getElementById('guide-keys');
    if (rotateGuide) rotateGuide.textContent = this.t('guide.rotateConfigured', params);
    if (zoomGuide) zoomGuide.textContent = this.t('guide.zoomConfigured', params);
    if (keyGuide) keyGuide.textContent = this.t('guide.keysConfigured', params);
    document.getElementById('btn-mode-dig').title = `${this.t('controls.hotkey.dig')}: ${params.dig}`;
    document.getElementById('btn-mode-flag').title = `${this.t('controls.hotkey.flag')}: ${params.flag}`;
    document.getElementById('btn-reset-camera').title = `${this.t('action.resetCameraTitle')}: ${params.reset}`;
    this.renderControlSettings();
  }

  handleControlShortcut(event) {
    const settingsOpen = !document.getElementById('control-settings-overlay').classList.contains('hidden');
    if (settingsOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeControlSettings();
      }
      return;
    }
    if (
      event.defaultPrevented
      || event.repeat
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || event.target?.closest?.('input, textarea, select, button, [contenteditable="true"]')
    ) return;
    const action = event.code === this.controlSettings.digKey
      ? 'dig'
      : (event.code === this.controlSettings.flagKey
        ? 'flag'
        : (event.code === this.controlSettings.resetKey ? 'reset' : null));
    if (!action) return;
    event.preventDefault();
    if (action === 'reset') this.resetCamera();
    else this.setMode(action);
  }

  cameraDirectionFromTarget() {
    if (!this.camera || !this.controls) return null;
    return this.camera.position.clone().sub(this.controls.target).normalize();
  }

  handleConfiguredWheel(event) {
    if (!this.camera || !this.controls) return;
    const action = wheelActionForEvent(this.controlSettings, event);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === 'none') return;
    const delta = normalizeWheelDelta(event, window.innerHeight);
    if (Math.abs(delta) < 0.01) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (action === 'zoom') {
      const distance = Math.max(
        this.controls.minDistance,
        Math.min(this.controls.maxDistance, offset.length() * Math.exp(delta * 0.00135)),
      );
      offset.setLength(distance);
    } else {
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const angle = Math.max(-0.24, Math.min(0.24, delta * 0.0018));
      if (action === 'yaw') spherical.theta += angle;
      else spherical.phi = Math.max(0.025, Math.min(Math.PI - 0.025, spherical.phi + angle));
      offset.setFromSpherical(spherical);
    }
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.positionReasoningCoordinateAxes(true);
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

  updateCampaignUI() {
    document.body.dataset.taskFlow = this.taskFlow;
    document.querySelectorAll('.task-mission-option').forEach((button) => {
      button.classList.remove('locked');
      button.disabled = false;
      button.setAttribute('aria-disabled', 'false');
    });
    const freeplayButton = document.getElementById('btn-task-freeplay');
    freeplayButton.classList.remove('locked');
    freeplayButton.disabled = false;
    freeplayButton.setAttribute('aria-disabled', 'false');
    document.getElementById('btn-start-task').textContent = this.t(
      this.taskFlow === 'freeplay' ? 'lobby.task.startFreeplay' : 'lobby.task.start',
    );
  }

  selectTaskFlow(flow) {
    this.taskFlow = flow === 'freeplay' ? 'freeplay' : 'campaign';
    const campaign = this.taskFlow === 'campaign';
    document.getElementById('btn-task-campaign').classList.toggle('active', campaign);
    document.getElementById('btn-task-campaign').setAttribute('aria-selected', String(campaign));
    document.getElementById('btn-task-freeplay').classList.toggle('active', !campaign);
    document.getElementById('btn-task-freeplay').setAttribute('aria-selected', String(!campaign));
    document.getElementById('lobby-campaign-panel').classList.toggle('hidden', !campaign);
    document.getElementById('lobby-freeplay-panel').classList.toggle('hidden', campaign);
    this.applyStoryArt('solo', this.taskMission);
    this.updateCampaignUI();
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
    if (!tutorialArt) return;
    if (tutorialArt.getAttribute('src') !== source) tutorialArt.setAttribute('src', source);
    tutorialArt.classList.toggle('is-cutout', source.includes('-cutout-'));
  }

  // 难度预设选择
  selectPreset(element) {
    if (this.successReplay || this.ultimateHackRunning()) return;
    const me = this.roomSnapshot?.players?.find((player) => player.id === this.currentPlayerId);
    if (me && !me.isHost) return;
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');

    const preset = {
      width: Number.parseInt(element.dataset.w, 10),
      height: Number.parseInt(element.dataset.h, 10),
      depth: Number.parseInt(element.dataset.d, 10),
      mineCount: Number.parseInt(element.dataset.m, 10),
    };
    document.getElementById('input-w').value = preset.width;
    document.getElementById('input-h').value = preset.height;
    document.getElementById('input-d').value = preset.depth;
    document.getElementById('input-m').value = preset.mineCount;
    document.getElementById('custom-toggle').classList.remove('active');
    document.getElementById('custom-inputs').classList.add('hidden');
    
    this.startNewGame();
  }

  toggleGameFeature(feature) {
    if (this.successReplay || this.ultimateHackRunning()) return;
    const me = this.roomSnapshot?.players?.find((player) => player.id === this.currentPlayerId);
    if (me && !me.isHost) return;
    if (feature === 'autoPurge') this.autoPurgeEnabled = !this.autoPurgeEnabled;
    else if (feature === 'reduction') this.reductionEnabled = !this.reductionEnabled;
    else return;
    this.ruleset = rulesetForFeatures(this.autoPurgeEnabled, this.reductionEnabled);
    this.syncFeatureButtons();
    this.startNewGame();
  }

  syncFeatureButtons() {
    document.querySelectorAll('[data-feature]').forEach((button) => {
      const active = button.dataset.feature === 'autoPurge'
        ? this.autoPurgeEnabled
        : this.reductionEnabled;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
  }

  // 设置操作模式 (挖矿/插旗)
  setMode(mode) {
    if (this.ultimateHackRunning()) return;
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

  async returnToLobby() {
    if (this.returningToLobby) return;
    this.returningToLobby = true;
    const departingMode = this.gameMode;
    const departingCode = this.roomSnapshot?.code ?? this.roomClient.session?.code ?? '';
    const returnButton = document.getElementById('btn-return-lobby');
    const returnLabel = document.getElementById('btn-return-lobby-label');
    if (returnButton) returnButton.disabled = true;
    if (returnLabel) returnLabel.textContent = this.t('navigation.leaving');
    this.isInteractionLocked = true;
    this.closeMobilePanels();

    try {
      await this.roomClient.leave();
    } finally {
      this.boardAnimationGeneration += 1;
      this.cellRevealAnimations = [];
      this.sectorPurgeAnimations = [];
      this.revealAnimationEndsAt = 0;
      clearInterval(this.timerInterval);
      clearInterval(this.revivalTimer);
      clearTimeout(this.guidedCorrectionTimer);
      clearTimeout(this.successReplayTimer);
      clearTimeout(this.ultimateHackStepTimer);
      clearTimeout(this.sectorPurgeBannerTimer);
      clearTimeout(this.touchHoldTimer);
      clearTimeout(this.lastMobileCellTap?.timer);
      this.timerInterval = null;
      this.revivalTimer = null;
      this.guidedCorrectionTimer = null;
      this.successReplayTimer = null;
      this.ultimateHackStepTimer = null;
      this.sectorPurgeBannerTimer = null;
      this.touchHoldTimer = null;
      this.lastMobileCellTap = null;
      this.lastMobileNumberTap = null;
      this.activeTouchPointers.clear();
      this.touchGestureHadMultiplePointers = false;
      this.touchHoldTriggered = false;
      this.touchInspectionActive = false;
      this.mouseChordTriggered = false;
      this.mouseChordButtons = 0;
      this.mouseChordAnchor = null;
      this.mouseChordFocusTarget = null;

      const replayState = this.successReplay;
      if (replayState && this.controls) {
        this.controls.autoRotate = replayState.previousAutoRotate;
        if (Number.isFinite(replayState.previousAutoRotateSpeed)) {
          this.controls.autoRotateSpeed = replayState.previousAutoRotateSpeed;
        }
      }
      const hackClient = this.ultimateHackClient;
      if (hackClient && this.controls) {
        this.controls.autoRotate = hackClient.previousAutoRotate;
        if (Number.isFinite(hackClient.previousAutoRotateSpeed)) {
          this.controls.autoRotateSpeed = hackClient.previousAutoRotateSpeed;
        }
      }
      this.successReplay = null;
      this.pendingReplaySnapshot = null;
      this.ultimateHackClient = null;
      this.ultimateHackStartPending = false;

      this.stopGuidedTutorial();
      this.dialogueState = null;
      this.waitingTutorialAction = null;
      this.mediumChordObjectiveActive = false;
      this.setMediumChordObjectiveTarget(null);
      this.clearSolverHint();
      this.clearPointerHighlights();
      this.closeMobilePanels();
      this.pendingGameOver = null;
      this.pendingTaskMission = null;
      this.pendingTaskConfig = null;
      this.taskExperienceStarted = false;
      this.roomSnapshot = null;
      this.currentPlayerId = null;
      this.updateSolverHintVisibility(null);
      this.seenActivityIds.clear();
      this.seenChatIds.clear();
      this.automatedFlagKeys.clear();
      this.isGameOver = false;
      this.isGameWon = false;
      this.isInteractionLocked = true;

      for (const id of ['modal-overlay', 'ad-modal-overlay', 'tutorial-overlay']) {
        document.getElementById(id)?.classList.add('hidden');
      }
      for (const id of ['replay-hud', 'ultimate-hack-hud', 'sector-purge-banner']) {
        document.getElementById(id)?.classList.add('hidden');
      }
      document.body.classList.remove('in-room', 'replay-active', 'ultimate-hack-active', 'mobile-panel-active');
      delete document.body.dataset.ultimateHackStrategy;
      document.getElementById('room-code-display').textContent = this.t('players.roomCode', { code: '-' });
      document.getElementById('btn-copy-invite').style.display = 'none';
      if (departingMode === 'squad' && departingCode) {
        document.getElementById('input-room').value = departingCode;
      }
      this.selectLobbyMode(departingMode);
      this.lobbyEntryRetryReady = false;
      this.setLobbyEntryPending(false);
      this.lobbyEntryButtonId = null;
      this.setLobbyStatus('');
      document.getElementById('lobby-overlay').classList.remove('hidden');

      this.returningToLobby = false;
      if (returnButton) returnButton.disabled = false;
      if (returnLabel) returnLabel.textContent = this.t('navigation.backToLobby');
    }
  }

  t(key, params = {}) {
    return translateForInput(this.language, key, this.inputMode, params);
  }

  bindInputModeTracking() {
    if ('PointerEvent' in window) {
      document.addEventListener('pointerdown', (event) => {
        this.setInputMode(inputModeFromPointerType(event.pointerType, this.inputMode));
      }, { capture: true, passive: true });
      return;
    }
    let lastTouchAt = 0;
    document.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      this.setInputMode('touch');
    }, { capture: true, passive: true });
    document.addEventListener('mousedown', () => {
      if (Date.now() - lastTouchAt > 800) this.setInputMode('mouse');
    }, { capture: true, passive: true });
  }

  setInputMode(inputMode) {
    if (inputMode === this.inputMode || !['touch', 'mouse'].includes(inputMode)) return;
    this.inputMode = inputMode;
    document.body.dataset.inputMode = inputMode;
    this.refreshInputModeCopy();
  }

  localizeDocumentElements() {
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
  }

  refreshInputModeCopy() {
    this.localizeDocumentElements();
    this.updateControlCopy();
    if (this.dialogueState && !this.waitingTutorialAction) this.renderSilverWolfDialogue();
    if (this.waitingTutorialAction) this.setTutorialActionHint(this.waitingTutorialAction);
    else this.setTutorialActionHint();
    if (this.guidedTutorialTarget) this.renderGuidedHint();
    if (this.solverHint) this.renderSolverHint(this.solverHint);
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
    try { localStorage.removeItem('holo-sweeper.nickname'); } catch {}
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
    this.localizeDocumentElements();

    const nicknameInput = document.getElementById('input-nickname');
    let savedNickname = null;
    try { savedNickname = localStorage.getItem('holo-sweeper.nickname'); } catch {}
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
    this.selectTaskFlow(this.taskFlow);
    this.updateMissionGuide();
    this.updateControlCopy();
    if (this.dialogueState && !this.waitingTutorialAction) this.renderSilverWolfDialogue();
    if (this.waitingTutorialAction) this.setTutorialActionHint(this.waitingTutorialAction);
    if (this.guidedTutorialActive) this.updateGuidedTutorial(this.roomSnapshot);
    if (this.solverHint) this.renderSolverHint(this.solverHint);
    this.updateSolverHintVisibility(this.roomSnapshot);
    if (this.successReplay) {
      this.updateSuccessReplayControls();
      this.updateSuccessReplayProgress();
    }
    if (this.ultimateHackRunning()) this.updateUltimateHackHUD(this.roomSnapshot);
    this.updateUltimateHackLaunchAvailability(this.roomSnapshot);
  }

  // -------------------------------------------------------------
  // 4. Three.js 场景搭建
  // -------------------------------------------------------------
  
  
  setLobbyStatus(status) {
    const element = document.getElementById('lobby-status');
    if (element) element.innerText = status ? this.t(`status.${status}`) : '';
    if (['connecting', 'reconnecting'].includes(status) && this.lobbyEntryPending && this.roomClient.session) {
      this.lobbyEntryRetryReady = true;
    }
  }

  setLobbyEntryPending(pending, activeButtonId = null) {
    clearTimeout(this.lobbyEntryTimer);
    this.lobbyEntryTimer = null;
    this.lobbyEntryPending = Boolean(pending);
    if (activeButtonId) this.lobbyEntryButtonId = activeButtonId;
    for (const id of ['btn-start-task', 'btn-create-room', 'btn-join-room']) {
      const button = document.getElementById(id);
      if (!button) continue;
      const inactivePendingAction = this.lobbyEntryPending && id !== this.lobbyEntryButtonId;
      button.disabled = inactivePendingAction;
      button.setAttribute('aria-disabled', String(inactivePendingAction));
      button.setAttribute('aria-busy', String(this.lobbyEntryPending && id === this.lobbyEntryButtonId));
    }
    document.getElementById('lobby-modal')?.setAttribute('aria-busy', String(this.lobbyEntryPending));
    if (this.lobbyEntryPending) {
      this.lobbyEntryTimer = setTimeout(() => {
        if (!this.lobbyEntryPending) return;
        this.lobbyEntryRetryReady = Boolean(this.roomClient.session);
        this.setLobbyEntryPending(false);
        this.setLobbyStatus(this.lobbyEntryRetryReady ? 'retryConnection' : 'disconnected');
      }, LOBBY_ENTRY_TIMEOUT_MS);
    }
  }

  retryPendingLobbyConnection(buttonId = this.lobbyEntryButtonId) {
    if (buttonId !== this.lobbyEntryButtonId || !this.roomClient.session) return false;
    if (!this.lobbyEntryPending && !this.lobbyEntryRetryReady) return false;
    this.lobbyEntryRetryReady = false;
    this.setLobbyEntryPending(true, buttonId);
    this.roomClient.retryNow();
    return true;
  }

  handleRoomWelcome(message) {
    this.lobbyEntryRetryReady = false;
    this.setLobbyEntryPending(false);
    this.lobbyEntryButtonId = null;
    this.currentPlayerId = message.identity.playerId;
    this.gameMode = message.snapshot.mode === 'solo' ? 'solo' : 'squad';
    this.syncGameModeUI();
    document.body.classList.add('in-room');
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('room-code-display').innerText = this.t('players.roomCode', { code: message.snapshot.code });
    document.getElementById('btn-copy-invite').style.display = this.gameMode === 'squad' ? '' : 'none';
    if (this.gameMode === 'solo') {
      if (!this.pendingTaskConfig) {
        this.taskMission = this.missionFromConfig(message.snapshot.config);
        this.taskFlow = message.snapshot.config.campaign ? 'campaign' : 'freeplay';
      }
      const desired = this.pendingTaskConfig;
      const differs = desired && CONFIG_KEYS
        .some(key => message.snapshot.config[key] !== desired[key]);
      if (desired && differs) {
        this.roomClient.send({ op: 'restart', config: desired }).catch(error => this.handleRoomError(error));
      }
    }
  }

  handleRoomError(error) {
    if (error?.code === 'LEFT_ROOM') return;
    if (!this.roomClient.session) this.lobbyEntryRetryReady = false;
    this.setLobbyEntryPending(false);
    this.lobbyEntryButtonId = null;
    const translated = error?.code ? this.t(`error.${error.code}`) : '';
    const message = translated && translated !== `error.${error.code}` ? translated : (error?.message || this.t('error.roomFallback'));
    const status = document.getElementById('lobby-status');
    if (status && !document.getElementById('lobby-overlay').classList.contains('hidden')) status.innerText = message;
    else this.appendChatMessage({ system: true, message: this.systemText(`⚠️ ${message}`) });
  }

  applyRoomSnapshot(snapshot, initial = false) {
    if (!snapshot) return;
    if (this.successReplay) {
      const replayState = this.successReplay;
      const minimumRevision = this.pendingReplaySnapshot?.revision
        ?? replayState.finalSnapshot.revision;
      if (snapshot.revision < minimumRevision) return;
      this.pendingReplaySnapshot = snapshot;
      const configChanged = CONFIG_KEYS.some(
        (key) => snapshot.config?.[key] !== replayState.replay.config?.[key],
      );
      if (snapshot.phase !== 'won' || snapshot.replay?.runId !== replayState.replay.runId || configChanged) {
        this.stopSuccessReplay();
      }
      return;
    }
    const previous = this.roomSnapshot;
    if (previous && snapshot.revision < previous.revision) return;
    this.gameMode = snapshot.mode === 'solo' ? 'solo' : 'squad';
    if (this.gameMode === 'solo') {
      const snapshotMission = this.missionFromConfig(snapshot.config);
      const pendingMatches = this.pendingTaskConfig
        && CONFIG_KEYS
          .every(key => snapshot.config[key] === this.pendingTaskConfig[key]);
      if (pendingMatches) {
        this.taskMission = this.pendingTaskMission ?? snapshotMission;
        this.pendingTaskMission = null;
        this.pendingTaskConfig = null;
      } else if (!this.pendingTaskConfig) {
        this.taskMission = snapshotMission;
        this.taskFlow = snapshot.config.campaign ? 'campaign' : 'freeplay';
      }
    }
    this.syncGameModeUI();
    const configChanged = !previous || CONFIG_KEYS
      .some(key => previous.config[key] !== snapshot.config[key]);
    const restarted = previous && snapshot.phase === 'ready' && previous.phase !== 'ready';
    if (configChanged || restarted || !this.grid.length) {
      this.applyConfig(snapshot.config);
      this.buildGridLocal();
      initial = true;
    }

    this.renderPlayers(snapshot.players);
    this.renderRoomMessages(snapshot);
    const isNewPurgeEvent = Boolean(snapshot.lastPurge?.id && snapshot.lastPurge.id !== previous?.lastPurge?.id);
    const revealedKeys = new Set((snapshot.revealed || []).map((point) => this.pointKey(point)));
    const sectorReplacementKeys = new Set(
      isNewPurgeEvent
        ? (snapshot.lastPurge?.purgedMines || [])
          .map((point) => this.pointKey(point))
          .filter((key) => revealedKeys.has(key))
        : [],
    );
    const sectorLeadFlagKeys = new Set(
      isNewPurgeEvent
        ? (snapshot.lastPurge?.leadFlags || [])
          .map((point) => this.pointKey(point))
          .filter((key) => sectorReplacementKeys.has(key))
        : [],
    );
    this.syncPurgedCells(snapshot, initial);

    let previewedReplacementFlag = false;
    if (!initial) {
      for (const point of snapshot.lastPurge?.leadFlags || []) {
        const key = this.pointKey(point);
        if (!sectorLeadFlagKeys.has(key)) continue;
        const cell = this.grid[point.x]?.[point.y]?.[point.z];
        if (!cell || cell.isRevealed || cell.isPurged) continue;
        if (!cell.isFlagged) {
          cell.isFlagged = true;
          cell.isAutomatedFlag = false;
          this.flaggedCount += 1;
        }
        if (!cell.flagInstance) {
          this.attachFlagVisual(cell, { animate: true });
          previewedReplacementFlag = true;
        }
      }
      if (previewedReplacementFlag) sfx.playFlag();
    }

    const desiredFlags = new Set((snapshot.flags || []).map(point => `${point.x}:${point.y}:${point.z}`));
    const previousFlags = new Set((previous?.flags || []).map(point => `${point.x}:${point.y}:${point.z}`));
    const automatedScanActive = snapshot.ultimateHack?.status === 'running'
      && (snapshot.ultimateHack?.strategy === 'scan' || snapshot.config?.reduction === false);
    for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) for (let z = 0; z < this.depth; z++) {
      if (this.grid[x][y][z].isPurged) continue;
      const key = `${x}:${y}:${z}`;
      const shouldFlag = desiredFlags.has(key);
      if (automatedScanActive && shouldFlag && (!previous || !previousFlags.has(key))) {
        this.automatedFlagKeys.add(key);
      } else if (!shouldFlag) {
        this.automatedFlagKeys.delete(key);
      }
      if (sectorLeadFlagKeys.has(key) && this.grid[x][y][z].isFlagged && !shouldFlag) continue;
      if (this.grid[x][y][z].isFlagged !== shouldFlag) {
        this.setFlagLocal(x, y, z, shouldFlag, !initial, {
          automated: this.automatedFlagKeys.has(key),
        });
      }
    }
    const isNewRevealEvent = Boolean(snapshot.lastReveal?.id && snapshot.lastReveal.id !== previous?.lastReveal?.id);
    const revealWaves = new Map(
      isNewRevealEvent
        ? (snapshot.lastReveal.opened || []).map((point) => [
          this.pointKey(point),
          Math.max(0, Number(point.wave) || 0),
        ])
        : [],
    );
    const reductionTargetKeys = new Set(
      isNewPurgeEvent
        ? (snapshot.lastPurge?.reductionMines || (
          snapshot.lastPurge?.kind === 'reduction' ? snapshot.lastPurge.mines : []
        )).map((point) => this.pointKey(point))
        : [],
    );
    const revealWaveEffects = new Map();
    let latestRevealAnimationEnd = 0;
    for (const cell of snapshot.revealed || []) {
      const key = this.pointKey(cell);
      const isReductionTarget = reductionTargetKeys.has(key);
      const isSectorReplacement = sectorReplacementKeys.has(key);
      const holdLeadFlag = sectorLeadFlagKeys.has(key);
      const actionWave = revealWaves.get(key);
      const isActionReveal = Number.isFinite(actionWave);
      const timing = revealAnimationTiming(isActionReveal ? actionWave : null);
      const revealDelayMs = timing.delayMs + (holdLeadFlag
        ? BOARD_ANIMATION_TIMING.sectorPurgeFlagPreviewMs
        : 0);
      this.revealServerCell(cell, !initial, {
        durationMs: timing.durationMs,
        delayMs: revealDelayMs,
        wave: timing.isCascade,
        playSound: !isActionReveal,
        holdFlagUntilReveal: holdLeadFlag,
      });
      if (isActionReveal && !initial) {
        latestRevealAnimationEnd = Math.max(
          latestRevealAnimationEnd,
          revealDelayMs + timing.durationMs,
        );
      }
      if ((isReductionTarget || isSectorReplacement) && !initial) {
        const animationGeneration = this.boardAnimationGeneration;
        const burst = () => {
          if (animationGeneration !== this.boardAnimationGeneration) return;
          const targetCell = this.grid[cell.x]?.[cell.y]?.[cell.z];
          if (!targetCell) return;
          const world = new THREE.Vector3();
          targetCell.group.getWorldPosition(world);
          this.particles?.createExplosion(world, 0x29e7ff, 24);
        };
        if (revealDelayMs > 0) window.setTimeout(burst, revealDelayMs);
        else burst();
      }
      if (isActionReveal && !initial) {
        const effect = revealWaveEffects.get(revealDelayMs) ?? { points: [], isCascade: false };
        const world = new THREE.Vector3();
        this.grid[cell.x]?.[cell.y]?.[cell.z]?.group.getWorldPosition(world);
        effect.points.push(world);
        effect.isCascade ||= timing.isCascade;
        revealWaveEffects.set(revealDelayMs, effect);
      }
    }
    if (!initial && revealWaveEffects.size) {
      const animationGeneration = this.boardAnimationGeneration;
      for (const [delayMs, effect] of revealWaveEffects) {
        const sampleCount = Math.min(effect.isCascade ? 4 : 2, effect.points.length);
        const wavePoints = Array.from({ length: sampleCount }, (_, index) => (
          effect.points[Math.floor((index * effect.points.length) / sampleCount)]
        ));
        window.setTimeout(() => {
          if (this.boardAnimationGeneration !== animationGeneration) return;
          sfx.playDig();
          const particleCount = effect.isCascade ? 6 : 4;
          for (const wavePoint of wavePoints) this.particles?.createExplosion(wavePoint, 0x29e7ff, particleCount);
        }, delayMs);
      }
    }
    if (latestRevealAnimationEnd > 0) {
      this.revealAnimationEndsAt = Math.max(
        this.revealAnimationEndsAt,
        performance.now() + latestRevealAnimationEnd,
      );
    }

    this.isFirstClick = snapshot.phase === 'ready';
    this.isGameOver = snapshot.phase === 'lost' || (this.gameMode === 'solo' && snapshot.phase === 'revive');
    this.isGameWon = snapshot.phase === 'won';
    this.isInteractionLocked = this.ultimateHackRunning(snapshot)
      || ['revive', 'lost', 'won'].includes(snapshot.phase);
    this.syncServerTimer(
      snapshot.startedAt,
      snapshot.phase === 'won' ? (snapshot.replay?.completedAt ?? snapshot.serverTime) : snapshot.serverTime,
      ['playing', 'revive'].includes(snapshot.phase),
    );

    if (snapshot.phase === 'revive') {
      if (previous?.phase !== 'revive' && snapshot.pendingMine) {
        this.triggerMineLocal(snapshot.pendingMine.x, snapshot.pendingMine.y, snapshot.pendingMine.z, {
          showMine: snapshot.pendingFailureKind !== 'reduction_miss',
        });
      }
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
      const explosionSoundAlreadyPlayed = previous?.phase === 'revive' && Boolean(previous.pendingMine);
      if (explosion) this.triggerGameOver(explosion.x, explosion.y, explosion.z, {
        playExplosionSound: !explosionSoundAlreadyPlayed,
      });
    }
    if (snapshot.phase === 'won' && previous?.phase !== 'won') this.checkVictory(snapshot);

    const me = snapshot.players.find(player => player.id === this.currentPlayerId);
    const restart = document.getElementById('btn-restart');
    restart.disabled = Boolean(me && !me.isHost);
    restart.title = me && !me.isHost ? this.t('error.HOST_ONLY') : '';
    document.querySelectorAll('[data-feature]').forEach((button) => {
      button.disabled = Boolean(me && !me.isHost);
      button.title = me && !me.isHost ? this.t('error.HOST_ONLY') : '';
    });
    if (previous?.revision !== snapshot.revision && this.isSolverHintCompleted(snapshot)) this.clearSolverHint();
    this.roomSnapshot = snapshot;
    this.maybeCompleteMediumChordObjective(snapshot, previous);
    this.syncSuccessReplayAvailability(snapshot);
    this.updateStats();
    this.syncUltimateHack(snapshot, previous);
    this.updateSolverHintVisibility(snapshot);
    if (this.guidedTutorialActive) this.updateGuidedTutorial(snapshot);
    if (this.gameMode === 'solo') {
      this.maybeStartTaskExperience(snapshot);
      this.maybeShowMediumChordTip(snapshot, previous);
    }
  }

  missionFromConfig(config) {
    if (
      config?.campaign === true
      && config?.width === 9
      && config?.height === 9
      && config?.depth === 9
      && config?.mineCount === 60
    ) return 'ultimate';
    if (config?.width >= 7 || config?.mineCount >= 30) return 'hard';
    if (config?.width >= 5 || config?.mineCount >= 10) return 'medium';
    return 'easy';
  }

  configMatchesMission(config, mission = this.taskMission) {
    const desired = TASK_MISSIONS[mission] ?? TASK_MISSIONS.easy;
    return CONFIG_KEYS.every(key => config?.[key] === desired[key]);
  }

  maybeStartTaskExperience(snapshot) {
    if (
      this.taskFlow !== 'campaign'
      || this.taskExperienceStarted
      || !['ready', 'playing'].includes(snapshot.phase)
      || !this.configMatchesMission(snapshot.config)
    ) return;
    this.taskExperienceStarted = true;
    if (this.taskMission === 'easy') {
      this.startSilverWolfTutorial();
      return;
    }
    if (this.taskMission === 'medium') {
      this.showSilverWolfDialogue([
        { artKey: 'main', titleKey: 'task.medium.chapterTitle', messageKey: 'task.medium.brief.1', buttonKey: 'tutorial.next' },
        { artKey: 'tip', titleKey: 'purge.tutorialTitle', messageKey: 'purge.tutorialMessage', factKey: 'purge.tutorialFact', buttonKey: 'tutorial.next' },
        { artKey: 'tip', titleKey: 'task.medium.upgradeTitle', messageKey: 'task.medium.upgrade.1', factKey: 'task.medium.upgrade.fact', buttonKey: 'tutorial.next' },
        { artKey: 'ready', titleKey: 'task.medium.chapterTitle', messageKey: 'task.medium.brief.2', factKey: 'task.medium.brief.fact', buttonKey: 'tutorial.startMission' },
      ]);
      return;
    }
    if (this.taskMission === 'ultimate') {
      if (snapshot.ultimateHack?.status === 'running') return;
      this.showSilverWolfDialogue([
        {
          artKey: 'main',
          titleKey: 'task.ultimate.chapterTitle',
          messageKey: 'task.ultimate.brief.1',
          factKey: 'task.ultimate.brief.fact',
          buttonKey: 'tutorial.next',
        },
        {
          artKey: 'main',
          titleKey: 'task.ultimate.trojanTitle',
          messageKey: 'task.ultimate.brief.2',
          buttonKey: 'tutorial.next',
        },
        {
          artKey: 'main',
          titleKey: 'task.ultimate.installTitle',
          messageKey: 'task.ultimate.installMessage',
          buttonKey: 'task.ultimate.installButton',
          requiresExplicit: true,
        },
      ], { onComplete: () => this.startUltimateHack() });
      return;
    }
    this.showSilverWolfDialogue([
      { artKey: 'main', titleKey: `task.${this.taskMission}.chapterTitle`, messageKey: `task.${this.taskMission}.brief.1`, buttonKey: 'tutorial.next' },
      { artKey: 'main', titleKey: 'reduction.tutorialTitle', messageKey: 'reduction.tutorialMessage', factKey: 'reduction.tutorialFact', buttonKey: 'tutorial.next' },
      { artKey: 'main', titleKey: `task.${this.taskMission}.chapterTitle`, messageKey: `task.${this.taskMission}.brief.2`, factKey: `task.${this.taskMission}.brief.fact`, buttonKey: 'tutorial.startMission' },
    ]);
  }

  maybeShowMediumChordTip(snapshot, previous) {
    if (
      this.mediumChordTipShown
      || this.gameMode !== 'solo'
      || this.taskFlow !== 'campaign'
      || this.taskMission !== 'medium'
      || !this.taskExperienceStarted
      || this.dialogueState
      || snapshot.phase !== 'playing'
      || !previous
    ) return;

    const clue = findNewChordOpportunity(snapshot, previous);
    if (clue) this.showMediumChordTipFor(clue);
  }

  showMediumChordTipFor(clue) {
    this.mediumChordTipShown = true;
    this.mediumChordObjectiveActive = true;
    this.setMediumChordObjectiveTarget(clue);
    this.updateMissionGuide();
    this.closeMobilePanels();
    this.showSilverWolfDialogue([
      {
        artKey: 'tip',
        titleKey: 'task.medium.chordTipTitle',
        messageKey: 'task.medium.chordTip',
        factText: this.t(
          this.isMediumChordTargetVisible(clue)
            ? 'task.medium.chordTipFact'
            : 'task.medium.chordTipFactOutsideSlice',
          {
            number: clue.count,
            x: clue.x + 1,
            y: clue.y + 1,
            z: clue.z + 1,
            hidden: clue.hiddenAround,
          },
        ),
        buttonKey: 'tutorial.tryChord',
      },
    ]);
  }

  maybeCompleteMediumChordObjective(snapshot, previous) {
    const boardRestarted = snapshot?.phase === 'ready' && previous?.phase !== 'ready';
    if (!this.mediumChordObjectiveActive) return;
    if (boardRestarted || isNewSuccessfulChord(snapshot, previous)) {
      this.mediumChordObjectiveActive = false;
      this.setMediumChordObjectiveTarget(null);
      this.updateMissionGuide();
      this.setTutorialActionHint();
      return;
    }

    this.refreshMediumChordObjectiveTarget(snapshot);
  }

  isMediumChordTargetVisible(target) {
    if (!target) return false;
    const cell = this.grid[target.x]?.[target.y]?.[target.z];
    return Boolean(
      cell?.isRevealed
      && !cell.isPurged
      && cell.group?.visible,
    );
  }

  refreshMediumChordObjectiveTarget(snapshot = this.roomSnapshot) {
    if (!this.mediumChordObjectiveActive) return;
    const exactTarget = chordOpportunityAt(snapshot, this.mediumChordObjectiveTarget);
    const nextTarget = exactTarget ?? findChordOpportunity(snapshot);
    const previousKey = this.mediumChordObjectiveTarget
      ? this.pointKey(this.mediumChordObjectiveTarget)
      : '';
    const nextKey = nextTarget ? this.pointKey(nextTarget) : '';
    const targetChanged = previousKey !== nextKey
      || this.mediumChordObjectiveTarget?.hiddenAround !== nextTarget?.hiddenAround
      || this.mediumChordObjectiveTarget?.count !== nextTarget?.count;

    if (targetChanged || (nextTarget && !this.mediumChordObjectiveMarker)) {
      this.setMediumChordObjectiveTarget(nextTarget);
    }
    if (targetChanged) {
      this.updateMissionGuide();
      this.setTutorialActionHint();
    }
  }

  clearMediumChordObjectiveMarker() {
    this.disposeGuidedMarker(this.mediumChordObjectiveMarker);
    this.mediumChordObjectiveMarker = null;
  }

  ensureMediumChordObjectiveMarker() {
    if (this.mediumChordObjectiveMarker || !this.mediumChordObjectiveTarget) return;
    const target = this.mediumChordObjectiveTarget;
    const cell = this.grid[target.x]?.[target.y]?.[target.z];
    if (!cell?.spriteInstance) return;
    const marker = this.createEvidenceReticle();
    marker.name = 'medium-chord-objective-marker';
    marker.renderOrder = 1001;
    marker.userData.mediumChordObjective = true;
    marker.raycast = () => {};
    cell.group.add(marker);
    this.mediumChordObjectiveMarker = marker;
  }

  setMediumChordObjectiveTarget(target) {
    this.clearMediumChordObjectiveMarker();
    this.mediumChordObjectiveTarget = target ? { ...target } : null;
    this.ensureMediumChordObjectiveMarker();
  }

  startSilverWolfTutorial() {
    // Keep the board inert until Silver Wolf hands control to the guided route,
    // so an early click cannot initialize a different minefield.
    this.beginnerBoardInputLocked = true;
    this.showSilverWolfDialogue([
      { artKey: 'main', titleKey: 'tutorial.speaker', messageKey: 'tutorial.intro', factKey: 'tutorial.controlsNote', buttonKey: 'tutorial.next' },
      { artKey: 'neighbors', titleKey: 'tutorial.neighborsTitle', messageKey: 'tutorial.neighbors', factKey: 'tutorial.neighborsFact', buttonKey: 'tutorial.understood' },
      { artKey: 'scan', titleKey: 'tutorial.guidedTitle', messageKey: 'tutorial.guided', factKey: 'tutorial.guidedFact', buttonKey: 'tutorial.followMe' },
    ], { allowSkip: true, onComplete: () => this.beginGuidedTutorial() });
  }

  showSilverWolfDialogue(steps, { allowSkip = false, allowReplay = false, onComplete = null } = {}) {
    this.dialogueState = { steps, index: 0, allowSkip, allowReplay, onComplete };
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
    const factText = step.factText ?? (step.factKey
      ? this.t(step.factKey)
      : '');
    fact.textContent = factText;
    fact.classList.toggle('hidden', !factText);
    document.getElementById('btn-tutorial-next').textContent = this.t(step.buttonKey ?? 'tutorial.next');
    document.getElementById('tutorial-dismiss-hint')?.classList.toggle('hidden', Boolean(step.requiresExplicit));
    document.getElementById('btn-skip-tutorial').style.display = state.allowSkip ? '' : 'none';
    document.getElementById('btn-tutorial-replay').classList.toggle(
      'hidden',
      !state.allowReplay || !this.hasSuccessReplay(),
    );
    document.getElementById('tutorial-overlay').classList.remove('hidden');
  }

  currentDialogueRequiresExplicitAction() {
    const state = this.dialogueState;
    return Boolean(state?.steps?.[state.index]?.requiresExplicit);
  }

  advanceSilverWolfDialogue() {
    const state = this.dialogueState;
    if (!state) return;
    const step = state.steps[state.index];
    if (step?.action) {
      this.waitingTutorialAction = step.action;
      document.getElementById('tutorial-overlay').classList.add('hidden');
      this.setTutorialActionHint(step.action);
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
    if (this.gameMode === 'solo' && this.taskMission === 'easy') {
      this.advanceTaskMission('medium');
    }
  }

  isTutorialActionComplete(action) {
    if (action === 'scan') return this.revealedCount > 0;
    if (action === 'inspect') return this.hasInspectedNeighbors;
    if (action === 'mark') return this.flaggedCount > 0;
    if (action === 'reduce') return Number(this.roomSnapshot?.reducedMineCount ?? 0) > 0;
    return false;
  }

  completeTutorialAction(action) {
    if (this.gameMode !== 'solo' || this.waitingTutorialAction !== action || !this.dialogueState) return;
    this.waitingTutorialAction = null;
    this.setTutorialActionHint();
    this.dialogueState.index += 1;
    setTimeout(() => this.renderSilverWolfDialogue(), 240);
  }

  renderTutorialActionHint(message = '') {
    for (const [hintId, textId] of [
      ['mission-action-hint', 'mission-action-hint-text'],
      ['tutorial-action-hint', 'tutorial-action-hint-text'],
    ]) {
      const hint = document.getElementById(hintId);
      const text = document.getElementById(textId);
      if (!hint || !text) continue;
      hint.classList.toggle('hidden', !message);
      if (message) text.textContent = message;
    }
  }

  setTutorialActionHint(action = null) {
    const displayAction = action || (
      !this.dialogueState && this.hardReductionObjectivePending()
        ? 'reduce'
        : (!this.dialogueState && this.mediumChordObjectivePending() ? 'chord' : null)
    );
    const params = displayAction === 'chord'
      ? { number: this.mediumChordObjectiveTarget?.count ?? '?' }
      : {};
    const outsideSlice = displayAction === 'chord'
      && !this.isMediumChordTargetVisible(this.mediumChordObjectiveTarget);
    const hintKey = displayAction
      ? `tutorial.actionHint.${displayAction}${outsideSlice ? '.outsideSlice' : ''}`
      : '';
    this.renderTutorialActionHint(hintKey ? this.t(hintKey, params) : '');
  }

  beginGuidedTutorial() {
    if (this.gameMode !== 'solo' || this.taskMission !== 'easy') return;
    this.beginnerBoardInputLocked = false;
    this.guidedTutorialActive = true;
    this.guidedInspectExplained = false;
    this.guidedInspectLessonActive = false;
    this.guidedFlagModeExplained = false;
    this.guidedTutorialStep = 0;
    this.guidedTutorialProgressSignature = null;
    this.guidedPendingAction = null;
    this.guidedRecoveryPending = false;
    this.guidedRecoveryRevision = null;
    this.updateGuidedTutorial(this.roomSnapshot);
  }

  stopGuidedTutorial() {
    this.beginnerBoardInputLocked = false;
    this.guidedTutorialActive = false;
    this.guidedInspectExplained = false;
    this.guidedInspectLessonActive = false;
    this.guidedPendingAction = null;
    this.guidedRecoveryPending = false;
    this.guidedRecoveryRevision = null;
    this.guidedTutorialProgressSignature = null;
    this.guidedTutorialStep = 0;
    clearTimeout(this.guidedCorrectionTimer);
    this.guidedCorrectionTimer = null;
    this.clearGuidedTarget();
    this.setTutorialActionHint();
  }

  pointKey(point) {
    return `${point.x}:${point.y}:${point.z}`;
  }

  updateGuidedTutorial(snapshot = this.roomSnapshot) {
    if (!this.guidedTutorialActive || this.gameMode !== 'solo' || this.taskMission !== 'easy' || !snapshot) return;
    if (snapshot.phase === 'won') {
      this.stopGuidedTutorial();
      return;
    }
    if (!['ready', 'playing'].includes(snapshot.phase)) return;
    if (this.guidedRecoveryPending) {
      const receivedFreshBoard = snapshot.phase === 'ready'
        && snapshot.revision !== this.guidedRecoveryRevision;
      if (!receivedFreshBoard) return;
      this.guidedRecoveryPending = false;
      this.guidedRecoveryRevision = null;
      this.guidedPendingAction = null;
      this.guidedTutorialProgressSignature = null;
    }
    if (!snapshot.tutorialStart) return;

    if (this.guidedInspectLessonActive) {
      if (snapshot.phase !== 'ready') return;
      this.guidedInspectLessonActive = false;
      this.guidedInspectExplained = false;
      this.beginnerBoardInputLocked = false;
      if (this.dialogueState?.steps?.some((step) => step.messageKey === 'tutorial.beginnerInspect')) {
        document.getElementById('tutorial-overlay').classList.add('hidden');
        this.dialogueState = null;
        this.waitingTutorialAction = null;
        this.setTutorialActionHint();
      }
    }

    if (this.guidedPendingAction && snapshot.revision !== this.guidedPendingAction.revision) {
      this.guidedPendingAction = null;
    }

    const inspectableNumber = (snapshot.revealed || []).find((point) => Number(point.count) > 0);
    if (snapshot.phase === 'playing' && inspectableNumber && !this.guidedInspectExplained) {
      this.guidedInspectExplained = true;
      this.guidedInspectLessonActive = true;
      this.beginnerBoardInputLocked = true;
      this.clearGuidedTarget();
      this.showSilverWolfDialogue([
        {
          artKey: 'neighbors',
          titleKey: 'tutorial.beginnerInspectTitle',
          messageKey: 'tutorial.beginnerInspect',
          factKey: 'tutorial.beginnerInspectFact',
          buttonKey: 'tutorial.tryInspect',
          action: 'inspect',
        },
        {
          artKey: 'scan',
          titleKey: 'tutorial.beginnerReasoningTitle',
          messageKey: 'tutorial.beginnerReasoning',
          factKey: 'tutorial.beginnerReasoningFact',
          buttonKey: 'tutorial.beginnerReasoningStart',
        },
      ], {
        allowSkip: true,
        onComplete: () => {
          this.guidedInspectLessonActive = false;
          this.beginnerBoardInputLocked = false;
          this.updateGuidedTutorial(this.roomSnapshot);
        },
      });
      return;
    }

    const revealedKeys = (snapshot.revealed || []).map((point) => this.pointKey(point)).sort();
    const flagKeys = (snapshot.flags || []).map((point) => this.pointKey(point)).sort();
    const progressSignature = `${snapshot.phase}|${revealedKeys.join(',')}|${flagKeys.join(',')}`;
    if (progressSignature !== this.guidedTutorialProgressSignature) {
      if (snapshot.phase === 'ready') {
        this.guidedTutorialStep = 1;
        this.guidedFlagModeExplained = false;
      } else if (this.guidedTutorialProgressSignature === null) {
        this.guidedTutorialStep = 1;
      } else {
        this.guidedTutorialStep += 1;
      }
      this.guidedTutorialProgressSignature = progressSignature;
    }

    const { config } = snapshot;
    const solverHint = snapshot.phase === 'ready'
      ? {
        status: 'hint',
        action: 'dig',
        certainty: 'certain',
        rule: 'first-move',
        target: { ...snapshot.tutorialStart },
        evidence: [],
        details: {},
      }
      : solveMinesweeperHint({
        width: config.width,
        height: config.height,
        depth: config.depth,
        mineCount: snapshot.remainingMineCount ?? config.mineCount,
        phase: snapshot.phase,
        revealed: snapshot.revealed || [],
        flags: snapshot.flags || [],
        excluded: snapshot.purged || [],
      });

    if (solverHint.status !== 'hint' || solverHint.certainty !== 'certain' || !solverHint.target) {
      this.reseedGuidedBeginnerBoard();
      return;
    }

    const target = {
      ...solverHint.target,
      action: solverHint.action,
      kind: solverHint.action === 'flag' ? 'mine' : 'safe',
      reason: solverHint.rule,
      evidence: solverHint.evidence || [],
      solverHint,
      step: Math.max(1, this.guidedTutorialStep),
    };

    if (target.action === 'flag' && !this.guidedFlagModeExplained) {
      this.guidedFlagModeExplained = true;
      this.clearGuidedTarget();
      this.showSilverWolfDialogue([
        { artKey: 'scan', titleKey: 'tutorial.flagModeTitle', messageKey: 'tutorial.flagMode', factKey: 'tutorial.flagModeFact', buttonKey: 'tutorial.tryFlag' },
      ], { allowSkip: true, onComplete: () => this.updateGuidedTutorial(this.roomSnapshot) });
      return;
    }

    this.setGuidedTarget(target);
  }

  reseedGuidedBeginnerBoard() {
    if (this.guidedRecoveryPending || !this.roomClient) return;
    this.guidedRecoveryPending = true;
    this.guidedRecoveryRevision = this.roomSnapshot?.revision ?? null;
    this.guidedPendingAction = null;
    this.clearGuidedTarget();
    this.showGuidedRecoveryDialogue();
    this.roomClient.send({ op: 'restart', config: TASK_MISSIONS.easy })
      .catch((error) => {
        this.guidedRecoveryPending = false;
        this.guidedRecoveryRevision = null;
        if (!this.guidedTutorialActive) return;
        this.handleRoomError(error);
        this.showGuidedRecoveryDialogue();
      });
  }

  showGuidedRecoveryDialogue() {
    this.showSilverWolfDialogue([{
      artKey: 'scan',
      titleKey: 'tutorial.guided.reseedTitle',
      messageKey: 'tutorial.guided.reseedMessage',
      factKey: 'tutorial.guided.reseedFact',
      buttonKey: 'tutorial.guided.reseedButton',
    }], { onComplete: () => this.updateGuidedTutorial(this.roomSnapshot) });
  }

  setGuidedTarget(target) {
    const current = this.guidedTutorialTarget;
    const unchanged = current && current.action === target.action && this.pointKey(current) === this.pointKey(target);
    if (!unchanged) {
      this.clearGuidedTarget();
      this.guidedTutorialTarget = target;
      const cell = this.grid[target.x]?.[target.y]?.[target.z];
      if (!cell) return;
      this.setMode(target.action === 'dig' || this.inputMode === 'touch' ? target.action : 'dig');
      this.createGuidedTargetMarker(cell, target.action);
      this.createGuidedEvidenceMarkers(target.evidence || [], target.solverHint?.details?.proof);
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

  createEvidenceReticle(label = '') {
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
    if (label) {
      context.beginPath();
      context.arc(96, 28, 18, 0, Math.PI * 2);
      context.fillStyle = 'rgba(8, 5, 25, 0.96)';
      context.fill();
      context.strokeStyle = '#ffd75a';
      context.lineWidth = 4;
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#fff3ad';
      context.font = '700 22px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(label), 96, 29);
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
    marker.userData.proofClueId = label ? String(label) : '';
    return marker;
  }

  createGuidedEvidenceMarkers(points, proof = null) {
    const proofClues = proof?.clues || [];
    for (const [index, point] of points.entries()) {
      const cell = this.grid[point.x]?.[point.y]?.[point.z];
      if (!cell) continue;
      const label = proofClues[index]?.id ?? (points.length > 1 ? index + 1 : '');
      const marker = this.createEvidenceReticle(label);
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

  guidedReasonParams(target, snapshot = this.roomSnapshot) {
    const params = { x: target.x + 1, y: target.y + 1, z: target.z + 1, step: target.step, total: target.total };
    const [aPoint, bPoint] = target.evidence || [];
    if (aPoint) {
      const a = this.guidedConstraint(aPoint, snapshot);
      Object.assign(params, { ax: aPoint.x + 1, ay: aPoint.y + 1, az: aPoint.z + 1, aNumber: a.number, aFlagged: a.flagged, aHidden: a.hidden, aRemaining: a.remaining });
    }
    if (bPoint) {
      const b = this.guidedConstraint(bPoint, snapshot);
      Object.assign(params, { bx: bPoint.x + 1, by: bPoint.y + 1, bz: bPoint.z + 1, bNumber: b.number, bFlagged: b.flagged, bHidden: b.hidden, bRemaining: b.remaining });
    }
    return params;
  }

  renderGuidedHint(correction = false, snapshot = this.roomSnapshot) {
    const target = this.guidedTutorialTarget;
    if (!target) return;
    const params = target.solverHint
      ? { ...this.solverHintParams(target.solverHint), step: target.step }
      : this.guidedReasonParams(target, snapshot);
    const key = correction
      ? `tutorial.guided.hint.correction.${target.action}`
      : `tutorial.guided.hint.${target.reason}`;
    const message = !correction && target.solverHint
      ? `${this.t('tutorial.guided.step', params)} ${this.t(`solver.reason.${target.solverHint.rule}`, params)} ${this.t(`solver.action.${target.action}`, params)}`
      : this.t(key, params);
    this.renderTutorialActionHint(message);

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
      const reasonKey = ['protectedStart', 'first-move'].includes(target.reason)
        ? 'tutorial.guided.evidence.protected'
        : (target.reason.startsWith('cover')
          ? 'tutorial.guided.evidence.cover'
        : ((target.reason.startsWith('compare') || target.reason.startsWith('subset'))
          ? 'tutorial.guided.evidence.compare'
          : (target.reason.startsWith('direct') ? 'tutorial.guided.evidence.direct' : 'tutorial.guided.evidence.algorithm')));
      reasonLabel.textContent = this.t(reasonKey, params);
    }
    if (pointer) pointer.title = message;
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
    if (this.guidedPendingAction) return false;
    const target = this.guidedTutorialTarget;
    const matches = target && target.action === action && target.x === x && target.y === y && target.z === z;
    if (!matches) this.showGuidedCorrection();
    return Boolean(matches);
  }

  blockBeginnerBoardInput() {
    if (!this.beginnerBoardInputLocked) return false;
    this.setTutorialActionHint(this.waitingTutorialAction);
    return true;
  }

  sendGuidedBoardCommand(command) {
    if (!this.guidedTutorialActive) {
      return this.roomClient.send(command).catch((error) => this.handleRoomError(error));
    }
    if (this.guidedPendingAction) return null;
    const pending = {
      revision: this.roomSnapshot?.revision,
      action: command.op,
      point: this.pointKey(command),
    };
    this.guidedPendingAction = pending;
    return this.roomClient.send(command).catch((error) => {
      if (this.guidedPendingAction === pending) this.guidedPendingAction = null;
      this.handleRoomError(error);
    });
  }

  activateGuidedTarget(inputMethod = 'primary') {
    const target = this.guidedTutorialTarget;
    if (!this.guidedTutorialActive || !target || this.isInteractionLocked) return;
    void inputMethod;
    // The callout is an explicit tutorial control. An ordinary click should
    // always perform its current target action so the guided route cannot
    // deadlock behind a difficult 3D cell; the dialogue still teaches right-click.
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
      && ['ready', 'playing'].includes(snapshot.phase)
      && !this.ultimateHackRunning(snapshot);
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

  syncSolverHintCollapsed() {
    const result = document.getElementById('solver-hint-result');
    const button = document.getElementById('btn-collapse-solver-hint');
    const collapsed = Boolean(this.solverHint && this.solverHintCollapsed);
    result?.classList.toggle('is-collapsed', collapsed);
    if (!button) return;
    button.textContent = collapsed ? '＋' : '−';
    button.setAttribute('aria-expanded', String(!collapsed));
    const label = this.t(collapsed ? 'solver.expand' : 'solver.collapse');
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  toggleSolverHintCollapsed() {
    if (!this.solverHint) return;
    this.solverHintCollapsed = !this.solverHintCollapsed;
    this.syncSolverHintCollapsed();
    // The hint remains active: only recompute the floating-axis placement now
    // that the text panel occupies a different amount of screen space.
    this.syncReasoningCoordinateAxes();
  }

  clearSolverHint() {
    this.clearSolverHintMarkers();
    this.solverHint = null;
    this.solverHintCollapsed = false;
    document.getElementById('solver-hint-result')?.classList.add('hidden');
    this.syncSolverHintCollapsed();
    this.syncSolverHintButton();
    this.syncReasoningCoordinateAxes();
  }

  isSolverHintCompleted(snapshot, hint = this.solverHint) {
    if (!hint?.target || !snapshot) return false;
    const completedCells = hint.action === 'flag'
      ? [...(snapshot.flags || []), ...(snapshot.revealed || []), ...(snapshot.purged || [])]
      : [...(snapshot.revealed || []), ...(snapshot.purged || [])];
    return completedCells.some((point) => this.pointKey(point) === this.pointKey(hint.target));
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
      this.solverHintCollapsed = false;
      const { config } = this.roomSnapshot;
      this.solverHint = solveMinesweeperHint({
        width: config.width,
        height: config.height,
        depth: config.depth,
        mineCount: this.roomSnapshot.remainingMineCount ?? config.mineCount,
        phase: this.roomSnapshot.phase,
        revealed: this.roomSnapshot.revealed || [],
        flags: this.roomSnapshot.flags || [],
        excluded: this.roomSnapshot.purged || [],
        preferMines: this.reductionEnabled,
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
    const proof = details.proof;
    if (proof?.clues?.length) {
      const clues = proof.clues.map((clue, index) => ({
        ...clue,
        id: String(clue.id ?? index + 1),
        number: clue.number ?? clue.source?.count ?? 0,
        flagged: clue.flagged ?? 0,
        hidden: clue.hidden ?? clue.unknownCells?.length ?? 0,
        remaining: clue.remaining ?? 0,
      }));
      const upper = clues[0];
      const lowers = clues.slice(1);
      const differenceCells = proof.conclusion?.differenceCells ?? details.differenceCells ?? [];
      const difference = details.difference ?? differenceCells.length;
      const differenceMines = details.differenceMines ?? proof.conclusion?.differenceMines ?? 0;
      Object.assign(params, {
        upperLabel: upper.id,
        upperNumber: upper.number,
        upperFlagged: upper.flagged,
        upperHidden: upper.hidden,
        upperRemaining: upper.remaining,
        lowerCount: lowers.length,
        lowerLabels: lowers.map((clue) => clue.id).join(this.language === 'zh' ? '、' : ' + '),
        lowerRemainingTotal: lowers.reduce((total, clue) => total + clue.remaining, 0),
        difference,
        differenceMines,
        coverClues: lowers.map((clue) => this.t('solver.proof.inlineClue', clue)).join(this.t('solver.proof.inlineSeparator')),
        validWays: this.formatSolverCount(proof.validWays ?? details.totalWays),
        oppositeWays: this.formatSolverCount(proof.oppositeWays ?? 0),
      });
    }
    return params;
  }

  renderSolverProof(hint, params) {
    const panel = document.getElementById('solver-hint-proof');
    if (!panel) return;
    panel.replaceChildren();
    const proof = hint.details?.proof;
    if (!proof?.clues?.length) {
      panel.classList.add('hidden');
      return;
    }

    const title = document.createElement('strong');
    title.className = 'solver-proof-title';
    title.textContent = this.t(proof.kind === 'set-cover' ? 'solver.proof.title.cover' : 'solver.proof.title.contradiction');
    panel.append(title);

    proof.clues.forEach((clue, index) => {
      const id = String(clue.id ?? index + 1);
      const clueParams = {
        id,
        number: clue.number ?? clue.source?.count ?? 0,
        flagged: clue.flagged ?? 0,
        hidden: clue.hidden ?? clue.unknownCells?.length ?? 0,
        remaining: clue.remaining ?? 0,
      };
      const row = document.createElement('div');
      row.className = 'solver-proof-clue';
      row.dataset.proofClueId = id;
      const badge = document.createElement('span');
      badge.className = 'solver-proof-clue-id';
      badge.textContent = id;
      const text = document.createElement('span');
      text.className = 'solver-proof-clue-text';
      text.textContent = this.t('solver.proof.clue', clueParams);
      row.append(badge, text);
      panel.append(row);
    });

    const conclusion = document.createElement('div');
    conclusion.className = 'solver-proof-conclusion';
    if (proof.kind === 'set-cover') {
      const targetValue = proof.conclusion?.targetValue ?? (hint.action === 'flag' ? 'mine' : 'safe');
      conclusion.textContent = this.t(`solver.proof.cover.${targetValue}`, params);
    } else {
      const assumption = proof.assumption ?? (hint.action === 'flag' ? 'safe' : 'mine');
      conclusion.textContent = this.t(`solver.proof.contradiction.${assumption}`, params);
    }
    panel.append(conclusion);

    if (proof.kind !== 'set-cover') {
      const audit = document.createElement('small');
      audit.className = 'solver-proof-audit';
      audit.textContent = this.t('solver.proof.audit', params);
      panel.append(audit);
    }
    panel.classList.remove('hidden');
  }

  renderSolverHint(hint) {
    const result = document.getElementById('solver-hint-result');
    const badge = document.getElementById('solver-hint-badge');
    const target = document.getElementById('solver-hint-target');
    const coordinate = document.getElementById('solver-hint-coordinate');
    const reason = document.getElementById('solver-hint-reason');
    const action = document.getElementById('solver-hint-action');
    const actionLabel = document.getElementById('solver-hint-action-label');
    const actionDetail = document.getElementById('solver-hint-action-detail');
    if (!result || !hint) return;
    const error = ['inconsistent', 'too-complex', 'complete'].includes(hint.status);
    const type = error ? 'error' : (hint.certainty === 'guess' ? 'guess' : (hint.action === 'flag' ? 'mine' : 'safe'));
    result.classList.remove('hidden', 'safe', 'mine', 'guess', 'error');
    result.classList.add(type);
    const params = this.solverHintParams(hint);
    badge.textContent = this.t(error ? `solver.badge.${hint.status}` : (hint.certainty === 'guess' ? 'solver.badge.guess' : 'solver.badge.certain'));
    const targetType = hint.certainty === 'guess' ? 'guess' : (hint.action === 'flag' ? 'mine' : 'safe');
    target.textContent = hint.target ? this.t(`solver.target.${targetType}`) : this.t(`solver.target.${hint.status}`);
    coordinate.textContent = hint.target ? this.t('solver.coordinate', params) : '';
    coordinate.hidden = !hint.target;
    reason.textContent = this.t(`solver.reason.${hint.rule}`, params);
    this.renderSolverProof(hint, params);
    action.hidden = error;
    if (!error) {
      const actionType = hint.certainty === 'guess'
        ? 'guess'
        : (hint.action === 'flag' && this.reductionEnabled ? 'reduce' : hint.action);
      actionLabel.textContent = this.t(`solver.actionLabel.${actionType}`);
      actionDetail.textContent = this.t(`solver.action.${actionType}`);
    } else {
      actionLabel.textContent = '';
      actionDetail.textContent = '';
    }
    this.syncSolverHintButton();
    this.syncSolverHintCollapsed();
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

    const proofClues = hint.details?.proof?.clues || [];
    for (const [index, point] of (hint.evidence || []).entries()) {
      const evidenceCell = this.grid[point.x]?.[point.y]?.[point.z];
      if (!evidenceCell) continue;
      const label = proofClues[index]?.id ?? ((hint.evidence || []).length > 1 ? index + 1 : '');
      const evidenceMarker = this.createEvidenceReticle(label);
      evidenceMarker.renderOrder = 996;
      evidenceCell.group.add(evidenceMarker);
      this.solverHintEvidenceMarkers.push(evidenceMarker);
    }
  }

  ultimateHackRunning(snapshot = this.roomSnapshot) {
    return snapshot?.ultimateHack?.status === 'running';
  }

  ultimateHackStrategy(snapshot = this.roomSnapshot) {
    if (snapshot?.ultimateHack?.strategy === 'scan') return 'scan';
    return snapshot?.config?.reduction === false ? 'scan' : 'entropy';
  }

  startUltimateHack() {
    const snapshot = this.roomSnapshot;
    const allowedSurface = this.gameMode === 'solo' && (
      this.taskFlow === 'freeplay'
      || (this.taskFlow === 'campaign' && this.taskMission === 'ultimate')
    );
    if (
      !allowedSurface
      || !snapshot
      || !['ready', 'playing'].includes(snapshot.phase)
      || this.ultimateHackRunning(snapshot)
      || this.ultimateHackStartPending
      || this.successReplay
    ) return;

    this.ultimateHackStartPending = true;
    this.clearSolverHint();
    this.closeMobilePanels();
    this.updateUltimateHackLaunchAvailability(snapshot);
    this.roomClient.send({ op: 'ultimate_hack_start' }).catch((error) => {
      this.ultimateHackStartPending = false;
      this.updateUltimateHackLaunchAvailability(this.roomSnapshot);
      this.handleRoomError(error);
    });
  }

  cancelUltimateHack() {
    const hack = this.roomSnapshot?.ultimateHack;
    const client = this.ultimateHackClient;
    if (hack?.status !== 'running' || !hack.runId || client?.cancelPending) return;
    client.cancelPending = true;
    clearTimeout(this.ultimateHackStepTimer);
    this.ultimateHackStepTimer = null;
    client.scheduledStepKey = null;
    this.updateUltimateHackHUD(this.roomSnapshot);
    this.roomClient.send({ op: 'ultimate_hack_cancel', runId: hack.runId }).catch((error) => {
      if (this.ultimateHackClient?.runId === hack.runId) {
        this.ultimateHackClient.cancelPending = false;
        this.scheduleUltimateHackStep(this.roomSnapshot);
        this.updateUltimateHackHUD(this.roomSnapshot);
      }
      this.handleRoomError(error);
    });
  }

  beginUltimateHackClient(hack, snapshot) {
    clearTimeout(this.ultimateHackStepTimer);
    this.ultimateHackStepTimer = null;
    this.ultimateHackStartPending = false;
    this.ultimateHackClient = {
      runId: hack.runId,
      lastRequestedStepKey: null,
      scheduledStepKey: null,
      cancelPending: false,
      previousAutoRotate: Boolean(this.controls?.autoRotate),
      previousAutoRotateSpeed: this.controls?.autoRotateSpeed,
    };
    document.body.classList.add('ultimate-hack-active');
    document.body.dataset.ultimateHackStrategy = this.ultimateHackStrategy(snapshot);
    document.getElementById('ultimate-hack-hud')?.classList.remove('hidden');
    document.getElementById('tutorial-overlay')?.classList.add('hidden');
    this.closeMobilePanels();
    this.clearSolverHint();
    this.resetSlices();
    this.isInteractionLocked = true;
    if (this.controls) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.42;
    }
  }

  endUltimateHackClient(snapshot = this.roomSnapshot) {
    const client = this.ultimateHackClient;
    clearTimeout(this.ultimateHackStepTimer);
    this.ultimateHackStepTimer = null;
    this.ultimateHackStartPending = false;
    this.ultimateHackClient = null;
    document.body.classList.remove('ultimate-hack-active');
    delete document.body.dataset.ultimateHackStrategy;
    document.getElementById('ultimate-hack-hud')?.classList.add('hidden');
    if (client && this.controls) {
      this.controls.autoRotate = client.previousAutoRotate;
      if (Number.isFinite(client.previousAutoRotateSpeed)) {
        this.controls.autoRotateSpeed = client.previousAutoRotateSpeed;
      }
    }
    this.isInteractionLocked = ['revive', 'lost', 'won'].includes(snapshot?.phase);
  }

  syncUltimateHack(snapshot, previous = null) {
    const hack = snapshot?.ultimateHack;
    const running = hack?.status === 'running' && Boolean(hack.runId);
    if (!running) {
      if (this.ultimateHackClient) this.endUltimateHackClient(snapshot);
      this.updateUltimateHackLaunchAvailability(snapshot);
      return;
    }

    if (this.ultimateHackClient?.runId !== hack.runId) {
      if (this.ultimateHackClient) this.endUltimateHackClient(snapshot);
      this.beginUltimateHackClient(hack, snapshot);
    }
    this.isInteractionLocked = true;
    document.body.dataset.ultimateHackStrategy = this.ultimateHackStrategy(snapshot);
    this.updateUltimateHackHUD(snapshot);
    this.updateUltimateHackLaunchAvailability(snapshot);

    const previousHack = previous?.ultimateHack;
    const stepChanged = previousHack?.runId !== hack.runId || previousHack?.step !== hack.step;
    if (stepChanged || !this.ultimateHackClient.lastRequestedStepKey) {
      this.scheduleUltimateHackStep(snapshot);
    }
  }

  updateUltimateHackLaunchAvailability(snapshot = this.roomSnapshot) {
    const launch = document.getElementById('ultimate-hack-launch');
    const button = document.getElementById('btn-ultimate-hack-start');
    const label = document.getElementById('btn-ultimate-hack-start-label');
    if (!launch || !button) return;
    const visible = this.gameMode === 'solo' && this.taskFlow === 'freeplay';
    const enabled = visible
      && snapshot
      && ['ready', 'playing'].includes(snapshot.phase)
      && !this.ultimateHackRunning(snapshot)
      && !this.ultimateHackStartPending
      && !this.successReplay;
    launch.classList.toggle('hidden', !visible);
    button.disabled = !enabled;
    if (label) label.textContent = this.t(this.ultimateHackStartPending ? 'ultimateHack.launchPending' : 'ultimateHack.launch');
  }

  updateUltimateHackHUD(snapshot = this.roomSnapshot) {
    const hack = snapshot?.ultimateHack;
    if (!hack || hack.status !== 'running') return;
    const strategy = this.ultimateHackStrategy(snapshot);
    const numericStep = Number(hack.step);
    const step = Number.isFinite(numericStep) ? Math.max(0, numericStep) : 0;
    const progress = this.currentBoardProgress(snapshot).percent;
    document.getElementById('ultimate-hack-stage').textContent = this.t(`ultimateHack.stage.${strategy}`);
    document.getElementById('ultimate-hack-step').textContent = this.t('ultimateHack.step', { step });
    document.getElementById('ultimate-hack-progress').textContent = this.t('ultimateHack.progress', { progress });
    const cancel = document.getElementById('btn-ultimate-hack-cancel');
    if (cancel) {
      cancel.disabled = Boolean(this.ultimateHackClient?.cancelPending);
      cancel.textContent = this.t(cancel.disabled ? 'ultimateHack.cancelPending' : 'ultimateHack.cancel');
    }
  }

  scheduleUltimateHackStep(snapshot = this.roomSnapshot) {
    const hack = snapshot?.ultimateHack;
    const client = this.ultimateHackClient;
    if (
      !client
      || client.cancelPending
      || hack?.status !== 'running'
      || hack.runId !== client.runId
      || !['ready', 'playing'].includes(snapshot.phase)
    ) return;
    const stepKey = `${hack.runId}:${String(hack.step ?? 0)}`;
    if (client.lastRequestedStepKey === stepKey || client.scheduledStepKey === stepKey) return;
    clearTimeout(this.ultimateHackStepTimer);
    client.scheduledStepKey = stepKey;

    const sendWhenSettled = () => {
      const liveHack = this.roomSnapshot?.ultimateHack;
      const liveClient = this.ultimateHackClient;
      if (
        !liveClient
        || liveClient.cancelPending
        || liveClient.runId !== hack.runId
        || liveHack?.status !== 'running'
        || liveHack.runId !== hack.runId
        || `${liveHack.runId}:${String(liveHack.step ?? 0)}` !== stepKey
      ) {
        if (liveClient?.scheduledStepKey === stepKey) liveClient.scheduledStepKey = null;
        return;
      }

      const revealStillRunning = this.cellRevealAnimations.length > 0
        || performance.now() < this.revealAnimationEndsAt;
      if (revealStillRunning || this.sectorPurgeAnimations.length > 0) {
        this.ultimateHackStepTimer = window.setTimeout(sendWhenSettled, 80);
        return;
      }

      liveClient.scheduledStepKey = null;
      liveClient.lastRequestedStepKey = stepKey;
      this.ultimateHackStepTimer = null;
      this.roomClient.send({
        op: 'ultimate_hack_step',
        runId: hack.runId,
        expectedStep: Number(hack.step),
      }).catch((error) => {
        if (this.ultimateHackClient?.runId === hack.runId) {
          this.ultimateHackClient.lastRequestedStepKey = null;
          this.ultimateHackStepTimer = window.setTimeout(
            () => this.scheduleUltimateHackStep(this.roomSnapshot),
            650,
          );
        }
        this.handleRoomError(error);
      });
    };

    const revealWait = Math.max(0, Math.ceil(this.revealAnimationEndsAt - performance.now()));
    this.ultimateHackStepTimer = window.setTimeout(sendWhenSettled, Math.max(120, revealWait));
  }

  showTaskCompletion() {
    if (this.taskFlow === 'freeplay') {
      this.showSilverWolfDialogue([{
        artKey: 'main',
        titleKey: 'freeplay.completeTitle',
        messageKey: 'freeplay.completeMessage',
        factText: this.t('tutorial.completionFact', { time: this.formatTime(this.timer) }),
        buttonKey: 'tutorial.continue',
      }], { allowReplay: true });
      return;
    }
    const mission = this.taskMission;
    if (mission === 'ultimate') {
      this.showSilverWolfDialogue([
        {
          artKey: 'main',
          titleKey: 'task.ultimate.completeTitle',
          messageKey: 'task.ultimate.complete.1',
          factText: this.t('tutorial.completionFact', { time: this.formatTime(this.timer) }),
          buttonKey: 'tutorial.next',
        },
        {
          artKey: 'main',
          titleKey: 'task.ultimate.finalTitle',
          messageKey: 'task.ultimate.complete.2',
          factKey: 'task.ultimate.complete.fact',
          buttonKey: 'tutorial.enterFreeplay',
          requiresExplicit: true,
        },
      ], { allowReplay: true, onComplete: () => this.enterFreeModeAfterCampaign() });
      return;
    }
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
      steps.push({ artKey: completionArt[2], titleKey: 'task.hard.finalTitle', messageKey: 'task.hard.complete.3', factKey: 'task.hard.complete.fact', buttonKey: 'tutorial.enterUltimate' });
    }
    const nextMission = mission === 'easy'
      ? 'medium'
      : (mission === 'medium' ? 'hard' : (mission === 'hard' ? 'ultimate' : null));
    this.showSilverWolfDialogue(steps, {
      allowReplay: true,
      onComplete: nextMission ? () => this.advanceTaskMission(nextMission) : null,
    });
  }

  enterFreeModeAfterCampaign() {
    const completedConfig = this.taskMission === 'ultimate'
      ? TASK_MISSIONS.hard
      : (this.roomSnapshot?.config ?? TASK_MISSIONS.hard);
    const config = {
      ...completedConfig,
      campaign: false,
    };
    this.stopGuidedTutorial();
    this.taskFlow = 'freeplay';
    this.pendingTaskMission = this.missionFromConfig(config);
    this.taskMission = this.pendingTaskMission;
    this.pendingTaskConfig = { ...config };
    this.taskExperienceStarted = false;
    this.mediumChordTipShown = false;
    this.mediumChordObjectiveActive = false;
    this.setMediumChordObjectiveTarget(null);
    this.selectTaskFlow('freeplay');
    this.syncGameModeUI();
    this.roomClient.send({ op: 'restart', config }).catch(error => this.handleRoomError(error));
  }

  advanceTaskMission(mission) {
    const config = TASK_MISSIONS[mission];
    if (!config) return;
    this.stopGuidedTutorial();
    this.mediumChordObjectiveActive = false;
    this.setMediumChordObjectiveTarget(null);
    this.taskMission = mission;
    this.pendingTaskMission = mission;
    this.pendingTaskConfig = { ...config };
    this.taskExperienceStarted = false;
    if (mission === 'medium') {
      this.mediumChordTipShown = false;
    }
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
    const showTutorialChecklist = solo && this.taskFlow === 'campaign' && this.taskMission === 'easy';
    document.body.dataset.gameMode = solo ? 'task' : 'multiplayer';
    document.body.dataset.taskFlow = this.taskFlow;
    document.getElementById('solo-guide-section').classList.toggle('hidden', !showTutorialChecklist);
    document.getElementById('player-list-section').classList.toggle('hidden', solo);
    document.getElementById('chat-section').classList.toggle('hidden', solo);
    document.getElementById('btn-copy-invite').style.display = solo ? 'none' : (this.currentPlayerId ? '' : 'none');
    this.applyStoryArt(this.gameMode, this.taskMission);
    this.updateSoloGuide();
    this.updateMissionGuide();
    this.updateUltimateHackLaunchAvailability(this.roomSnapshot);
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
        const params = activity.key === 'sectorPurged'
          ? { ...activity.params, updated: activity.params?.updated ?? activity.params?.cells ?? 0 }
          : (activity.params || {});
        const activityKey = activity.key === 'sectorPurged' && params.kind === 'reduction'
          ? 'reductionApplied'
          : activity.key;
        const localized = activityKey ? this.t(`activity.${activityKey}`, params) : activity.message;
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

  revealServerCell(data, animate = true, {
    durationMs = BOARD_ANIMATION_TIMING.cellRevealDurationMs,
    delayMs = 0,
    wave = false,
    playSound = true,
    holdFlagUntilReveal = false,
  } = {}) {
    const cell = this.grid[data.x]?.[data.y]?.[data.z];
    if (!cell || cell.isPurged) return;
    if (cell.isRevealed) {
      if (cell.neighborMines !== data.count) {
        cell.neighborMines = data.count;
        this.refreshNumberSprite(cell);
      }
      return;
    }
    let heldFlag = null;
    if (cell.isFlagged && holdFlagUntilReveal) {
      heldFlag = cell.flagInstance;
      cell.isFlagged = false;
      cell.isAutomatedFlag = false;
      this.flaggedCount = Math.max(0, this.flaggedCount - 1);
      this.automatedFlagKeys.delete(this.pointKey(cell));
    } else if (cell.isFlagged) {
      this.setFlagLocal(data.x, data.y, data.z, false, false);
    }
    cell.neighborMines = data.count;
    cell.isRevealed = true;
    this.revealedCount++;
    const revealNumber = () => {
      if (heldFlag && cell.flagInstance === heldFlag) {
        cell.group.remove(heldFlag);
        cell.flagInstance = null;
      }
      cell.mesh.material = this.materials.cellUnrevealed;
      if (cell.neighborMines > 0 && cell.isRevealed && !cell.spriteInstance) {
        this.createNumberSprite(cell);
      }
    };
    if (animate) {
      if (playSound) sfx.playDig();
      this.animateCellReveal(cell, { durationMs, delayMs, wave, onStart: revealNumber });
    } else {
      cell.mesh.visible = false;
      cell.outline.visible = false;
      revealNumber();
    }
  }

  removeNumberSprite(cell) {
    const sprite = cell?.spriteInstance;
    if (!sprite) return;
    if (this.hoveredNumberCell === cell) this.clearHoveredNumber();
    cell.group.remove(sprite);
    sprite.material?.map?.dispose();
    sprite.material?.dispose();
    cell.spriteInstance = null;
  }

  refreshNumberSprite(cell) {
    this.removeNumberSprite(cell);
    if (cell.isRevealed && cell.neighborMines > 0) this.createNumberSprite(cell);
  }

  flagMaterialForCell(cell, hovered = false) {
    if (cell?.isAutomatedFlag) {
      return hovered ? this.materials.cellAutomatedFlaggedHovered : this.materials.cellAutomatedFlagged;
    }
    return hovered ? this.materials.cellFlaggedHovered : this.materials.cellFlagged;
  }

  attachFlagVisual(cell, {
    automated = false,
    animate = true,
    burst = false,
  } = {}) {
    if (!cell || cell.flagInstance) return cell?.flagInstance ?? null;
    const flag = (automated ? this.geometries.automatedFlag : this.geometries.flag).clone();
    flag.scale.set(0.9, 0.9, 0.9);
    cell.group.add(flag);
    cell.flagInstance = flag;
    if (animate) {
      const animationGeneration = this.boardAnimationGeneration;
      const finalY = flag.position.y;
      const startY = 0.1;
      const startedAt = performance.now();
      flag.position.y = startY;
      flag.scale.setScalar(0.45);
      const animateFlagRise = (now) => {
        if (
          this.boardAnimationGeneration !== animationGeneration
          || cell.flagInstance !== flag
          || flag.parent !== cell.group
        ) return;
        const progress = Math.min(
          1,
          (now - startedAt) / BOARD_ANIMATION_TIMING.flagRiseDurationMs,
        );
        const eased = 1 - Math.pow(1 - progress, 3);
        flag.position.y = startY + (finalY - startY) * eased + Math.sin(progress * Math.PI) * 0.055;
        flag.scale.setScalar(0.45 + (0.9 - 0.45) * eased);
        if (progress < 1) requestAnimationFrame(animateFlagRise);
      };
      requestAnimationFrame(animateFlagRise);
    }
    cell.mesh.material = automated
      ? this.materials.cellAutomatedFlagged
      : this.materials.cellFlagged;
    if (burst) {
      const world = new THREE.Vector3();
      cell.group.getWorldPosition(world);
      this.particles?.createExplosion(world, 0xff174d, 18);
    }
    return flag;
  }

  setFlagLocal(x, y, z, flagged, playSound = true, {
    automated = false,
    animate = playSound,
  } = {}) {
    const cell = this.grid[x]?.[y]?.[z];
    if (!cell || cell.isPurged || cell.isRevealed || cell.isFlagged === flagged) return;
    if (playSound) sfx.playFlag();
    cell.isFlagged = flagged;
    cell.isAutomatedFlag = flagged && automated;
    this.flaggedCount += flagged ? 1 : -1;
    if (flagged) {
      this.attachFlagVisual(cell, {
        automated,
        animate,
        burst: automated && playSound,
      });
    } else {
      if (cell.flagInstance) {
        cell.group.remove(cell.flagInstance);
        cell.flagInstance = null;
      }
      cell.isAutomatedFlag = false;
      cell.mesh.material = this.materials.cellUnrevealed;
    }
  }

  syncPurgedCells(snapshot, initial = false) {
    const desired = new Set((snapshot.purged || []).map((point) => this.pointKey(point)));
    const event = snapshot.lastPurge;
    const unseenEvent = event?.id && event.id !== this.lastSectorPurgeId;
    const leadFlagKeys = new Set(
      unseenEvent && !initial
        ? (event.leadFlags || []).map((point) => this.pointKey(point))
        : [],
    );
    const newlyPurged = [];
    let previewedLeadFlag = false;
    for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) for (let z = 0; z < this.depth; z++) {
      const cell = this.grid[x]?.[y]?.[z];
      const key = cell ? this.pointKey(cell) : '';
      if (!cell || cell.isPurged || !desired.has(key)) continue;
      if (leadFlagKeys.has(key) && !cell.flagInstance) {
        this.attachFlagVisual(cell, { animate: true });
        previewedLeadFlag = true;
      }
      cell.isPurged = true;
      if (cell.isRevealed) this.revealedCount = Math.max(0, this.revealedCount - 1);
      if (cell.isFlagged) this.flaggedCount = Math.max(0, this.flaggedCount - 1);
      cell.isRevealed = false;
      cell.isFlagged = false;
      cell.isAutomatedFlag = false;
      this.automatedFlagKeys.delete(key);
      newlyPurged.push(cell);
    }
    if (previewedLeadFlag) sfx.playFlag();

    if (newlyPurged.length && !initial) this.animateSectorPurge(newlyPurged, event);
    else for (const cell of newlyPurged) this.finalizePurgedCell(cell);
    if (unseenEvent && !initial) this.showSectorPurgeBanner(event);
    if (event?.id) this.lastSectorPurgeId = event.id;
    else if (snapshot.phase === 'ready') this.lastSectorPurgeId = null;
  }

  animateSectorPurge(cells, event = null) {
    const purgedMines = event?.purgedMines || (event?.kind === 'reduction' ? [] : event?.mines) || [];
    const mineKeys = new Set(purgedMines.map((point) => this.pointKey(point)));
    const ordered = [...cells].sort((left, right) => Number(mineKeys.has(this.pointKey(right))) - Number(mineKeys.has(this.pointKey(left))));
    const timing = sectorPurgeAnimationTiming(ordered.length, {
      flagPreview: Boolean(event?.leadFlags?.length),
    });
    const startedAt = performance.now() + timing.leadInMs;
    this.sectorPurgeAnimations.push(...ordered.map((cell, index) => ({
      cell,
      start: startedAt + Math.min(index, 18) * BOARD_ANIMATION_TIMING.sectorPurgeStaggerMs,
      duration: BOARD_ANIMATION_TIMING.sectorPurgeCellDurationMs,
      mine: mineKeys.has(this.pointKey(cell)),
      burst: false,
    })));
    this.revealAnimationEndsAt = Math.max(
      this.revealAnimationEndsAt,
      performance.now() + timing.totalMs,
    );
  }

  updateSectorPurgeAnimations(now = performance.now()) {
    for (let index = this.sectorPurgeAnimations.length - 1; index >= 0; index -= 1) {
      const animation = this.sectorPurgeAnimations[index];
      if (now < animation.start) continue;
      if (!animation.burst && animation.mine) {
        animation.burst = true;
        const world = new THREE.Vector3();
        animation.cell.group.getWorldPosition(world);
        this.particles?.createExplosion(world, 0x29e7ff, 24);
      }
      const progress = Math.min(1, (now - animation.start) / animation.duration);
      const eased = progress * progress * (3 - 2 * progress);
      animation.cell.group.scale.setScalar(Math.max(0.02, 1 - eased));
      animation.cell.group.rotation.y += 0.06;
      animation.cell.group.rotation.x += 0.025;
      if (progress < 1) continue;
      this.finalizePurgedCell(animation.cell);
      this.sectorPurgeAnimations.splice(index, 1);
    }
  }

  finalizePurgedCell(cell) {
    cell.group.visible = false;
    cell.group.scale.setScalar(1);
  }

  showSectorPurgeBanner(event) {
    const banner = document.getElementById('sector-purge-banner');
    const kicker = banner?.querySelector('span');
    const title = document.getElementById('sector-purge-banner-title');
    const detail = document.getElementById('sector-purge-banner-detail');
    if (!banner || !event) return;
    const prefix = event.kind === 'combined' ? 'combined' : (event.kind === 'reduction' ? 'reduction' : 'purge');
    if (kicker) kicker.textContent = this.t(`${prefix}.bannerKicker`);
    if (title) title.textContent = this.t(`${prefix}.bannerTitle`);
    if (detail) detail.textContent = this.t(`${prefix}.bannerDetail`, {
      sectors: event.sectorCount ?? 1,
      mines: event.mines?.length ?? 0,
      reduced: event.reductionMines?.length ?? (event.kind === 'reduction' ? event.mines?.length : 0) ?? 0,
      purged: event.purgedMines?.length ?? (event.kind === 'reduction' ? 0 : event.mines?.length) ?? 0,
      cells: event.cells?.length ?? 0,
      updated: event.updatedClues?.length ?? event.clues?.length ?? 0,
      opened: event.opened?.length ?? 0,
    });
    banner.classList.remove('hidden');
    clearTimeout(this.sectorPurgeBannerTimer);
    this.sectorPurgeBannerTimer = setTimeout(() => banner.classList.add('hidden'), 2800);
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
    const legacyRuleset = ['classic', 'sector', 'reduction'].includes(config.ruleset) ? config.ruleset : 'classic';
    this.autoPurgeEnabled = typeof config.autoPurge === 'boolean'
      ? config.autoPurge
      : legacyRuleset !== 'classic';
    this.reductionEnabled = typeof config.reduction === 'boolean'
      ? config.reduction
      : legacyRuleset === 'reduction';
    this.ruleset = rulesetForFeatures(this.autoPurgeEnabled, this.reductionEnabled);
    this.syncFeatureButtons();
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

  
  hasSuccessReplay(snapshot = this.roomSnapshot) {
    return snapshot?.phase === 'won'
      && Array.isArray(snapshot.replay?.steps)
      && snapshot.replay.steps.length > 0;
  }

  syncSuccessReplayAvailability(snapshot = this.roomSnapshot) {
    const available = this.hasSuccessReplay(snapshot);
    document.getElementById('btn-modal-replay')?.classList.toggle(
      'hidden',
      !available || snapshot?.mode === 'solo',
    );
    document.getElementById('btn-tutorial-replay')?.classList.toggle(
      'hidden',
      !available || !this.dialogueState?.allowReplay,
    );
  }

  startSuccessReplay() {
    const snapshot = this.roomSnapshot;
    if (this.successReplay || !this.hasSuccessReplay(snapshot)) return;
    const replay = snapshot.replay;
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    const modalOverlay = document.getElementById('modal-overlay');
    const returnSurface = !tutorialOverlay.classList.contains('hidden')
      ? 'dialogue'
      : (!modalOverlay.classList.contains('hidden') ? 'modal' : 'board');
    const finalSnapshot = typeof structuredClone === 'function'
      ? structuredClone(snapshot)
      : JSON.parse(JSON.stringify(snapshot));

    this.successReplay = {
      replay,
      finalSnapshot,
      returnSurface,
      index: 0,
      paused: false,
      finished: false,
      nextDueAt: null,
      pauseRemainingMs: null,
      generation: 0,
      purged: [],
      remainingMineCount: replay.config?.mineCount ?? snapshot.config.mineCount,
      previousAutoRotate: Boolean(this.controls?.autoRotate),
      previousAutoRotateSpeed: this.controls?.autoRotateSpeed,
    };
    this.pendingReplaySnapshot = null;
    clearTimeout(this.successReplayTimer);
    this.successReplayTimer = null;
    tutorialOverlay.classList.add('hidden');
    modalOverlay.classList.add('hidden');
    document.getElementById('ad-modal-overlay').classList.add('hidden');
    this.closeMobilePanels();
    document.body.classList.add('replay-active');

    this.applyConfig(replay.config ?? snapshot.config);
    this.buildGridLocal();
    this.successReplay.generation = this.boardAnimationGeneration;
    this.isInteractionLocked = true;
    this.isGameWon = false;
    this.resetSlices();
    if (this.controls) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.55;
    }

    document.getElementById('replay-hud').classList.remove('hidden');
    const pauseButton = document.getElementById('btn-replay-pause');
    pauseButton.disabled = false;
    pauseButton.setAttribute('aria-pressed', 'false');
    this.updateSuccessReplayControls();
    this.updateSuccessReplayProgress();
    this.successReplay.nextDueAt = performance.now() + 320;
    this.successReplayTimer = window.setTimeout(() => this.playNextSuccessReplayStep(), 320);
  }

  playNextSuccessReplayStep() {
    const state = this.successReplay;
    if (!state || state.paused) return;
    if (state.generation !== this.boardAnimationGeneration) {
      this.stopSuccessReplay();
      return;
    }
    state.nextDueAt = null;
    if (state.index >= state.replay.steps.length) {
      this.finishSuccessReplayWhenSettled();
      return;
    }
    const step = state.replay.steps[state.index];
    state.index += 1;
    const timing = this.applySuccessReplayStep(step, state);
    this.updateSuccessReplayProgress();
    const isLast = state.index >= state.replay.steps.length;
    const delayMs = isLast ? timing.settleMs : timing.cadenceMs;
    state.nextDueAt = performance.now() + delayMs;
    state.pauseRemainingMs = null;
    this.successReplayTimer = window.setTimeout(
      () => this.playNextSuccessReplayStep(),
      delayMs,
    );
  }

  applySuccessReplayStep(step, state = this.successReplay) {
    if (!state || state.generation !== this.boardAnimationGeneration) {
      return { cadenceMs: 0, settleMs: 0 };
    }
    const flags = step.flags || [];
    const opened = step.opened || [];
    const updatedClues = step.updatedClues || [];
    const reductionMines = step.reductionMines || [];
    const purgedMines = step.purgedMines || [];
    const leadFlags = step.leadFlags || [];
    const purgedMineKeys = new Set(purgedMines.map((point) => this.pointKey(point)));
    const openedKeys = new Set(opened.map((point) => this.pointKey(point)));
    // New Sector-Purge replays keep each removed mine coordinate as a
    // recalculated clue. Legacy tapes did not record that target in `opened`,
    // so only those older entries still become physical holes during replay.
    const physicallyPurgedMines = purgedMines
      .filter((point) => !openedKeys.has(this.pointKey(point)));
    const replacementLeadFlagKeys = new Set(
      leadFlags
        .map((point) => this.pointKey(point))
        .filter((key) => purgedMineKeys.has(key) && openedKeys.has(key)),
    );
    const hasLeadFlagPurge = leadFlags.some((point) => purgedMineKeys.has(this.pointKey(point)));
    const hasElimination = reductionMines.length > 0 || purgedMines.length > 0;
    for (const point of flags) this.setFlagLocal(point.x, point.y, point.z, true, false, { animate: true });
    if (flags.length) sfx.playFlag();

    const leadMs = hasLeadFlagPurge
      ? 0
      : (flags.length && (opened.length || hasElimination) ? 180 : 0);
    let maximumRevealDelay = 0;
    let maximumRevealEnd = 0;
    for (const point of opened) {
      const timing = revealAnimationTiming(Math.max(0, Number(point.wave) || 0));
      const delayMs = timing.delayMs + (replacementLeadFlagKeys.has(this.pointKey(point))
        ? BOARD_ANIMATION_TIMING.sectorPurgeFlagPreviewMs
        : 0);
      maximumRevealDelay = Math.max(maximumRevealDelay, delayMs);
      maximumRevealEnd = Math.max(maximumRevealEnd, delayMs + timing.durationMs);
    }
    const sectorEnd = sectorPurgeAnimationTiming(purgedMines.length, {
      flagPreview: hasLeadFlagPurge,
    }).totalMs;
    const generation = state.generation;
    const beginStep = () => {
      if (!this.successReplay || generation !== this.boardAnimationGeneration) return;
      if (hasElimination) {
        const purgedByKey = new Map(state.purged.map((point) => [this.pointKey(point), point]));
        for (const point of physicallyPurgedMines) purgedByKey.set(this.pointKey(point), point);
        state.purged = [...purgedByKey.values()];
        const event = {
          id: `replay:${state.replay.runId}:${step.id}`,
          kind: step.kind,
          mines: [...reductionMines, ...purgedMines],
          reductionMines,
          purgedMines,
          leadFlags,
          clues: updatedClues,
          updatedClues,
          opened,
          cells: step.cells || purgedMines,
          sectorCount: step.sectorCount ?? (purgedMines.length ? 1 : 0),
          at: step.at,
        };
        this.syncPurgedCells({ purged: state.purged, lastPurge: event }, false);
      }

      for (const clue of updatedClues) {
        const cell = this.grid[clue.x]?.[clue.y]?.[clue.z];
        if (cell?.isRevealed) this.revealServerCell(clue, false);
      }

      const effects = new Map();
      for (const point of opened) {
        const timing = revealAnimationTiming(Math.max(0, Number(point.wave) || 0));
        const holdLeadFlag = replacementLeadFlagKeys.has(this.pointKey(point));
        const delayMs = timing.delayMs + (holdLeadFlag
          ? BOARD_ANIMATION_TIMING.sectorPurgeFlagPreviewMs
          : 0);
        this.revealServerCell(point, true, {
          durationMs: timing.durationMs,
          delayMs,
          wave: timing.isCascade,
          playSound: false,
          holdFlagUntilReveal: holdLeadFlag,
        });
        const effect = effects.get(delayMs) ?? { points: [], cascade: false };
        const cell = this.grid[point.x]?.[point.y]?.[point.z];
        if (cell) {
          const world = new THREE.Vector3();
          cell.group.getWorldPosition(world);
          effect.points.push(world);
          effect.cascade ||= timing.isCascade;
          effects.set(delayMs, effect);
        }
      }
      for (const [delayMs, effect] of effects) {
        window.setTimeout(() => {
          if (!this.successReplay || generation !== this.boardAnimationGeneration) return;
          sfx.playDig();
          const sampleCount = Math.min(effect.cascade ? 4 : 2, effect.points.length);
          for (let index = 0; index < sampleCount; index += 1) {
            const point = effect.points[Math.floor((index * effect.points.length) / sampleCount)];
            this.particles?.createExplosion(point, 0x29e7ff, effect.cascade ? 6 : 4);
          }
        }, delayMs);
      }
      if (step.target && !opened.some((point) => this.pointKey(point) === this.pointKey(step.target))) {
        const target = this.grid[step.target.x]?.[step.target.y]?.[step.target.z];
        if (target) {
          const world = new THREE.Vector3();
          target.group.getWorldPosition(world);
          this.particles?.createExplosion(world, flags.length ? 0xff4fd8 : 0x29e7ff, 8);
        }
      }
      if (maximumRevealEnd > 0) {
        this.revealAnimationEndsAt = Math.max(
          this.revealAnimationEndsAt,
          performance.now() + maximumRevealEnd,
        );
      }
      state.remainingMineCount = Number.isFinite(Number(step.remainingMineCount))
        ? Number(step.remainingMineCount)
        : state.remainingMineCount;
      this.updateSuccessReplayProgress();
    };
    if (leadMs) window.setTimeout(beginStep, leadMs);
    else beginStep();

    const cadenceMs = leadMs + Math.min(1200, Math.max(
      opened.length ? 360 : 250,
      maximumRevealDelay + 240,
      hasElimination ? Math.max(720, sectorEnd) : 0,
    ));
    const settleMs = leadMs + Math.max(420, maximumRevealEnd + 180, sectorEnd + 180);
    return { cadenceMs, settleMs };
  }

  updateSuccessReplayProgress() {
    const state = this.successReplay;
    if (!state) return;
    const current = Math.min(state.index, state.replay.steps.length);
    const total = state.replay.steps.length;
    document.getElementById('replay-hud-progress').textContent = state.finished
      ? this.t('replay.complete')
      : this.t('replay.progress', { current, total });

    const totalCells = this.width * this.height * this.depth;
    const safeCells = Math.max(0, totalCells - state.purged.length - state.remainingMineCount);
    const percent = safeCells > 0
      ? Math.min(100, Math.round((this.revealedCount / safeCells) * 100))
      : 100;
    const mineStatus = `${this.flaggedCount} / ${state.remainingMineCount}`;
    document.getElementById('stat-mines').innerText = mineStatus;
    document.getElementById('mobile-stat-mines').innerText = mineStatus;
    document.getElementById('stat-progress-percent').innerText = `${percent}%`;
    document.getElementById('stat-progress').style.width = `${percent}%`;
    document.getElementById('mobile-stat-progress').innerText = `${percent}%`;
  }

  updateSuccessReplayControls() {
    const state = this.successReplay;
    if (!state) return;
    const pauseButton = document.getElementById('btn-replay-pause');
    const key = state.paused ? 'replay.resume' : 'replay.pause';
    pauseButton.setAttribute('aria-pressed', String(state.paused));
    pauseButton.setAttribute('aria-label', this.t(key));
    document.getElementById('replay-toggle-label').textContent = this.t(key);
    document.getElementById('replay-toggle-icon').textContent = state.paused ? '▶' : 'Ⅱ';
  }

  toggleSuccessReplayPause() {
    const state = this.successReplay;
    if (!state || state.finished) return;
    if (!state.paused) {
      state.paused = true;
      state.pauseRemainingMs = Math.max(
        0,
        (state.nextDueAt ?? performance.now()) - performance.now(),
      );
      clearTimeout(this.successReplayTimer);
      this.successReplayTimer = null;
    } else {
      state.paused = false;
      const delayMs = Math.max(50, state.pauseRemainingMs ?? 100);
      state.nextDueAt = performance.now() + delayMs;
      state.pauseRemainingMs = null;
      this.successReplayTimer = window.setTimeout(() => this.playNextSuccessReplayStep(), delayMs);
    }
    this.updateSuccessReplayControls();
  }

  finishSuccessReplayWhenSettled() {
    const state = this.successReplay;
    if (!state || state.paused) return;
    if (state.generation !== this.boardAnimationGeneration) {
      this.stopSuccessReplay();
      return;
    }
    if (this.cellRevealAnimations.length || this.sectorPurgeAnimations.length) {
      state.nextDueAt = performance.now() + 50;
      this.successReplayTimer = window.setTimeout(() => this.finishSuccessReplayWhenSettled(), 50);
      return;
    }
    state.nextDueAt = null;
    this.finishSuccessReplay();
  }

  finishSuccessReplay() {
    const state = this.successReplay;
    if (!state || state.finished) return;
    state.finished = true;
    document.getElementById('btn-replay-pause').disabled = true;
    this.updateSuccessReplayProgress();
    sfx.playWin();
    const center = new THREE.Vector3(0, 0, 0);
    this.particles?.createExplosion(center, 0x39ff14, 90);
    window.setTimeout(() => {
      if (this.successReplay === state) this.particles?.createExplosion(center, 0x29e7ff, 90);
    }, 180);
    window.setTimeout(() => {
      if (this.successReplay === state) this.particles?.createExplosion(center, 0xff4fd8, 90);
    }, 360);
    this.successReplayTimer = window.setTimeout(() => this.stopSuccessReplay(), 1200);
  }

  stopSuccessReplay() {
    const state = this.successReplay;
    if (!state) return;
    clearTimeout(this.successReplayTimer);
    this.successReplayTimer = null;
    const snapshot = this.pendingReplaySnapshot ?? state.finalSnapshot;
    const returnSurface = state.returnSurface;
    this.successReplay = null;
    this.pendingReplaySnapshot = null;
    document.body.classList.remove('replay-active');
    document.getElementById('replay-hud').classList.add('hidden');
    document.getElementById('btn-replay-pause').disabled = false;
    if (this.controls) {
      this.controls.autoRotate = state.previousAutoRotate;
      if (Number.isFinite(state.previousAutoRotateSpeed)) {
        this.controls.autoRotateSpeed = state.previousAutoRotateSpeed;
      }
    }

    const snapshotWillRebuild = CONFIG_KEYS.some(
      (key) => snapshot.config?.[key] !== this.roomSnapshot?.config?.[key],
    ) || (snapshot.phase === 'ready' && this.roomSnapshot?.phase !== 'ready');
    if (!snapshotWillRebuild) {
      this.applyConfig(snapshot.config);
      this.buildGridLocal();
    }
    this.applyRoomSnapshot(snapshot, true);
    if (snapshot.phase !== 'won' && this.dialogueState?.allowReplay) this.dialogueState = null;
    if (snapshot.phase === 'won' && returnSurface === 'dialogue' && this.dialogueState) {
      this.renderSilverWolfDialogue();
    } else if (snapshot.phase === 'won' && returnSurface === 'modal') {
      document.getElementById('modal-overlay').classList.remove('hidden');
    }
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
          this.triggerGameOver(this.pendingGameOver.x, this.pendingGameOver.y, this.pendingGameOver.z, {
            playExplosionSound: false,
          });
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
    this.controls.enablePan = false;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.rotateSpeed = 0.9;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.applyControlBindings();
    this.controls.target.set(0, 0, 0);
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
    // Keep the pole anchored in the cube while lifting the banner above the
    // opaque flagged shell so the mark stays visible from oblique angles.
    flagGroup.position.y = 0.58;
    this.geometries.flag = flagGroup;
    const automatedFlagGroup = flagGroup.clone(true);
    automatedFlagGroup.children[0].material = new THREE.MeshBasicMaterial({ color: 0xffd2df });
    automatedFlagGroup.children[1].material = new THREE.MeshBasicMaterial({
      color: 0xff174d,
      side: THREE.DoubleSide,
    });
    automatedFlagGroup.userData.ultimateHackAutomated = true;
    this.geometries.automatedFlag = automatedFlagGroup;

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

    this.materials.cellAutomatedFlagged = new THREE.MeshStandardMaterial({
      color: 0xff174d,
      emissive: 0x8f001f,
      emissiveIntensity: 0.88,
      roughness: 0.18,
      metalness: 0.72,
      transparent: false,
    });

    this.materials.cellAutomatedFlaggedHovered = new THREE.MeshStandardMaterial({
      color: 0xff5478,
      emissive: 0xb5002c,
      emissiveIntensity: 1.05,
      roughness: 0.12,
      metalness: 0.78,
      transparent: false,
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
    dom.addEventListener('wheel', (event) => this.handleConfiguredWheel(event), { capture: true, passive: false });
    // A second mouse button emits another `mousedown`, but not another
    // `pointerdown`. Listen here so left+right chords work in either order.
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.clearPointerHighlights();
        return;
      }
      const chordButton = e.button === 0 ? 1 : (e.button === 2 ? 2 : 0);
      if (!chordButton) return;
      this.mouseChordButtons = mergeTwoButtonState(this.mouseChordButtons, e.buttons, chordButton);
      const focusTarget = this.mouseChordFocusTarget ?? this.currentPointerFocusTarget();
      const currentTarget = focusTarget ?? this.pickTwoButtonTargetAtPointer(e);
      if ((this.mouseChordButtons & 3) !== 3) {
        this.mouseChordFocusTarget = focusTarget;
        this.mouseChordAnchor = {
          target: currentTarget,
          clientX: e.clientX,
          clientY: e.clientY,
          cameraDirection: this.cameraDirectionFromTarget(),
        };
        return;
      }
      if (this.mouseChordTriggered) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.mouseChordTriggered = true;
      const anchor = this.mouseChordAnchor;
      const anchorDistance = anchor
        ? Math.hypot(e.clientX - anchor.clientX, e.clientY - anchor.clientY)
        : 0;
      const currentCameraDirection = this.cameraDirectionFromTarget();
      const cameraMoved = Boolean(anchor?.cameraDirection && currentCameraDirection
        && anchor.cameraDirection.angleTo(currentCameraDirection) >= 0.002);
      this.handleTwoButtonActionAtPointer(e, {
        focusTarget: this.mouseChordFocusTarget,
        anchorTarget: anchor?.target ?? null,
        dragDistance: cameraMoved ? Number.POSITIVE_INFINITY : anchorDistance,
        dragThreshold: 10,
      });
      this.clearPointerHighlights();
    }, { capture: true });
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse'
        && (e.button === 0 || e.button === 2)
        && (this.mouseChordButtons & 3) === 0) {
        // Snapshot the visible focus before right-button number inspection can
        // replace the glowing cube with a neighborhood highlight.
        this.handlePointerMove(e);
        this.mouseChordFocusTarget = this.currentPointerFocusTarget();
      }
      this.mouseDownPos.x = e.clientX;
      this.mouseDownPos.y = e.clientY;
      this.mouseDownTime = performance.now();
      this.cameraPointerStartDirection = this.cameraDirectionFromTarget();
      this.touchHoldTriggered = false;
      this.touchInspectionActive = false;
      clearTimeout(this.touchHoldTimer);
      if (e.pointerType === 'mouse' && e.button === 1) {
        this.clearPointerHighlights();
      } else if (e.button === 2) {
        this.startNeighborInspection(e);
      } else if (e.pointerType === 'touch') {
        this.activeTouchPointers.add(e.pointerId);
        if (this.activeTouchPointers.size > 1) {
          this.touchGestureHadMultiplePointers = true;
          this.touchHoldTimer = null;
          this.clearPointerHighlights();
          return;
        }
        const touchPoint = { clientX: e.clientX, clientY: e.clientY, pointerType: 'touch' };
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
        if ((e.buttons & 3) === 0) this.resetMouseChordState();
        this.clearPointerHighlights();
        return;
      }
      const wasMultiTouchGesture = e.pointerType === 'touch' && (
        this.touchGestureHadMultiplePointers || this.activeTouchPointers.size > 1
      );
      if (e.pointerType === 'touch') this.activeTouchPointers.delete(e.pointerId);
      if (e.pointerType === 'touch' && this.touchHoldTriggered) {
        if (this.touchInspectionActive) {
          this.clearPointerHighlights({ completeInspection: true });
        }
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
      const currentCameraDirection = this.cameraDirectionFromTarget();
      const cameraAngle = this.cameraPointerStartDirection && currentCameraDirection
        ? this.cameraPointerStartDirection.angleTo(currentCameraDirection)
        : 0;
      const rotatedMatrix = distance >= 5 && cameraAngle >= 0.002;
      this.cameraPointerStartDirection = null;
      if (e.pointerType === 'mouse' && e.button === 1) {
        this.clearPointerHighlights();
        return;
      }
      
      const clickDistance = e.pointerType === 'touch' ? 12 : 5;
      const clickDuration = e.pointerType === 'touch' ? 500 : 250;
      if (!rotatedMatrix && distance < clickDistance && timeElapsed < clickDuration) {
        this.handleCanvasClick(e);
      }
      if (e.pointerType === 'touch' && this.activeTouchPointers.size === 0) {
        this.touchGestureHadMultiplePointers = false;
      }
    });

    const stopNeighborInspection = (event) => {
      if (event.pointerType === 'mouse' && (event.buttons & 3) === 0) this.resetMouseChordState();
      if (event.type === 'pointercancel') {
        if (event.pointerType === 'mouse') this.resetMouseChordState();
        clearTimeout(this.touchHoldTimer);
        this.touchHoldTimer = null;
        this.touchHoldTriggered = false;
        this.touchInspectionActive = false;
        if (event.pointerType === 'touch') this.activeTouchPointers.delete(event.pointerId);
        if (this.activeTouchPointers.size === 0) this.touchGestureHadMultiplePointers = false;
      }
      if (event.type === 'pointerup' && event.button !== 2) return;
      this.clearPointerHighlights({
        completeInspection: event.type === 'pointerup'
          && event.pointerType === 'mouse'
          && event.button === 2,
      });
    };
    window.addEventListener('pointerup', stopNeighborInspection);
    window.addEventListener('pointercancel', stopNeighborInspection);
    window.addEventListener('mouseup', (event) => {
      this.mouseChordButtons = event.buttons & 3;
      if (this.mouseChordButtons === 0) this.resetMouseChordState();
    }, { capture: true });
    window.addEventListener('blur', () => {
      this.resetMouseChordState();
      this.clearPointerHighlights();
    });
    dom.addEventListener('lostpointercapture', (event) => {
      if (event.pointerType === 'mouse') this.resetMouseChordState();
    });

    // 鼠标移动监听，用于方块 Hover 效果
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && (e.buttons & 4) !== 0) {
        this.clearPointerHighlights();
        return;
      }
      if (e.pointerType === 'mouse' && this.mouseChordTriggered) {
        this.clearPointerHighlights();
        return;
      }
      if (e.pointerType === 'mouse'
        && this.controlSettings.rightDragAction !== 'none'
        && (e.buttons & 2) !== 0) {
        const dx = e.clientX - this.mouseDownPos.x;
        const dy = e.clientY - this.mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 5) {
          this.clearPointerHighlights();
          return;
        }
      }
      // Once the first chord button is down, the visible highlight is the
      // locked action target. Do not let tiny inter-button jitter retarget the
      // hover while the eventual action still belongs to the original cell.
      if (e.pointerType === 'mouse' && (this.mouseChordButtons & 3) !== 0) return;
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
      if (event.pointerType === 'mouse' && (event.buttons & 3) === 0) this.resetMouseChordState();
      this.clearPointerHighlights();
    });
    dom.addEventListener('auxclick', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    dom.addEventListener('contextmenu', (event) => event.preventDefault());
    dom.addEventListener('selectstart', (event) => event.preventDefault());
    dom.addEventListener('dragstart', (event) => event.preventDefault());
  }

  // -------------------------------------------------------------
  // 5. 游戏引擎：扫雷核心算法
  // -------------------------------------------------------------
  startNewGame() {
    if (this.successReplay || this.ultimateHackRunning()) return;
    // Invalidate every delayed reveal / victory callback as soon as restart is
    // requested. Waiting for the authoritative snapshot leaves a network-sized
    // window where effects from the previous board could enter the new game.
    this.boardAnimationGeneration += 1;
    this.sectorPurgeAnimations = [];
    this.cellRevealAnimations = [];
    this.revealAnimationEndsAt = 0;

    const me = this.roomSnapshot?.players?.find((player) => player.id === this.currentPlayerId);
    if (me && !me.isHost) return;

    if (this.gameMode === 'solo' && this.taskFlow === 'campaign') {
      const config = TASK_MISSIONS[this.taskMission] ?? TASK_MISSIONS.easy;
      this.roomClient.send({ op: 'restart', config }).catch(error => this.handleRoomError(error));
      return;
    }
    // 读取自定义设置，如果有的话
    const isCustomActive = document.getElementById('custom-toggle').classList.contains('active');
    let width;
    let height;
    let depth;
    let mineCount;
    if (isCustomActive) {
      const customW = parseInt(document.getElementById('input-w').value) || 5;
      const customH = parseInt(document.getElementById('input-h').value) || 5;
      const customD = parseInt(document.getElementById('input-d').value) || 5;
      const customM = parseInt(document.getElementById('input-m').value) || 10;

      width = Math.min(15, Math.max(2, customW));
      height = Math.min(15, Math.max(2, customH));
      depth = Math.min(15, Math.max(2, customD));

      const maxMines = Math.floor(width * height * depth * 0.6); // 最大地雷数量限制为 60%
      mineCount = Math.min(maxMines, Math.max(1, customM));
    } else {
      const activeBtn = document.querySelector('.btn-preset.active');
      if (activeBtn) {
        width = Number.parseInt(activeBtn.dataset.w, 10);
        height = Number.parseInt(activeBtn.dataset.h, 10);
        depth = Number.parseInt(activeBtn.dataset.d, 10);
        mineCount = Number.parseInt(activeBtn.dataset.m, 10);
      }
    }

    const config = {
      width: width ?? this.width,
      height: height ?? this.height,
      depth: depth ?? this.depth,
      mineCount: mineCount ?? this.mineCount,
      ruleset: this.ruleset,
      autoPurge: this.autoPurgeEnabled,
      reduction: this.reductionEnabled,
      campaign: false,
    };
    if (this.gameMode === 'solo') {
      this.pendingTaskMission = this.missionFromConfig(config);
      this.pendingTaskConfig = { ...config };
    }
    this.isInteractionLocked = true;

    // 房主向 Durable Object 请求初始化，服务端验证参数并重置权威棋盘
    this.roomClient.send({
      op: 'restart',
      config,
    })
      .catch(error => {
        this.isInteractionLocked = ['revive', 'lost', 'won'].includes(this.roomSnapshot?.phase);
        this.handleRoomError(error);
      });
  }

  buildGridLocal() {

    this.clearGuidedTarget();
    this.clearSolverHint();
    this.clearMediumChordObjectiveMarker();

    // 重置状态
    this.isFirstClick = true;
    this.isGameOver = false;
    this.isGameWon = false;
    this.isInteractionLocked = false;
    this.revealedCount = 0;
    this.flaggedCount = 0;
    this.sectorPurgeAnimations = [];
    this.cellRevealAnimations = [];
    this.boardAnimationGeneration += 1;
    this.revealAnimationEndsAt = 0;
    this.lastSectorPurgeId = null;
    clearTimeout(this.sectorPurgeBannerTimer);
    clearTimeout(this.lastMobileCellTap?.timer);
    this.lastMobileCellTap = null;
    document.getElementById('sector-purge-banner')?.classList.add('hidden');
    this.clearPointerHighlights();
    this.hoveredCell = null;
    this.hoveredNumberCell = null;
    this.activeHighlightCenter = null;
    this.resetMouseChordState();
    this.hasInspectedNeighbors = false;
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
                  obj.material.forEach(m => {
                    m.map?.dispose?.();
                    m.dispose();
                  });
                } else {
                  obj.material.map?.dispose?.();
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
            isAutomatedFlag: false,
            isPurged: false,
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

  handleMobileCellTap(x, y, z) {
    const now = performance.now();
    const previous = this.lastMobileCellTap;
    const sameCell = previous
      && previous.x === x
      && previous.y === y
      && previous.z === z
      && now - previous.at <= this.mobileCellDoubleTapMs;
    if (sameCell) {
      clearTimeout(previous.timer);
      this.lastMobileCellTap = null;
      navigator.vibrate?.(18);
      this.reduceCell(x, y, z);
      return;
    }

    const cell = this.grid[x]?.[y]?.[z];
    if (!cell || cell.isPurged || cell.isRevealed) return;
    const tap = { x, y, z, at: now, mode: this.activeMode, timer: null };
    this.lastMobileCellTap = tap;
    tap.timer = window.setTimeout(() => {
      if (tap.mode === 'flag') this.toggleFlag(x, y, z);
      else this.dig(x, y, z);
      if (this.lastMobileCellTap === tap) this.lastMobileCellTap = null;
    }, this.mobileCellDoubleTapMs);
  }

  resetMouseChordState() {
    this.mouseChordTriggered = false;
    this.mouseChordButtons = 0;
    this.mouseChordAnchor = null;
    this.mouseChordFocusTarget = null;
  }

  currentPointerFocusTarget() {
    const focusedNumber = targetFromFocusedNumber(this.hoveredNumberCell);
    if (focusedNumber) return focusedNumber;
    const focusedCell = targetFromFocusedCell(this.hoveredCell);
    if (focusedCell) return focusedCell;
    if (!this.activeHighlightCenter) return null;
    return { ...this.activeHighlightCenter, type: 'number' };
  }

  pickTwoButtonTargetAtPointer(event, { includeClueProxy = false } = {}) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const primaryTargets = [];
    const clueProxyTargets = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.depth; z++) {
          const cell = this.grid[x][y][z];
          if (!cell.group.visible) continue;
          if (!cell.isRevealed) {
            if (cell.mesh.visible) primaryTargets.push(cell.mesh);
          }
          else if (cell.neighborMines > 0 && cell.spriteInstance) {
            if (cell.spriteInstance.visible) primaryTargets.push(cell.spriteInstance);
            // Raycast this invisible full-size shell only if no actually visible
            // cube or number sprite was hit. Otherwise it can block inner cubes.
            clueProxyTargets.push(cell.mesh);
          }
        }
      }
    }

    return resolveTwoButtonRayHits(
      this.raycaster.intersectObjects(primaryTargets),
      includeClueProxy ? this.raycaster.intersectObjects(clueProxyTargets) : [],
      (x, y, z) => this.grid[x]?.[y]?.[z],
    );
  }

  performTwoButtonAction(target) {
    if (!target) return false;
    const { x, y, z, type } = target;
    if (type === 'number') {
      this.chord(x, y, z);
      return true;
    }
    const cell = this.grid[x]?.[y]?.[z];
    if (this.reductionEnabled && cell && !cell.isRevealed && !cell.isPurged) {
      this.reduceCell(x, y, z);
      return true;
    }
    return false;
  }

  handleTwoButtonActionAtPointer(event, gesture = {}) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) return false;
    const currentTarget = this.pickTwoButtonTargetAtPointer(event);
    const getCell = (x, y, z) => this.grid[x]?.[y]?.[z];
    for (const target of resolveTwoButtonGestureTargets({ ...gesture, currentTarget }, getCell)) {
      if (this.performTwoButtonAction(target)) return true;
    }
    return false;
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

    const intersects = this.raycaster.intersectObjects(targets)
      .filter((intersection) => intersectionHitsVisibleNumberPixel(intersection));

    if (intersects.length > 0) {
      const guidedFlagTarget = this.guidedTutorialActive && this.guidedTutorialTarget?.action === 'flag'
        ? this.guidedTutorialTarget
        : null;
      const guidedFlagHit = guidedFlagTarget && intersects.find(({ object }) => (
        object.userData.type === 'cell'
        && object.userData.x === guidedFlagTarget.x
        && object.userData.y === guidedFlagTarget.y
        && object.userData.z === guidedFlagTarget.z
      ));
      if (guidedFlagHit && (event.button === 2 || event.pointerType === 'touch' || this.activeMode === 'flag')) {
        this.lastMobileNumberTap = null;
        this.toggleFlag(guidedFlagTarget.x, guidedFlagTarget.y, guidedFlagTarget.z);
        return;
      }
      const topObject = intersects[0].object;
      if (event.pointerType === 'touch' && topObject.userData.type === 'number') {
        const { x, y, z } = topObject.userData;
        this.handleMobileNumberTap(x, y, z);
        return;
      }
      if (
        event.pointerType === 'touch'
        && this.reductionEnabled
        && topObject.userData.type === 'cell'
      ) {
        const { x, y, z } = topObject.userData;
        this.lastMobileNumberTap = null;
        this.handleMobileCellTap(x, y, z);
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
    const target = this.pickTwoButtonTargetAtPointer(event, {
      includeClueProxy: event.pointerType === 'touch',
    });
    if (target?.type !== 'number') return;
    const { x, y, z } = target;
    this.focusNumberCell(this.grid[x]?.[y]?.[z]);
    if (this.hoveredCell && !this.hoveredCell.isRevealed) {
      this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
      this.hoveredCell.outline.material = this.materials.wireframe;
    }
    this.hoveredCell = null;
    this.highlightNeighborsOn(x, y, z);
    this.activeHighlightCenter = { x, y, z };
  }

  // 右键按住数字时高亮显示周围的邻居格子
  highlightNeighborsOn(cx, cy, cz) {
    const neighbors = this.getNeighbors(cx, cy, cz);
    sfx.playHover(); // 播放一声提示音
    
    neighbors.forEach(n => {
      const cell = this.grid[n.x]?.[n.y]?.[n.z];
      if (cell && !cell.isRevealed) {
        cell.mesh.material = cell.isFlagged ? this.flagMaterialForCell(cell, true) : this.materials.cellHovered;
        cell.outline.material = this.materials.wireframeHovered;
      }
    });
  }

  // 松开右键时恢复周围邻居格子的原状
  highlightNeighborsOff(cx, cy, cz) {
    const neighbors = this.getNeighbors(cx, cy, cz);
    neighbors.forEach(n => {
      const cell = this.grid[n.x]?.[n.y]?.[n.z];
      if (cell && !cell.isRevealed) {
        // 如果正好被鼠标悬浮着，不强行恢复为普通材质
        if (this.hoveredCell === cell) {
          cell.mesh.material = cell.isFlagged ? this.flagMaterialForCell(cell, true) : this.materials.cellHovered;
          cell.outline.material = this.materials.wireframeHovered;
        } else {
          cell.mesh.material = cell.isFlagged ? this.flagMaterialForCell(cell) : this.materials.cellUnrevealed;
          cell.outline.material = this.materials.wireframe;
        }
      }
    });
  }

  createNumberHoverMarker() {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 96, 96);
    context.strokeStyle = '#ff4fd8';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.shadowColor = 'rgba(255, 79, 216, 0.95)';
    context.shadowBlur = 9;
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const start = quadrant * Math.PI / 2 + 0.2;
      context.beginPath();
      context.arc(48, 48, 34, start, start + 0.72);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }));
    marker.scale.set(0.96, 0.96, 1);
    marker.renderOrder = 1002;
    marker.userData.pointerFocusDecoration = true;
    return marker;
  }

  clearHoveredNumber() {
    const cell = this.hoveredNumberCell;
    if (!cell) return;
    if (cell.spriteInstance) {
      cell.spriteInstance.scale.set(0.72, 0.72, 0.72);
      cell.spriteInstance.renderOrder = 0;
    }
    const marker = cell.numberHoverMarker;
    if (marker) {
      marker.parent?.remove(marker);
      marker.material?.map?.dispose?.();
      marker.material?.dispose?.();
      cell.numberHoverMarker = null;
    }
    this.hoveredNumberCell = null;
  }

  focusNumberCell(cell) {
    if (!cell?.spriteInstance || this.hoveredNumberCell === cell) return;
    this.clearHoveredNumber();
    cell.spriteInstance.scale.set(0.9, 0.9, 0.9);
    cell.spriteInstance.renderOrder = 1003;
    const marker = this.createNumberHoverMarker();
    cell.group.add(marker);
    cell.numberHoverMarker = marker;
    this.hoveredNumberCell = cell;
    sfx.playHover();
  }

  clearPointerHighlights({ completeInspection = false } = {}) {
    // Only a normal mouse/touch release commits the tutorial action. Drag,
    // chord, leave, blur, slice, and reset paths call this as a cancellation.
    const completedNeighborInspection = Boolean(this.activeHighlightCenter);
    if (this.activeHighlightCenter) {
      const { x, y, z } = this.activeHighlightCenter;
      this.highlightNeighborsOff(x, y, z);
      this.activeHighlightCenter = null;
    }
    if (this.hoveredCell && !this.hoveredCell.isRevealed) {
      this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
      this.hoveredCell.outline.material = this.materials.wireframe;
    }
    this.hoveredCell = null;
    this.clearHoveredNumber();
    if (completeInspection && completedNeighborInspection) {
      this.hasInspectedNeighbors = true;
      this.updateSoloGuide();
      this.completeTutorialAction('inspect');
    }
  }

  // 监听鼠标悬浮移动，提供科技感的 Hover 提示
  handlePointerMove(event) {
    if (this.isInteractionLocked || this.isGameOver || this.isGameWon) {
      this.clearPointerHighlights();
      return;
    }

    if (this.activeHighlightCenter) {
      if (this.hoveredCell && !this.hoveredCell.isRevealed) {
        this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
        this.hoveredCell.outline.material = this.materials.wireframe;
      }
      this.hoveredCell = null;
      this.clearHoveredNumber();
      return;
    }

    const target = this.pickTwoButtonTargetAtPointer(event, { includeClueProxy: false });
    if (target?.type === 'number') {
      if (this.hoveredCell && !this.hoveredCell.isRevealed) {
        this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
        this.hoveredCell.outline.material = this.materials.wireframe;
      }
      this.hoveredCell = null;
      this.focusNumberCell(this.grid[target.x]?.[target.y]?.[target.z]);
      return;
    }

    this.clearHoveredNumber();
    const cell = target?.type === 'cell' ? this.grid[target.x]?.[target.y]?.[target.z] : null;
    if (cell && this.hoveredCell !== cell) {
      if (this.hoveredCell && !this.hoveredCell.isRevealed) {
        this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
        this.hoveredCell.outline.material = this.materials.wireframe;
      }
      cell.mesh.material = cell.isFlagged ? this.flagMaterialForCell(cell, true) : this.materials.cellHovered;
      cell.outline.material = this.materials.wireframeHovered;
      sfx.playHover();
      this.hoveredCell = cell;
    } else if (!cell && this.hoveredCell) {
      if (!this.hoveredCell.isRevealed) {
        this.hoveredCell.mesh.material = this.hoveredCell.isFlagged ? this.flagMaterialForCell(this.hoveredCell) : this.materials.cellUnrevealed;
        this.hoveredCell.outline.material = this.materials.wireframe;
      }
      this.hoveredCell = null;
    }
  }

  // -------------------------------------------------------------
  // 7. 挖掘 (Dig) 与 连锁展开 (Cascade) 算法
  // -------------------------------------------------------------
  
  dig(x, y, z) {
    if (this.isInteractionLocked || this.blockBeginnerBoardInput()) return;
    if (!this.isGuidedActionAllowed('dig', x, y, z)) return;
    const cell = this.grid[x][y][z];
    if (cell.isPurged || cell.isRevealed || cell.isFlagged) return;
    this.sendGuidedBoardCommand({ op: 'dig', x, y, z });
  }

  chord(x, y, z) {
    if (this.isInteractionLocked || this.blockBeginnerBoardInput()) return;
    if (!this.isGuidedActionAllowed('chord', x, y, z)) return;
    const cell = this.grid[x]?.[y]?.[z];
    if (!cell?.isRevealed || cell.isPurged || cell.neighborMines <= 0) return;
    const flaggedAround = this.getNeighbors(x, y, z)
      .filter((point) => this.grid[point.x][point.y][point.z].isFlagged)
      .length;
    if (flaggedAround !== cell.neighborMines) return;
    this.roomClient.send({ op: 'chord', x, y, z }).catch(error => this.handleRoomError(error));
  }

  reduceCell(x, y, z) {
    if (this.isInteractionLocked || this.blockBeginnerBoardInput() || !this.reductionEnabled) return;
    const cell = this.grid[x]?.[y]?.[z];
    if (!cell || cell.isPurged || cell.isRevealed) return;
    this.roomClient.send({ op: 'reduce', x, y, z }).catch(error => this.handleRoomError(error));
  }

  triggerMineLocal(x, y, z, { showMine = true } = {}) {
    const cell = this.grid[x][y][z];
    clearInterval(this.timerInterval);
    
    sfx.playExplosion();
    if (showMine) {
      cell.isRevealed = true;
      this.animateCellReveal(cell);
      const mineMesh = this.geometries.mine.clone();
      cell.group.add(mineMesh);
      cell.mineInstance = mineMesh;
    } else {
      cell.isRevealed = false;
      cell.mesh.visible = true;
      cell.outline.visible = true;
      cell.mesh.material = cell.isFlagged ? this.flagMaterialForCell(cell) : this.materials.cellUnrevealed;
    }
    
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
    document.getElementById('modal-stat-progress').innerText = `${this.currentBoardProgress().percent}%`;
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
  animateCellReveal(cell, {
    durationMs = BOARD_ANIMATION_TIMING.cellRevealDurationMs,
    delayMs = 0,
    wave = false,
    onStart = null,
  } = {}) {
    const mesh = cell.mesh;
    const outline = cell.outline;
    const animationId = (cell.revealAnimationId ?? 0) + 1;
    cell.revealAnimationId = animationId;

    mesh.visible = true;
    outline.visible = true;
    mesh.scale.setScalar(1);
    outline.scale.setScalar(1);
    this.cellRevealAnimations.push({
      cell,
      mesh,
      outline,
      animationId,
      startedAt: performance.now() + delayMs,
      durationMs,
      wave,
      onStart,
      started: false,
    });
  }

  updateCellRevealAnimations(now = performance.now()) {
    for (let index = this.cellRevealAnimations.length - 1; index >= 0; index -= 1) {
      const animation = this.cellRevealAnimations[index];
      if (animation.cell.revealAnimationId !== animation.animationId) {
        this.cellRevealAnimations.splice(index, 1);
        continue;
      }
      if (now < animation.startedAt) continue;
      if (!animation.started) {
        animation.started = true;
        animation.onStart?.();
      }
      const progress = Math.min(1, (now - animation.startedAt) / animation.durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      const wavePulse = animation.wave && progress < 0.42
        ? Math.sin((progress / 0.42) * Math.PI) * 0.18
        : 0;
      const scale = Math.max(0.02, 1 - eased + wavePulse);
      if (progress >= 1) {
        animation.mesh.visible = false;
        animation.outline.visible = false;
        // Keep the hidden shell at full size only as a generous mobile
        // long-press inspection fallback. Desktop targeting ignores it.
        animation.mesh.scale.setScalar(1);
        animation.outline.scale.setScalar(1);
        this.cellRevealAnimations.splice(index, 1);
      } else {
        animation.mesh.scale.setScalar(scale);
        animation.outline.scale.setScalar(scale);
      }
    }
  }

  // 创建酷炫的 3D 浮空数字贴图
  createNumberSprite(cell) {
    const num = cell.neighborMines;
    if (cell.spriteInstance) this.removeNumberSprite(cell);
    
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

    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const numberAlpha = new Uint8Array(canvas.width * canvas.height);
    for (let index = 0; index < numberAlpha.length; index += 1) {
      numberAlpha[index] = pixelData[index * 4 + 3];
    }

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
    sprite.userData = {
      x: cell.x,
      y: cell.y,
      z: cell.z,
      type: 'number',
      numberHitMask: { width: canvas.width, height: canvas.height, alpha: numberAlpha },
    };
    
    cell.group.add(sprite);
    cell.spriteInstance = sprite;
    if (
      this.mediumChordObjectiveTarget
      && this.pointKey(this.mediumChordObjectiveTarget) === this.pointKey(cell)
    ) {
      this.ensureMediumChordObjectiveMarker();
    }

    // 伴随微小的漂浮浮动动画，增强灵动感
    let t = 0;
    const floatAnim = () => {
      if (!cell.isRevealed || cell.spriteInstance !== sprite || this.isFirstClick) return;
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
    if (this.isInteractionLocked || this.blockBeginnerBoardInput()) return;
    if (!this.isGuidedActionAllowed('flag', x, y, z)) return;
    const cell = this.grid[x][y][z];
    if (cell.isPurged || cell.isRevealed) return;
    this.sendGuidedBoardCommand({ op: 'flag', x, y, z });
  }

  toggleFlagLocal(x, y, z) {
    const cell = this.grid[x][y][z];
    
    // 如果已经翻开，无法插旗
    if (cell.isRevealed) return;

    sfx.playFlag();

    if (cell.isFlagged) {
      // 取消标记
      cell.isFlagged = false;
      cell.isAutomatedFlag = false;
      this.automatedFlagKeys.delete(this.pointKey(cell));
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
      cell.isAutomatedFlag = false;
      this.flaggedCount++;

      const flag = this.geometries.flag.clone();
      flag.scale.set(0.9, 0.9, 0.9);
      cell.group.add(flag);
      cell.flagInstance = flag;

      // 让插了旗的方块呈实体状，方便识别
      cell.mesh.material = this.flagMaterialForCell(cell);
    }

    this.updateStats();
  }

  // -------------------------------------------------------------
  // 9. 游戏结束 (GameOver) 与 胜利 (Win)
  // -------------------------------------------------------------
  triggerGameOver(explosionX, explosionY, explosionZ, { playExplosionSound = true } = {}) {
    const animationGeneration = this.boardAnimationGeneration;
    this.isGameOver = true;
    clearInterval(this.timerInterval);
    
    // 隐藏广告弹窗（如果有）
    document.getElementById('ad-modal-overlay').classList.add('hidden');
    
    // 播放地雷大爆炸合成声
    if (playExplosionSound) sfx.playExplosion();

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
      if (this.boardAnimationGeneration !== animationGeneration || !this.roomSnapshot) return;
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
      document.getElementById('modal-stat-progress').innerText = `${this.currentBoardProgress().percent}%`;
      
      modal.classList.remove('hidden');
    }, 1200);
  }

  checkVictory(snapshot = this.roomSnapshot) {
    const { safeCells, revealedCells } = this.currentBoardProgress(snapshot);
    
    if (snapshot?.phase === 'won' || revealedCells >= safeCells) {
      this.isGameWon = true;
      clearInterval(this.timerInterval);

      const waveAnimationWait = Math.max(0, Math.ceil(this.revealAnimationEndsAt - performance.now()));
      const animationGeneration = this.boardAnimationGeneration;
      window.setTimeout(() => {
        if (this.boardAnimationGeneration !== animationGeneration) return;
        // 先完整播放递归波浪，再接获胜和弦与礼花。
        sfx.playWin();
        const centerPos = new THREE.Vector3(0, 0, 0);
        this.particles.createExplosion(centerPos, 0x39ff14, 100);
        setTimeout(() => {
          if (this.boardAnimationGeneration === animationGeneration) this.particles.createExplosion(centerPos, 0x29e7ff, 100);
        }, 200);
        setTimeout(() => {
          if (this.boardAnimationGeneration === animationGeneration) this.particles.createExplosion(centerPos, 0xff4fd8, 100);
        }, 400);
      }, waveAnimationWait);

      // 任务模式由银狼亲自给出章节结算；多人模式保留战绩弹窗
      if (this.gameMode === 'solo') {
        setTimeout(() => {
          if (this.boardAnimationGeneration === animationGeneration) this.showTaskCompletion();
        }, waveAnimationWait + 1200);
        return;
      }
      setTimeout(() => {
        if (this.boardAnimationGeneration !== animationGeneration) return;
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
      }, Math.max(1500, waveAnimationWait + 1200));
    }
  }

  // -------------------------------------------------------------
  // 10. 本地切片视图
  // -------------------------------------------------------------
  handleSliceChange(axis, type) {
    if (this.ultimateHackRunning()) return;
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
    this.refreshMediumChordObjectiveTarget();
    this.updateMissionGuide();
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
          cell.group.visible = !cell.isPurged
            && x >= this.slice.xMin && x <= this.slice.xMax
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
    void userInitiated;
    this.slice.xMin = 0; this.slice.xMax = this.width - 1;
    this.slice.yMin = 0; this.slice.yMax = this.height - 1;
    this.slice.zMin = 0; this.slice.zMax = this.depth - 1;
    this.syncSliceSlidersUI();
    this.updateGridVisibility();
    this.refreshMediumChordObjectiveTarget();
    this.updateMissionGuide();
  }

  // -------------------------------------------------------------
  // 11. 统计面板数据同步
  // -------------------------------------------------------------
  currentBoardProgress(snapshot = this.roomSnapshot) {
    const totalCells = this.width * this.height * this.depth;
    const purgedCells = snapshot?.purged?.length ?? 0;
    const remainingMineCount = snapshot?.remainingMineCount ?? this.mineCount;
    const safeCells = Math.max(0, totalCells - purgedCells - remainingMineCount);
    const revealedCells = snapshot?.revealed?.length ?? this.revealedCount;
    const percent = safeCells > 0 ? Math.min(100, Math.round((revealedCells / safeCells) * 100)) : 100;
    return { safeCells, revealedCells, percent };
  }

  updateStats() {
    // 当前标记数与尚未被压缩/清除的剩余地雷数
    const remainingMineCount = this.roomSnapshot?.remainingMineCount ?? this.mineCount;
    const mineStatus = `${this.flaggedCount} / ${remainingMineCount}`;
    document.getElementById('stat-mines').innerText = mineStatus;
    document.getElementById('mobile-stat-mines').innerText = mineStatus;
    
    // 计算空间净化率进度条
    const progressPercent = this.currentBoardProgress().percent;
    
    document.getElementById('stat-progress-percent').innerText = `${progressPercent}%`;
    document.getElementById('stat-progress').style.width = `${progressPercent}%`;
    document.getElementById('mobile-stat-progress').innerText = `${progressPercent}%`;
    this.updateMissionGuide(progressPercent);
  }

  updateMissionGuide(progressPercent = null) {
    const progress = progressPercent ?? this.currentBoardProgress().percent;
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

    const chordGuideKey = this.isMediumChordTargetVisible(this.mediumChordObjectiveTarget)
      ? 'task.medium.guide.chordOne'
      : 'task.medium.guide.chordOneOutsideSlice';
    objective.textContent = this.hardReductionObjectivePending()
      ? this.t('task.hard.guide.reduceOne')
      : (this.mediumChordObjectivePending()
        ? this.t(chordGuideKey, {
          number: this.mediumChordObjectiveTarget?.count ?? '?',
        })
        : this.storyT(`mission.objective.${state}`, { progress }));
    dialogue.textContent = this.storyT(`mission.dialogue.${state}`);
    bar.style.width = `${progress}%`;
    this.updateSoloGuide();
    if (this.taskMission === 'hard' || this.taskMission === 'medium') {
      this.setTutorialActionHint(this.waitingTutorialAction);
    }
  }

  mediumChordObjectivePending(snapshot = this.roomSnapshot) {
    return this.gameMode === 'solo'
      && this.taskFlow === 'campaign'
      && this.taskMission === 'medium'
      && this.mediumChordObjectiveActive
      && Boolean(this.mediumChordObjectiveTarget)
      && ['playing', 'revive'].includes(snapshot?.phase);
  }

  hardReductionObjectivePending(snapshot = this.roomSnapshot) {
    return this.gameMode === 'solo'
      && this.taskFlow === 'campaign'
      && this.taskMission === 'hard'
      && snapshot?.config?.reduction === true
      && Number(snapshot.reducedMineCount ?? 0) === 0
      && ['ready', 'playing', 'revive'].includes(snapshot.phase);
  }

  updateSoloGuide() {
    if (this.gameMode !== 'solo') return;
    if (this.revealedCount > 0) this.completeTutorialAction('scan');
    if (this.flaggedCount > 0) this.completeTutorialAction('mark');
    if (Number(this.roomSnapshot?.reducedMineCount ?? 0) > 0) this.completeTutorialAction('reduce');
    if (this.taskMission !== 'easy') return;
    const beginnerMineCount = this.roomSnapshot?.config?.mineCount ?? TASK_MISSIONS.easy.mineCount;
    const learnedAllBeginnerFlags = (this.roomSnapshot?.flags?.length ?? 0) >= beginnerMineCount;
    const states = [
      { id: 'solo-step-guided-start', complete: this.revealedCount > 0 },
      { id: 'solo-step-guided-mines', complete: learnedAllBeginnerFlags },
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

    if (this.mediumChordObjectiveMarker) {
      const pulse = 1.28 + Math.sin(performance.now() * 0.0065) * 0.1;
      this.mediumChordObjectiveMarker.scale.set(pulse, pulse, 1);
      this.mediumChordObjectiveMarker.material.opacity = 0.72
        + Math.sin(performance.now() * 0.005) * 0.2;
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

    this.updateCellRevealAnimations();
    this.updateSectorPurgeAnimations();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// 启动游戏实例
window.addEventListener('DOMContentLoaded', () => {
  new HoloSweeperGame();
});
