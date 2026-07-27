import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MUSIC_MASTER_VOLUME,
  MUSIC_STORAGE_KEY,
  MUSIC_VOLUME_STORAGE_KEY,
  SCI_FI_TRACKS,
  SFX_ENABLED_STORAGE_KEY,
  SFX_VOLUME_STORAGE_KEY,
  SciFiMusicDirector,
  loadAudioVolume,
  loadMusicEnabled,
  loadMusicVolume,
  loadSfxEnabled,
  loadSfxVolume,
  musicTrackForGame,
  normalizeAudioVolume,
  persistMusicVolume,
  persistSfxEnabled,
  persistSfxVolume,
} from '../public/soundtrack.js';
import { translate } from '../public/i18n.js';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  record(type, value, time) {
    this.value = value;
    this.events.push({ type, value, time });
  }

  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exponential', value, time); }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); }
}

class FakeAudioNode {
  constructor(context) {
    this.context = context;
    this.connections = [];
    this.disconnected = false;
  }

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}

class FakeGainNode extends FakeAudioNode {
  constructor(context) {
    super(context);
    this.gain = new FakeAudioParam();
  }
}

class FakeScheduledSource extends FakeAudioNode {
  constructor(context) {
    super(context);
    this.startedAt = [];
    this.stoppedAt = [];
    this.listeners = new Map();
  }

  start(time) { this.startedAt.push(time); }
  stop(time) { this.stoppedAt.push(time); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

class CompleteFakeAudioContext {
  constructor({ state = 'running', resumeError = null } = {}) {
    this.state = state;
    this.resumeError = resumeError;
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.currentTime = 2;
    this.sampleRate = 100;
    this.destination = new FakeAudioNode(this);
    this.sources = [];
  }

  createGain() { return new FakeGainNode(this); }

  createDynamicsCompressor() {
    const node = new FakeAudioNode(this);
    for (const field of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      node[field] = new FakeAudioParam();
    }
    return node;
  }

  createOscillator() {
    const source = new FakeScheduledSource(this);
    source.frequency = new FakeAudioParam();
    source.detune = new FakeAudioParam();
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const node = new FakeAudioNode(this);
    node.frequency = new FakeAudioParam();
    node.Q = new FakeAudioParam();
    return node;
  }

  createStereoPanner() {
    const node = new FakeAudioNode(this);
    node.pan = new FakeAudioParam();
    return node;
  }

  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  createBufferSource() {
    const source = new FakeScheduledSource(this);
    this.sources.push(source);
    return source;
  }

  async resume() {
    this.resumeCalls += 1;
    if (this.resumeError) throw this.resumeError;
    this.state = 'running';
  }

  async suspend() {
    this.suspendCalls += 1;
    this.state = 'suspended';
  }
}

function createAudioHarness(contextOptions = {}) {
  const contexts = [];
  const intervals = new Map();
  const clearedIntervals = new Set();
  const timeouts = new Map();
  let nextTimerId = 1;

  class HarnessAudioContext extends CompleteFakeAudioContext {
    constructor() {
      super(contextOptions);
      contexts.push(this);
    }
  }

  const scope = {
    AudioContext: HarnessAudioContext,
    document: { hidden: false, addEventListener() {} },
    addEventListener() {},
    setInterval(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      clearedIntervals.add(id);
      intervals.delete(id);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };

  return {
    scope,
    contexts,
    intervals,
    clearedIntervals,
    timeouts,
    flushTimeouts() {
      const pending = [...timeouts.values()];
      timeouts.clear();
      for (const timer of pending) timer.callback();
    },
    close() {
      for (const context of contexts) context.state = 'closed';
    },
  };
}

function campaignScene(taskMission = 'easy') {
  const dimensions = { easy: 3, medium: 5, hard: 7, ultimate: 9 };
  const mineCounts = { easy: 3, medium: 10, hard: 30, ultimate: 60 };
  const side = dimensions[taskMission];
  return {
    inRoom: true,
    gameMode: 'solo',
    taskMission,
    config: {
      width: side,
      height: side,
      depth: side,
      mineCount: mineCounts[taskMission],
      campaign: true,
    },
  };
}

test('routes every campaign chapter and multiplayer to its own score', () => {
  const campaign = (taskMission, width, mineCount) => musicTrackForGame({
    inRoom: true,
    gameMode: 'solo',
    taskMission,
    config: { width, height: width, depth: width, mineCount, campaign: true },
  });
  assert.equal(musicTrackForGame({ inRoom: false, gameMode: 'solo' }), null);
  assert.equal(campaign('easy', 3, 3), 'easy');
  assert.equal(campaign('medium', 5, 10), 'medium');
  assert.equal(campaign('hard', 7, 30), 'hard');
  assert.equal(campaign('ultimate', 9, 60), 'ultimate');
  assert.equal(musicTrackForGame({
    inRoom: true,
    gameMode: 'squad',
    taskMission: 'hard',
    config: { width: 9, height: 9, depth: 9, mineCount: 60, campaign: false },
  }), 'squad');
});

test('free and custom boards follow their real matrix scale', () => {
  const freeTrack = (width, mineCount) => musicTrackForGame({
    inRoom: true,
    gameMode: 'solo',
    taskMission: 'easy',
    config: { width, height: width, depth: width, mineCount, campaign: false },
  });
  assert.equal(freeTrack(3, 3), 'easy');
  assert.equal(freeTrack(5, 10), 'medium');
  assert.equal(freeTrack(7, 30), 'hard');
  assert.equal(freeTrack(9, 60), 'ultimate');
});

test('all five original score profiles have distinct composition signatures', () => {
  assert.deepEqual(Object.keys(SCI_FI_TRACKS), ['easy', 'medium', 'hard', 'ultimate', 'squad']);
  const profiles = Object.values(SCI_FI_TRACKS);
  const signatures = profiles.map((profile) => JSON.stringify({
    bpm: profile.bpm,
    rootMidi: profile.rootMidi,
    pulseWave: profile.pulseWave,
    melody: profile.melody,
    bass: profile.bass,
    chords: profile.chords,
    noiseSteps: profile.noiseSteps,
  }));
  assert.equal(new Set(signatures).size, profiles.length);
  assert.deepEqual(profiles.map((profile) => profile.bpm), [72, 92, 116, 132, 104]);
  for (const profile of profiles) {
    assert.ok(Object.isFrozen(profile));
    assert.equal(profile.melody.length, 16);
    assert.equal(profile.bass.length, 16);
    assert.equal(profile.chords.length, 4);
  }
});

test('music preference defaults on and persists independently from sound effects', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(loadMusicEnabled(storage), true);
  values.set(MUSIC_STORAGE_KEY, 'false');
  assert.equal(loadMusicEnabled(storage), false);
  values.set(MUSIC_STORAGE_KEY, 'true');
  assert.equal(loadMusicEnabled(storage), true);

  const scope = {
    document: { hidden: false, addEventListener() {} },
    addEventListener() {},
  };
  const director = new SciFiMusicDirector({ scope, storage });
  void director.setEnabled(false);
  assert.equal(values.get(MUSIC_STORAGE_KEY), 'false');
  assert.equal(director.enabled, false);
});

test('normalizes and persists independent music and sound-effect volumes', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(loadMusicVolume(storage), 1);
  assert.equal(loadSfxVolume(storage), 1);
  assert.equal(normalizeAudioVolume(-1), 0);
  assert.equal(normalizeAudioVolume(2), 1);
  assert.equal(normalizeAudioVolume('bad', 0.6), 0.6);

  persistMusicVolume(0.35, storage);
  persistSfxVolume(0.72, storage);
  assert.equal(values.get(MUSIC_VOLUME_STORAGE_KEY), '0.35');
  assert.equal(values.get(SFX_VOLUME_STORAGE_KEY), '0.72');
  assert.equal(loadMusicVolume(storage), 0.35);
  assert.equal(loadSfxVolume(storage), 0.72);

  values.set(MUSIC_VOLUME_STORAGE_KEY, 'not-a-number');
  values.set(SFX_VOLUME_STORAGE_KEY, '5');
  assert.equal(loadAudioVolume(storage, MUSIC_VOLUME_STORAGE_KEY, 0.8), 0.8);
  assert.equal(loadSfxVolume(storage), 1);

  assert.equal(loadSfxEnabled(storage), true);
  persistSfxEnabled(false, storage);
  assert.equal(values.get(SFX_ENABLED_STORAGE_KEY), 'false');
  assert.equal(loadSfxEnabled(storage), false);
});

test('doubles the score master while keeping sound effects independent', () => {
  assert.equal(DEFAULT_MUSIC_MASTER_VOLUME, 0.24);
  const scope = {
    document: { hidden: false, addEventListener() {} },
    addEventListener() {},
  };
  const director = new SciFiMusicDirector({
    scope,
    storage: { getItem: () => null, setItem() {} },
  });
  assert.equal(director.masterVolume, 0.24);
  assert.equal(new SciFiMusicDirector({
    scope,
    storage: { getItem: () => null, setItem() {} },
    masterVolume: 0.12,
  }).masterVolume, 0.12);
});

test('fails quiet when AudioContext is unavailable or cannot resume', async () => {
  const storage = { getItem: () => null, setItem() {} };
  const unsupportedScope = {
    document: { hidden: false, addEventListener() {} },
    addEventListener() {},
  };
  const unsupported = new SciFiMusicDirector({ scope: unsupportedScope, storage });
  unsupported.setScene(campaignScene('easy'));
  assert.equal(await unsupported.unlock(), false);
  assert.equal(unsupported.activeSession, null);
  assert.doesNotThrow(() => unsupported.stop());

  const failedResume = createAudioHarness({
    state: 'suspended',
    resumeError: new Error('gesture denied'),
  });
  const suspended = new SciFiMusicDirector({ scope: failedResume.scope, storage });
  suspended.setScene(campaignScene('medium'));
  assert.equal(await suspended.unlock(), false);
  assert.equal(failedResume.contexts.length, 1);
  assert.equal(failedResume.contexts[0].resumeCalls, 1);
  assert.equal(suspended.activeSession, null);
  assert.doesNotThrow(() => suspended.stop());
  failedResume.close();
});

test('starts a complete graph, keeps identical scenes, and cleans switched sessions', async () => {
  const harness = createAudioHarness();
  const director = new SciFiMusicDirector({
    scope: harness.scope,
    storage: { getItem: () => null, setItem() {} },
  });

  assert.equal(await director.unlock(), true);
  assert.equal(harness.contexts.length, 1);
  assert.equal(director.setScene(campaignScene('easy')), 'easy');
  const easySession = director.activeSession;
  assert.equal(easySession.id, 'easy');
  assert.ok(easySession.sources.size >= 7);
  assert.equal(harness.intervals.size, 1);
  const easyTimer = easySession.timer;

  assert.equal(director.setScene(campaignScene('easy')), 'easy');
  assert.equal(director.activeSession, easySession);
  assert.equal(easySession.timer, easyTimer);
  assert.equal(harness.intervals.size, 1);

  const easySources = [...easySession.sources];
  assert.equal(director.setScene(campaignScene('medium')), 'medium');
  const mediumSession = director.activeSession;
  assert.notEqual(mediumSession, easySession);
  assert.equal(mediumSession.id, 'medium');
  assert.equal(easySession.stopped, true);
  assert.equal(easySession.timer, null);
  assert.ok(harness.clearedIntervals.has(easyTimer));
  assert.ok(easySources.every((source) => Math.abs(source.stoppedAt.at(-1) - 2.75) < 1e-9));
  assert.equal(harness.intervals.size, 1);

  harness.flushTimeouts();
  assert.equal(easySession.sources.size, 0);
  assert.equal(easySession.bus.disconnected, true);

  const mediumTimer = mediumSession.timer;
  const mediumSources = [...mediumSession.sources];
  director.stop();
  assert.equal(director.desiredTrackId, null);
  assert.equal(director.activeSession, null);
  assert.equal(mediumSession.stopped, true);
  assert.equal(mediumSession.timer, null);
  assert.ok(harness.clearedIntervals.has(mediumTimer));
  assert.ok(mediumSources.every((source) => Math.abs(source.stoppedAt.at(-1) - 2.65) < 1e-9));
  assert.equal(harness.intervals.size, 0);

  harness.flushTimeouts();
  assert.equal(mediumSession.sources.size, 0);
  assert.equal(mediumSession.bus.disconnected, true);
  harness.close();
});

test('volume zero stops playback and a restored volume resumes the desired score', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const harness = createAudioHarness();
  const director = new SciFiMusicDirector({ scope: harness.scope, storage, volume: 1 });

  assert.equal(await director.unlock(), true);
  director.setScene(campaignScene('hard'));
  const firstSession = director.activeSession;
  assert.equal(firstSession.id, 'hard');

  assert.equal(await director.setVolume(0), false);
  assert.equal(director.volume, 0);
  assert.equal(director.enabled, false);
  assert.equal(director.activeSession, null);
  assert.equal(director.desiredTrackId, 'hard');
  assert.equal(values.get(MUSIC_VOLUME_STORAGE_KEY), '0');
  assert.equal(values.get(MUSIC_STORAGE_KEY), 'false');

  assert.equal(await director.setVolume(0.4), true);
  assert.equal(director.volume, 0.4);
  assert.equal(director.enabled, true);
  assert.equal(director.master.gain.value, DEFAULT_MUSIC_MASTER_VOLUME * 0.4);
  assert.equal(values.get(MUSIC_VOLUME_STORAGE_KEY), '0.4');
  assert.equal(values.get(MUSIC_STORAGE_KEY), 'true');
  assert.equal(director.activeSession.id, 'hard');
  assert.notEqual(director.activeSession, firstSession);

  director.stop();
  harness.flushTimeouts();
  harness.close();
});

test('changes a running music graph volume without restarting its track', async () => {
  const harness = createAudioHarness();
  const storage = { getItem: () => null, setItem() {} };
  const director = new SciFiMusicDirector({ scope: harness.scope, storage, volume: 1 });
  assert.equal(await director.unlock(), true);
  assert.equal(director.master.gain.value, 0.24);
  director.setScene(campaignScene('easy'));
  const session = director.activeSession;
  await director.setVolume(0.25);
  assert.equal(director.volume, 0.25);
  assert.equal(director.master.gain.value, 0.06);
  assert.equal(director.activeSession, session);
  director.stop();
  harness.flushTimeouts();
  harness.close();
});

test('integrates the score with shared Safari-safe audio, room state, and lobby exit', () => {
  assert.match(appSource, /getSharedAudioContext/);
  assert.match(appSource, /resumeSharedAudioContext/);
  assert.match(appSource, /new SciFiMusicDirector\(\{ scope: window \}\)/);
  assert.match(appSource, /btn-start-task[\s\S]*void music\.unlock\(\)/);
  assert.match(appSource, /btn-join-room[\s\S]*void music\.unlock\(\)/);
  assert.match(appSource, /btn-create-room[\s\S]*void music\.unlock\(\)/);
  assert.match(appSource, /handleRoomWelcome\(message\)[\s\S]*this\.syncMusicForState\(message\.snapshot\)/);
  assert.match(appSource, /applyRoomSnapshot\(snapshot[\s\S]*this\.syncMusicForState\(snapshot\)/);
  assert.match(appSource, /returnToLobby\(\)[\s\S]*music\.setScene\(\{ inRoom: false \}\)/);
  assert.match(appSource, /musicTrackForGame\(state\)[\s\S]*music\.setScene\(state\)/);
});

test('keeps music independently controllable on desktop and in the mobile controls drawer', () => {
  assert.match(indexSource, /id="btn-reset-camera"[\s\S]*id="btn-sound-toggle"[\s\S]*id="btn-music-toggle"/);
  assert.match(indexSource, /id="btn-music-toggle"[^>]*aria-pressed="true"[^>]*data-i18n-title="action\.musicTitle"/);
  assert.match(styleSource, /\.utility-buttons\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s);
  assert.match(styleSource, /\.utility-buttons #btn-reset-camera\s*\{\s*grid-column:\s*1 \/ -1/);
  assert.match(styleSource, /ultimate-hack-active[\s\S]*#btn-music-toggle[\s\S]*replay-active[\s\S]*#btn-music-toggle[\s\S]*pointer-events:auto !important/s);
  assert.equal(translate('zh', 'action.musicOn'), '🎵 音乐:开');
  assert.equal(translate('zh', 'action.musicOff'), '🎵 音乐:关');
  assert.equal(translate('zh', 'action.musicTitle'), '切换背景音乐');
  assert.equal(translate('en', 'action.musicOn'), '🎵 Music: On');
  assert.equal(translate('en', 'action.musicOff'), '🎵 Music: Off');
  assert.equal(translate('en', 'action.musicTitle'), 'Toggle background music');
  assert.match(appSource, /updateAudioControls\(\)[\s\S]*action\.musicOn[\s\S]*action\.musicOff/);
});

test('offers persistent live volume sliders for music and every synthesized sound effect', () => {
  assert.match(indexSource, /id="sound-volume"[^>]*type="range"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);
  assert.match(indexSource, /id="music-volume"[^>]*type="range"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);
  assert.match(indexSource, /id="sound-volume-value"[^>]*for="sound-volume"/);
  assert.match(indexSource, /id="music-volume-value"[^>]*for="music-volume"/);
  assert.match(appSource, /sound-volume'\)\.addEventListener\('input'[\s\S]*sfx\.setVolume/);
  assert.match(appSource, /music-volume'\)\.addEventListener\('input'[\s\S]*music\.setVolume/);
  assert.match(appSource, /updateAudioControls\(\)[\s\S]*soundPercent[\s\S]*musicPercent[\s\S]*aria-valuetext/);

  const sfxSource = appSource.slice(
    appSource.indexOf('class SoundSynthesizer'),
    appSource.indexOf('const sfx = new SoundSynthesizer'),
  );
  assert.equal((sfxSource.match(/connect\(this\.ctx\.destination\)/g) ?? []).length, 1);
  assert.ok((sfxSource.match(/connect\(this\.master\)/g) ?? []).length >= 6);
  assert.match(sfxSource, /subGain\.connect\(this\.master\)/);
  assert.match(sfxSource, /const nextValue = this\.enabled \? this\.volume : 0/);
  assert.match(styleSource, /\.audio-volume-controls\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(styleSource, /ultimate-hack-active[\s\S]*#sound-volume[\s\S]*#music-volume[\s\S]*replay-active/s);

  assert.equal(translate('zh', 'action.audioLevels'), '音频音量');
  assert.equal(translate('zh', 'action.soundVolume'), '音效音量');
  assert.equal(translate('zh', 'action.musicVolume'), '音乐音量');
  assert.equal(translate('en', 'action.audioLevels'), 'Audio Levels');
  assert.equal(translate('en', 'action.soundVolume'), 'Sound Effects Volume');
  assert.equal(translate('en', 'action.musicVolume'), 'Music Volume');
});
