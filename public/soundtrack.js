const MUSIC_STORAGE_KEY = 'holo-sweeper.music-enabled';
const MUSIC_VOLUME_STORAGE_KEY = 'holo-sweeper.music-volume';
const SFX_ENABLED_STORAGE_KEY = 'holo-sweeper.sfx-enabled';
const SFX_VOLUME_STORAGE_KEY = 'holo-sweeper.sfx-volume';

// The score voices are intentionally mixed with plenty of headroom. Keep that
// balance intact and lift only the final music bus; sound effects use a
// separate master and are not affected by this value.
export const DEFAULT_MUSIC_MASTER_VOLUME = 0.24;

export function normalizeAudioVolume(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, parsed));
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis?.localStorage; } catch { return null; }
}

export function loadAudioVolume(storage, key, fallback = 1) {
  storage = resolveStorage(storage);
  try {
    const saved = storage?.getItem(key);
    if (saved === null || saved === undefined || saved === '') return normalizeAudioVolume(fallback);
    return normalizeAudioVolume(saved, fallback);
  } catch {
    return normalizeAudioVolume(fallback);
  }
}

export function persistAudioVolume(storage, key, volume) {
  storage = resolveStorage(storage);
  const normalized = normalizeAudioVolume(volume);
  try { storage?.setItem(key, String(normalized)); } catch {}
  return normalized;
}

export function loadMusicVolume(storage) {
  return loadAudioVolume(storage, MUSIC_VOLUME_STORAGE_KEY, 1);
}

export function persistMusicVolume(volume, storage) {
  return persistAudioVolume(storage, MUSIC_VOLUME_STORAGE_KEY, volume);
}

export function loadSfxEnabled(storage) {
  storage = resolveStorage(storage);
  try { return storage?.getItem(SFX_ENABLED_STORAGE_KEY) !== 'false'; } catch { return true; }
}

export function persistSfxEnabled(enabled, storage) {
  storage = resolveStorage(storage);
  try { storage?.setItem(SFX_ENABLED_STORAGE_KEY, String(Boolean(enabled))); } catch {}
}

export function loadSfxVolume(storage) {
  return loadAudioVolume(storage, SFX_VOLUME_STORAGE_KEY, 1);
}

export function persistSfxVolume(volume, storage) {
  return persistAudioVolume(storage, SFX_VOLUME_STORAGE_KEY, volume);
}

function freezeTrack(profile) {
  return Object.freeze({
    ...profile,
    melody: Object.freeze([...profile.melody]),
    bass: Object.freeze([...profile.bass]),
    chords: Object.freeze(profile.chords.map((chord) => Object.freeze([...chord]))),
    noiseSteps: Object.freeze([...profile.noiseSteps]),
  });
}

// Original score data for Zero Domain Protocol. Every profile uses a different
// pulse, harmonic loop, rhythm, tempo, and synth colour; no samples or external
// music files are used.
export const SCI_FI_TRACKS = Object.freeze({
  easy: freezeTrack({
    id: 'easy', title: 'Phantom Port // Cold Boot', bpm: 72, rootMidi: 50,
    pulseWave: 'sine', bassWave: 'triangle', padWave: 'sine', filterHz: 2100,
    swing: 0.02, pulseGain: 0.055, bassGain: 0.052, padGain: 0.024, noiseGain: 0.009,
    melody: [0, null, 7, null, 10, null, 7, 3, 0, null, 12, null, 10, 7, 3, null],
    bass: [0, null, null, null, -2, null, null, null, 3, null, null, null, -5, null, null, null],
    chords: [[0, 3, 7], [-2, 3, 7], [3, 7, 10], [-5, 0, 7]],
    noiseSteps: [6, 14],
  }),
  medium: freezeTrack({
    id: 'medium', title: 'Handshake Maze // Packet Chase', bpm: 92, rootMidi: 45,
    pulseWave: 'triangle', bassWave: 'sawtooth', padWave: 'triangle', filterHz: 2450,
    swing: 0.07, pulseGain: 0.052, bassGain: 0.046, padGain: 0.019, noiseGain: 0.013,
    melody: [0, 7, null, 10, 3, null, 12, 7, 0, null, 15, 12, 10, 7, null, 3],
    bass: [0, null, 0, null, -5, null, -2, null, 3, null, 3, null, -2, null, -5, null],
    chords: [[0, 3, 7], [-5, 0, 5], [-2, 3, 10], [3, 7, 12]],
    noiseSteps: [2, 6, 10, 14],
  }),
  hard: freezeTrack({
    id: 'hard', title: 'Final Protocol // Root Pressure', bpm: 116, rootMidi: 37,
    pulseWave: 'square', bassWave: 'sawtooth', padWave: 'triangle', filterHz: 1750,
    swing: 0.025, pulseGain: 0.038, bassGain: 0.05, padGain: 0.017, noiseGain: 0.017,
    melody: [0, 1, 7, null, 0, 10, 7, 1, 12, 10, 7, null, 13, 12, 10, 7],
    bass: [0, null, 0, -1, -5, null, -5, -2, 0, null, 3, 1, -5, null, -2, -1],
    chords: [[0, 1, 7], [-5, 0, 6], [1, 7, 10], [-2, 3, 8]],
    noiseSteps: [0, 3, 6, 8, 11, 14],
  }),
  ultimate: freezeTrack({
    id: 'ultimate', title: 'Echo Black Box // Trojan Run', bpm: 132, rootMidi: 38,
    pulseWave: 'sawtooth', bassWave: 'square', padWave: 'sawtooth', filterHz: 3100,
    swing: 0.045, pulseGain: 0.034, bassGain: 0.043, padGain: 0.013, noiseGain: 0.019,
    melody: [0, 7, 13, 10, 1, 12, 15, 7, 0, 19, 13, 10, 3, 15, 12, 7],
    bass: [0, 0, -5, 0, 1, -5, 3, 1, 0, -2, -5, -2, 3, 1, -5, -1],
    chords: [[0, 1, 7], [1, 6, 10], [-5, 0, 8], [3, 7, 13]],
    noiseSteps: [0, 2, 4, 6, 8, 10, 12, 14, 15],
  }),
  squad: freezeTrack({
    id: 'squad', title: 'Squad Link // Co-op Breach', bpm: 104, rootMidi: 43,
    pulseWave: 'triangle', bassWave: 'square', padWave: 'sine', filterHz: 2650,
    swing: 0.09, pulseGain: 0.048, bassGain: 0.044, padGain: 0.02, noiseGain: 0.014,
    melody: [0, null, 7, 10, null, 14, 10, 7, 3, 7, null, 12, 10, null, 7, 5],
    bass: [0, null, 0, null, 5, null, 3, null, -2, null, 3, null, 5, null, 7, null],
    chords: [[0, 4, 7], [5, 9, 12], [-2, 3, 7], [3, 7, 11]],
    noiseSteps: [2, 6, 8, 10, 14],
  }),
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function musicTrackForGame({ inRoom = false, gameMode = 'solo', taskMission = 'easy', config = null } = {}) {
  if (!inRoom) return null;
  if (gameMode === 'squad') return 'squad';

  const largestSide = Math.max(
    numeric(config?.width),
    numeric(config?.height),
    numeric(config?.depth),
  );
  const mineCount = numeric(config?.mineCount);

  // Free/custom boards follow their actual scale. This also lets a custom 9^3
  // matrix use the hidden-stage score without pretending it is campaign data.
  if (config?.campaign === false) {
    if (largestSide >= 9 || mineCount >= 60) return 'ultimate';
    if (largestSide >= 7 || mineCount >= 30) return 'hard';
    if (largestSide >= 5 || mineCount >= 10) return 'medium';
    return 'easy';
  }

  if (Object.prototype.hasOwnProperty.call(SCI_FI_TRACKS, taskMission) && taskMission !== 'squad') {
    return taskMission;
  }
  if (largestSide >= 9 || mineCount >= 60) return 'ultimate';
  if (largestSide >= 7 || mineCount >= 30) return 'hard';
  if (largestSide >= 5 || mineCount >= 10) return 'medium';
  return 'easy';
}

let sharedAudioContext = null;

export function getSharedAudioContext(scope = globalThis) {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') return sharedAudioContext;
  const AudioContextConstructor = scope?.AudioContext || scope?.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try { sharedAudioContext = new AudioContextConstructor(); } catch { return null; }
  return sharedAudioContext;
}

export async function resumeSharedAudioContext(scope = globalThis) {
  const context = getSharedAudioContext(scope);
  if (!context) return null;
  if (context.state === 'suspended') {
    try { await context.resume(); } catch { return context; }
  }
  return context;
}

export function loadMusicEnabled(storage) {
  storage = resolveStorage(storage);
  try { return storage?.getItem(MUSIC_STORAGE_KEY) !== 'false'; } catch { return true; }
}

function persistMusicEnabled(enabled, storage) {
  storage = resolveStorage(storage);
  try { storage?.setItem(MUSIC_STORAGE_KEY, String(Boolean(enabled))); } catch {}
}

function midiFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function safeStop(source, when) {
  try { source.stop(when); } catch {}
}

export class SciFiMusicDirector {
  constructor({
    scope = globalThis,
    storage,
    masterVolume = DEFAULT_MUSIC_MASTER_VOLUME,
    volume,
  } = {}) {
    this.scope = scope;
    if (storage === undefined) {
      try { storage = scope?.localStorage; } catch { storage = null; }
    }
    this.storage = storage;
    this.masterVolume = masterVolume;
    this.volume = volume === undefined ? loadMusicVolume(storage) : normalizeAudioVolume(volume);
    this.enabled = loadMusicEnabled(storage) && this.volume > 0;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.desiredTrackId = null;
    this.activeSession = null;
    this.unlocked = false;
    this.hidden = Boolean(scope?.document?.hidden);

    this.handleVisibilityChange = () => this.setHidden(Boolean(this.scope?.document?.hidden));
    this.scope?.document?.addEventListener?.('visibilitychange', this.handleVisibilityChange);
    this.scope?.addEventListener?.('pagehide', () => this.stopSession(this.activeSession, 120));
  }

  ensureGraph() {
    this.context = getSharedAudioContext(this.scope);
    if (!this.context || this.master) return this.context;

    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(this.masterVolume * this.volume, this.context.currentTime);
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-24, this.context.currentTime);
    this.compressor.knee.setValueAtTime(18, this.context.currentTime);
    this.compressor.ratio.setValueAtTime(7, this.context.currentTime);
    this.compressor.attack.setValueAtTime(0.01, this.context.currentTime);
    this.compressor.release.setValueAtTime(0.24, this.context.currentTime);
    this.master.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    return this.context;
  }

  applyVolume() {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    const nextValue = this.masterVolume * this.volume;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(nextValue, now + 0.035);
    } catch {
      this.master.gain.value = nextValue;
    }
  }

  setVolume(volume) {
    this.volume = persistMusicVolume(volume, this.storage);
    this.applyVolume();
    if (this.volume <= 0 && this.enabled) return this.setEnabled(false);
    if (this.volume > 0 && !this.enabled) return this.setEnabled(true);
    return Promise.resolve(this.enabled);
  }

  async unlock() {
    if (!this.enabled) return false;
    this.ensureGraph();
    const context = await resumeSharedAudioContext(this.scope);
    this.context = context;
    this.unlocked = Boolean(context && context.state === 'running');
    if (this.unlocked && this.desiredTrackId && !this.hidden) this.startTrack(this.desiredTrackId);
    return this.unlocked;
  }

  setEnabled(enabled) {
    if (enabled && this.volume <= 0) {
      this.volume = persistMusicVolume(1, this.storage);
      this.applyVolume();
    }
    this.enabled = Boolean(enabled);
    persistMusicEnabled(this.enabled, this.storage);
    if (!this.enabled) {
      this.stopSession(this.activeSession, 260);
      return Promise.resolve(false);
    }
    return this.unlock();
  }

  toggleEnabled() {
    return this.setEnabled(!this.enabled);
  }

  setScene(state) {
    const nextTrackId = musicTrackForGame(state);
    this.desiredTrackId = nextTrackId;
    if (!nextTrackId || !this.enabled || this.hidden) {
      this.stopSession(this.activeSession, nextTrackId ? 180 : 620);
      return nextTrackId;
    }
    if (this.unlocked && this.context?.state === 'running') this.startTrack(nextTrackId);
    return nextTrackId;
  }

  setHidden(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) {
      this.stopSession(this.activeSession, 180);
      const context = this.context;
      this.scope?.setTimeout?.(() => {
        if (this.hidden && context?.state === 'running') void context.suspend().catch(() => {});
      }, 220);
      return;
    }
    if (this.enabled && this.desiredTrackId) void this.unlock();
  }

  stop() {
    this.desiredTrackId = null;
    this.stopSession(this.activeSession, 620);
  }

  startTrack(trackId) {
    if (!this.enabled || this.hidden || !SCI_FI_TRACKS[trackId]) return;
    if (this.activeSession?.id === trackId) return;
    const context = this.ensureGraph();
    if (!context || context.state !== 'running') return;

    const previous = this.activeSession;
    if (previous) this.stopSession(previous, 720);

    const profile = SCI_FI_TRACKS[trackId];
    const now = context.currentTime;
    const bus = context.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(1, now + 0.82);
    bus.connect(this.master);

    const session = {
      id: trackId,
      profile,
      bus,
      sources: new Set(),
      timer: null,
      stopped: false,
      step: 0,
      nextStepTime: now + 0.035,
    };
    this.activeSession = session;
    this.scheduleDrone(session, now);
    this.scheduleAhead(session);
    session.timer = this.scope.setInterval(() => this.scheduleAhead(session), 48);
  }

  stopSession(session, fadeMs = 500) {
    if (!session || session.stopped) return;
    session.stopped = true;
    if (session.timer !== null) this.scope?.clearInterval?.(session.timer);
    session.timer = null;
    if (this.activeSession === session) this.activeSession = null;

    const context = this.context;
    if (!context) {
      for (const source of session.sources) safeStop(source);
      session.sources.clear();
      try { session.bus?.disconnect?.(); } catch {}
      return;
    }

    const now = context.currentTime;
    const stopAt = now + Math.max(0.04, fadeMs / 1000);
    try {
      session.bus.gain.cancelScheduledValues(now);
      session.bus.gain.setValueAtTime(Math.max(0.0001, session.bus.gain.value), now);
      session.bus.gain.linearRampToValueAtTime(0.0001, stopAt);
    } catch {}
    for (const source of session.sources) safeStop(source, stopAt + 0.03);

    const finishCleanup = () => {
      try { session.bus.disconnect(); } catch {}
      session.sources.clear();
    };
    if (typeof this.scope?.setTimeout === 'function') {
      this.scope.setTimeout(finishCleanup, fadeMs + 100);
    } else {
      finishCleanup();
    }
  }

  rememberSource(session, source, cleanupNodes = []) {
    session.sources.add(source);
    source.addEventListener?.('ended', () => {
      session.sources.delete(source);
      try { source.disconnect(); } catch {}
      for (const node of cleanupNodes) {
        try { node?.disconnect(); } catch {}
      }
    }, { once: true });
  }

  scheduleAhead(session) {
    if (session.stopped || this.activeSession !== session || this.context?.state !== 'running') return;
    const horizon = this.context.currentTime + 0.19;
    const profile = session.profile;
    const straightStep = 30 / profile.bpm;
    let guard = 0;
    while (session.nextStepTime < horizon && guard < 16) {
      this.scheduleStep(session, session.step, session.nextStepTime);
      const swingScale = session.step % 2 === 0 ? 1 + profile.swing : 1 - profile.swing;
      session.nextStepTime += straightStep * swingScale;
      session.step += 1;
      guard += 1;
    }
  }

  scheduleStep(session, step, time) {
    const profile = session.profile;
    const patternStep = step % profile.melody.length;
    const melodyOffset = profile.melody[patternStep];
    const bassOffset = profile.bass[patternStep % profile.bass.length];
    const stepSeconds = 30 / profile.bpm;

    if (melodyOffset !== null) {
      const octaveLift = profile.id === 'ultimate' && patternStep % 4 === 2 ? 12 : 0;
      this.scheduleTone(session, {
        time,
        midi: profile.rootMidi + 12 + melodyOffset + octaveLift,
        duration: stepSeconds * 0.76,
        type: profile.pulseWave,
        gainValue: profile.pulseGain * (patternStep % 4 === 0 ? 1.16 : 1),
        filterHz: profile.filterHz,
        pan: profile.id === 'squad' ? (patternStep % 4 < 2 ? -0.36 : 0.36) : 0,
      });
    }

    if (bassOffset !== null) {
      this.scheduleTone(session, {
        time,
        midi: profile.rootMidi - 12 + bassOffset,
        duration: stepSeconds * 1.7,
        type: profile.bassWave,
        gainValue: profile.bassGain,
        filterHz: Math.max(360, profile.filterHz * 0.34),
        pan: 0,
      });
    }

    if (profile.noiseSteps.includes(patternStep)) {
      this.scheduleNoise(session, time, stepSeconds * 0.28, profile.noiseGain);
    }

    if (step % 16 === 0) {
      const chord = profile.chords[Math.floor(step / 16) % profile.chords.length];
      this.schedulePad(session, time, chord, stepSeconds * 14.5);
    }
  }

  scheduleTone(session, { time, midi, duration, type, gainValue, filterHz, pan = 0 }) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midiFrequency(midi), time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, time);
    filter.Q.setValueAtTime(1.4, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    let destination = session.bus;
    let panner = null;
    if (pan && typeof this.context.createStereoPanner === 'function') {
      panner = this.context.createStereoPanner();
      panner.pan.setValueAtTime(pan, time);
      gain.connect(panner);
      panner.connect(session.bus);
      destination = null;
    }
    if (destination) gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.035);
    this.rememberSource(session, oscillator, [filter, gain, panner]);
  }

  schedulePad(session, time, chord, duration) {
    chord.forEach((offset, voice) => {
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      oscillator.type = session.profile.padWave;
      oscillator.frequency.setValueAtTime(midiFrequency(session.profile.rootMidi + offset), time);
      oscillator.detune.setValueAtTime((voice - 1) * 5, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(session.profile.filterHz * 0.48, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(session.profile.padGain, time + Math.min(0.72, duration * 0.24));
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(session.bus);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
      this.rememberSource(session, oscillator, [filter, gain]);
    });
  }

  scheduleDrone(session, time) {
    [-12, -5].forEach((offset, voice) => {
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      oscillator.type = voice === 0 ? 'sine' : session.profile.padWave;
      oscillator.frequency.setValueAtTime(midiFrequency(session.profile.rootMidi + offset), time);
      oscillator.detune.setValueAtTime(voice === 0 ? -4 : 5, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(voice === 0 ? 260 : 520, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(voice === 0 ? 0.025 : 0.012, time + 1.4);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(session.bus);
      oscillator.start(time);
      this.rememberSource(session, oscillator, [filter, gain]);
    });
  }

  ensureNoiseBuffer() {
    if (this.noiseBuffer || !this.context) return this.noiseBuffer;
    const length = Math.floor(this.context.sampleRate * 0.12);
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.42 + white * 0.58;
      data[index] = previous;
    }
    return this.noiseBuffer;
  }

  scheduleNoise(session, time, duration, gainValue) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.ensureNoiseBuffer();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(session.profile.id === 'ultimate' ? 4200 : 3000, time);
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(session.bus);
    source.start(time);
    source.stop(time + duration + 0.02);
    this.rememberSource(session, source, [filter, gain]);
  }
}

export {
  MUSIC_STORAGE_KEY,
  MUSIC_VOLUME_STORAGE_KEY,
  SFX_ENABLED_STORAGE_KEY,
  SFX_VOLUME_STORAGE_KEY,
};
