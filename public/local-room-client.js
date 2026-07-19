import { RoomClient as NetworkRoomClient, RoomClientError, createClientRequestId } from './room-client.js?v=20260717-reduction-hint-4';
import { ROOM_TTL_MS, RoomEngine } from './vendor/game-core/room-engine.js';

const PROTOCOL_VERSION = 1;
const LOCAL_SAVE_VERSION = 1;
const LOCAL_SAVE_PREFIX = 'holo-sweeper.solo.local.v1';
const LOCAL_QUERY_KEY = 'solo';
const PERSIST_DELAY_MS = 150;

function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 16);
  return name || null;
}

function currentUrl() {
  try { return new URL(globalThis.location?.href ?? 'http://localhost/'); } catch { return new URL('http://localhost/'); }
}

function replaceUrl(url) {
  try { globalThis.history?.replaceState?.(null, '', url); } catch {}
}

function storageGet(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function storageSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try { globalThis.localStorage?.removeItem(key); } catch {}
}

function saveKey(saveId) {
  return `${LOCAL_SAVE_PREFIX}.${saveId}`;
}

function localSaveIdFromUrl() {
  return currentUrl().searchParams.get(LOCAL_QUERY_KEY)?.trim() || '';
}

function localSnapshot(engine, session, now = Date.now()) {
  return engine.snapshot(now, new Set([session.playerId]));
}

export class LocalRoomClient {
  constructor({ onSnapshot, onWelcome, onError, onStatus } = {}) {
    this.onSnapshot = onSnapshot;
    this.onWelcome = onWelcome;
    this.onError = onError;
    this.onStatus = onStatus;
    this.session = null;
    this.engine = null;
    this.sequence = 0;
    this.commandQueue = Promise.resolve();
    this.persistTimer = null;
    this.handlePageHide = () => this.flushPersist();
    globalThis.addEventListener?.('pagehide', this.handlePageHide);
  }

  hasSaveInUrl() {
    return Boolean(localSaveIdFromUrl());
  }

  async create(name, mode = 'solo') {
    if (mode !== 'solo') throw new RoomClientError('SOLO_ONLY');
    const playerName = normalizeName(name);
    if (!playerName) throw new RoomClientError('INVALID_NAME');

    this.onStatus?.('creating');
    if (this.session?.saveId) storageRemove(saveKey(this.session.saveId));
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const saveId = createClientRequestId();
    const playerId = createClientRequestId();
    const now = Date.now();
    this.session = {
      code: 'LOCAL',
      playerId,
      playerName,
      mode: 'solo',
      local: true,
      saveId,
    };
    this.sequence = 0;
    this.commandQueue = Promise.resolve();
    this.engine = RoomEngine.create({
      code: 'LOCAL',
      hostId: playerId,
      hostName: playerName,
      tokenHash: 'local-only',
      mode: 'solo',
      now,
    });
    this.updateUrl(saveId);
    this.flushPersist();

    const snapshot = localSnapshot(this.engine, this.session, now);
    const payload = {
      roomCode: this.session.code,
      session: { ...this.session },
      room: snapshot,
    };
    this.onStatus?.('connected');
    // Match the network client's event order. onWelcome may queue the desired
    // campaign restart; send() executes it in a microtask after this initial
    // snapshot has reached the UI.
    this.onWelcome?.({
      v: PROTOCOL_VERSION,
      type: 'welcome',
      identity: { playerId, playerName },
      snapshot,
    });
    this.onSnapshot?.(snapshot, true);
    return payload;
  }

  resumeFromUrl() {
    const saveId = localSaveIdFromUrl();
    if (!saveId) return false;
    let record;
    try { record = JSON.parse(storageGet(saveKey(saveId)) ?? 'null'); } catch { record = null; }
    if (
      record?.version !== LOCAL_SAVE_VERSION
      || record?.saveId !== saveId
      || record?.session?.local !== true
      || record?.session?.mode !== 'solo'
      || !record?.engine
    ) {
      storageRemove(saveKey(saveId));
      this.clearUrl();
      return false;
    }

    const expiresAt = Number(record.engine.expiresAt ?? (Number(record.savedAt) + ROOM_TTL_MS));
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      storageRemove(saveKey(saveId));
      this.clearUrl();
      return false;
    }

    try {
      const engine = RoomEngine.restore(record.engine);
      const member = engine.member(record.session.playerId);
      if (!member || engine.state.mode !== 'solo') throw new Error('INVALID_LOCAL_SAVE');
      this.engine = engine;
      this.session = { ...record.session, saveId, local: true, mode: 'solo' };
      this.sequence = Math.max(
        Number.isSafeInteger(record.sequence) ? record.sequence : 0,
        Number.isSafeInteger(member.lastSequence) ? member.lastSequence : 0,
      );
      this.commandQueue = Promise.resolve();
    } catch {
      this.engine = null;
      this.session = null;
      this.sequence = 0;
      storageRemove(saveKey(saveId));
      this.clearUrl();
      return false;
    }

    const snapshot = localSnapshot(this.engine, this.session);
    this.onStatus?.('connected');
    this.onWelcome?.({
      v: PROTOCOL_VERSION,
      type: 'welcome',
      identity: {
        playerId: this.session.playerId,
        playerName: this.session.playerName,
      },
      snapshot,
    });
    this.onSnapshot?.(snapshot, true);
    return true;
  }

  send(command) {
    if (!this.session || !this.engine) return Promise.reject(new RoomClientError('NOT_JOINED'));
    this.sequence += 1;
    const message = {
      v: PROTOCOL_VERSION,
      type: 'command',
      id: createClientRequestId(),
      sequence: this.sequence,
      command,
    };

    const execute = async () => {
      if (!this.session || !this.engine) throw new RoomClientError('NOT_JOINED');
      try {
        const now = Date.now();
        const result = this.engine.apply(this.session.playerId, command, {
          id: message.id,
          sequence: message.sequence,
          now,
        });
        if (result.kind !== 'applied') throw new RoomClientError('STALE_COMMAND');
        this.schedulePersist();
        const snapshot = localSnapshot(this.engine, this.session, now);
        this.onSnapshot?.(snapshot, false);
        return {
          v: PROTOCOL_VERSION,
          type: 'ack',
          id: message.id,
          receipt: result.receipt,
        };
      } catch (error) {
        this.schedulePersist();
        if (error instanceof RoomClientError) throw error;
        throw new RoomClientError(error?.message || 'REQUEST_FAILED', error?.message || '');
      }
    };

    const pending = this.commandQueue.then(execute, execute);
    this.commandQueue = pending.catch(() => {});
    return pending;
  }

  async leave() {
    try { await this.commandQueue; } catch {}
    const departingSaveId = this.session?.saveId;
    this.flushPersist();
    if (departingSaveId) storageRemove(saveKey(departingSaveId));
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.engine = null;
    this.session = null;
    this.sequence = 0;
    this.commandQueue = Promise.resolve();
    this.clearUrl();
    this.onStatus?.('disconnected');
  }

  disconnect({ forgetSession = false } = {}) {
    if (forgetSession) return this.leave();
    this.flushPersist();
    this.engine = null;
    this.session = null;
    this.sequence = 0;
    this.commandQueue = Promise.resolve();
    this.clearUrl();
    this.onStatus?.('disconnected');
    return undefined;
  }

  retryNow() {
    return false;
  }

  inviteUrl() {
    return currentUrl().toString();
  }

  schedulePersist() {
    if (!this.session?.saveId || !this.engine) return false;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersist();
    }, PERSIST_DELAY_MS);
    return true;
  }

  flushPersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.session?.saveId || !this.engine) return false;
    return storageSet(saveKey(this.session.saveId), JSON.stringify({
      version: LOCAL_SAVE_VERSION,
      saveId: this.session.saveId,
      savedAt: Date.now(),
      session: this.session,
      sequence: this.sequence,
      engine: this.engine.serialize(),
    }));
  }

  updateUrl(saveId) {
    const url = currentUrl();
    url.searchParams.delete('room');
    url.searchParams.set(LOCAL_QUERY_KEY, saveId);
    replaceUrl(url);
  }

  clearUrl() {
    const url = currentUrl();
    url.searchParams.delete(LOCAL_QUERY_KEY);
    replaceUrl(url);
  }
}

// A transport facade keeps all existing app code on one interface while
// leaving the proven multiplayer WebSocket client untouched.
export class HybridRoomClient {
  constructor(callbacks = {}) {
    this.local = new LocalRoomClient(callbacks);
    this.network = new NetworkRoomClient(callbacks);
    this.active = null;
  }

  get session() {
    return this.active?.session ?? null;
  }

  roomFromUrl() {
    return this.network.roomFromUrl();
  }

  async create(name, mode = 'squad') {
    this.active = mode === 'solo' ? this.local : this.network;
    return this.active.create(name, mode);
  }

  async join(code, name) {
    this.active = this.network;
    return this.network.join(code, name);
  }

  resumeFromUrl() {
    // A real room invitation wins if both query parameters were manually
    // combined. This also preserves old server-backed solo URLs unchanged.
    if (this.network.roomFromUrl()) {
      this.active = this.network;
      return this.network.resumeFromUrl();
    }
    if (this.local.hasSaveInUrl()) {
      this.active = this.local;
      return this.local.resumeFromUrl();
    }
    return false;
  }

  send(command) {
    if (!this.active) return Promise.reject(new RoomClientError('NOT_JOINED'));
    return this.active.send(command);
  }

  async leave() {
    if (!this.active) return;
    const departing = this.active;
    this.active = null;
    await departing.leave();
  }

  disconnect(options) {
    const departing = this.active;
    this.active = null;
    return departing?.disconnect(options);
  }

  retryNow() {
    return this.active?.retryNow?.() ?? false;
  }

  inviteUrl() {
    return this.active?.inviteUrl?.() ?? currentUrl().toString();
  }
}
