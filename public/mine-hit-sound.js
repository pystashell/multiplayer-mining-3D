// The selected audition file is a shipped asset, not a regenerated synth.
// A relative URL works on both the website and Steam's offline holo:// origin.
export const MINE_HIT_SOUND_PATH = 'audio/sfx/11-tile-hit.wav';
const sampleUrl = new URL(`./${MINE_HIT_SOUND_PATH}`, import.meta.url).href;

export class MineHitSound {
  constructor({ scope = globalThis } = {}) {
    this.scope = scope;
    this.bytesPromise = null;
    this.buffers = new WeakMap();
  }

  preload() {
    if (!this.bytesPromise) {
      this.bytesPromise = Promise.resolve().then(async () => {
        const response = await this.scope.fetch(sampleUrl);
        if (!response.ok) throw new Error(`Mine-hit sample HTTP ${response.status}`);
        return response.arrayBuffer();
      }).catch(() => {
        // Audio must never break a game action. Allow a later gesture to retry.
        this.bytesPromise = null;
        return null;
      });
    }
    return this.bytesPromise;
  }

  load(context) {
    if (!context || context.state === 'closed') return Promise.resolve(null);
    if (!this.buffers.has(context)) {
      const loading = this.preload().then((bytes) => {
        if (!bytes || context.state === 'closed') return null;
        // decodeAudioData can detach its input; keep the original for a new context.
        return context.decodeAudioData(bytes.slice(0));
      }).catch(() => null).then((buffer) => {
        if (!buffer) this.buffers.delete(context);
        return buffer;
      });
      this.buffers.set(context, loading);
    }
    return this.buffers.get(context);
  }

  async play(context, destination, isEnabled = () => true) {
    if (!context || !destination || !isEnabled()) return false;
    const buffer = await this.load(context);
    // The player may have muted SFX while the initial download/decode was pending.
    if (!buffer || !isEnabled() || context.state !== 'running') return false;
    let source;
    try {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.addEventListener('ended', () => source.disconnect(), { once: true });
      source.start(context.currentTime);
      return true;
    } catch {
      source?.disconnect();
      return false;
    }
  }
}
