import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('exposes separate solo and multiplayer replay entries plus an accessible replay HUD', () => {
  assert.match(indexSource, /id="btn-modal-replay"[^>]*replay-entry-button[^>]*hidden[^>]*data-i18n="replay\.button"/);
  assert.match(indexSource, /id="btn-tutorial-replay"[^>]*replay-entry-button[^>]*hidden[^>]*data-i18n="replay\.button"/);
  assert.match(indexSource, /id="replay-hud"[^>]*replay-hud hidden[^>]*data-i18n-aria-label="replay\.hudLabel"/);
  assert.match(indexSource, /class="replay-hud-progress"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(indexSource, /id="btn-replay-pause"[^>]*aria-pressed="false"[^>]*data-i18n-aria-label="replay\.pause"/);
  assert.match(indexSource, /id="btn-replay-exit"[^>]*data-i18n="replay\.exit"/);

  assert.match(appSource, /getElementById\('btn-tutorial-replay'\)\.addEventListener\('click', \(\) => this\.startSuccessReplay\(\)\)/);
  assert.match(appSource, /getElementById\('btn-modal-replay'\)\.addEventListener\('click', \(\) => this\.startSuccessReplay\(\)\)/);
  assert.match(appSource, /getElementById\('btn-replay-pause'\)\.addEventListener\('click', \(\) => this\.toggleSuccessReplayPause\(\)\)/);
  assert.match(appSource, /getElementById\('btn-replay-exit'\)\.addEventListener\('click', \(\) => this\.stopSuccessReplay\(\)\)/);
});

test('makes successful replay a prominent primary action on both completion surfaces', () => {
  const replayStyleSource = sourceBetween(
    styleSource,
    '.replay-entry-button {',
    '.tutorial-skip-button {',
  );

  assert.match(indexSource, /class="modal-buttons"[^>]*>[\s\S]*id="btn-modal-replay"[\s\S]*id="btn-modal-close"[\s\S]*id="btn-modal-restart"/);
  assert.match(indexSource, /class="tutorial-actions"[^>]*>[\s\S]*id="btn-tutorial-replay"[\s\S]*id="btn-tutorial-next"/);
  assert.match(replayStyleSource, /min-width:\s*132px/);
  assert.match(replayStyleSource, /border-color:\s*rgba\(41,231,255,\.9\)/);
  assert.match(replayStyleSource, /background:[\s\S]*radial-gradient[\s\S]*linear-gradient/);
  assert.match(replayStyleSource, /box-shadow:[^;]*inset[^;]*0 0 20px[^;]*0 0 32px/);
  assert.match(replayStyleSource, /font-weight:\s*800/);
  assert.match(replayStyleSource, /text-shadow:\s*0 0 10px/);
  assert.match(replayStyleSource, /\.replay-entry-button:not\(\.hidden\)\s*\{\s*animation:replay-entry-glow/);
  assert.match(replayStyleSource, /\.replay-entry-button:not\(\.hidden\)::after\s*\{\s*animation:replay-entry-sheen/);
  assert.match(replayStyleSource, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:none/);
});

test('offers replay only for won snapshots and routes squad wins to the modal and solo wins to Silver Wolf', () => {
  const availabilitySource = sourceBetween(
    appSource,
    '  hasSuccessReplay(snapshot = this.roomSnapshot) {',
    '  startSuccessReplay() {',
  );

  assert.match(availabilitySource, /snapshot\?\.phase === 'won'/);
  assert.match(availabilitySource, /Array\.isArray\(snapshot\.replay\?\.steps\)/);
  assert.match(availabilitySource, /snapshot\.replay\.steps\.length > 0/);
  assert.match(availabilitySource, /btn-modal-replay[\s\S]*!available \|\| snapshot\?\.mode === 'solo'/);
  assert.match(availabilitySource, /btn-tutorial-replay[\s\S]*!available \|\| !this\.dialogueState\?\.allowReplay/);
});

test('runs replay locally without sending gameplay commands and buffers authoritative snapshots while it plays', () => {
  const replayLifecycleSource = sourceBetween(
    appSource,
    '  startSuccessReplay() {',
    '  handleNetworkAction(action) {',
  );
  const snapshotSource = sourceBetween(
    appSource,
    '  applyRoomSnapshot(snapshot, initial = false) {',
    '  missionFromConfig(config) {',
  );

  assert.doesNotMatch(replayLifecycleSource, /roomClient\.send\s*\(/);
  assert.match(snapshotSource, /if \(this\.successReplay\) \{[\s\S]*const minimumRevision = this\.pendingReplaySnapshot\?\.revision[\s\S]*replayState\.finalSnapshot\.revision[\s\S]*snapshot\.revision < minimumRevision[\s\S]*this\.pendingReplaySnapshot = snapshot;[\s\S]*return;/);
  assert.match(snapshotSource, /snapshot\.phase !== 'won'[\s\S]*snapshot\.replay\?\.runId !== replayState\.replay\.runId[\s\S]*this\.stopSuccessReplay\(\)/);
  assert.match(replayLifecycleSource, /const finalSnapshot = typeof structuredClone === 'function'[\s\S]*structuredClone\(snapshot\)/);
  assert.match(replayLifecycleSource, /this\.pendingReplaySnapshot = null/);
});

test('starts from a clean visual board, locks interaction, and uses the existing reveal and purge animation paths', () => {
  const startSource = sourceBetween(appSource, '  startSuccessReplay() {', '  playNextSuccessReplayStep() {');
  const applyStepSource = sourceBetween(appSource, '  applySuccessReplayStep(step, state = this.successReplay) {', '  updateSuccessReplayProgress() {');

  assert.match(startSource, /document\.body\.classList\.add\('replay-active'\)/);
  assert.match(startSource, /this\.applyConfig\(replay\.config \?\? snapshot\.config\);[\s\S]*this\.buildGridLocal\(\)/);
  assert.match(startSource, /this\.isInteractionLocked = true/);
  assert.match(startSource, /this\.resetSlices\(\)/);
  assert.match(startSource, /this\.controls\.autoRotate = true/);
  assert.match(startSource, /getElementById\('replay-hud'\)\.classList\.remove\('hidden'\)/);

  assert.match(applyStepSource, /for \(const point of flags\) this\.setFlagLocal\(point\.x, point\.y, point\.z, true, false, \{ animate: true \}\)/);
  assert.match(applyStepSource, /revealAnimationTiming\(Math\.max\(0, Number\(point\.wave\) \|\| 0\)\)/);
  assert.match(applyStepSource, /this\.syncPurgedCells\(\{ purged: state\.purged, lastPurge: event \}, false\)/);
  assert.match(applyStepSource, /this\.revealServerCell\(point, true, \{[\s\S]*durationMs: timing\.durationMs[\s\S]*delayMs,[\s\S]*wave: timing\.isCascade[\s\S]*playSound: false[\s\S]*holdFlagUntilReveal: holdLeadFlag/);
  assert.match(applyStepSource, /hasElimination \? Math\.max\(720, sectorEnd\) : 0/);
  assert.match(applyStepSource, /state\.remainingMineCount = Number\.isFinite\(Number\(step\.remainingMineCount\)\)/);
  assert.match(applyStepSource, /generation !== this\.boardAnimationGeneration/);
});

test('pauses between replay steps, resumes explicitly, and exposes a direct exit', () => {
  const pauseSource = sourceBetween(appSource, '  toggleSuccessReplayPause() {', '  finishSuccessReplay() {');
  const controlsSource = sourceBetween(appSource, '  updateSuccessReplayControls() {', '  toggleSuccessReplayPause() {');

  assert.match(pauseSource, /if \(!state \|\| state\.finished\) return/);
  assert.match(pauseSource, /if \(!state\.paused\) \{[\s\S]*state\.paused = true[\s\S]*state\.pauseRemainingMs = Math\.max/);
  assert.match(pauseSource, /else \{[\s\S]*state\.paused = false[\s\S]*const delayMs = Math\.max\(50, state\.pauseRemainingMs \?\? 100\)/);
  assert.match(pauseSource, /clearTimeout\(this\.successReplayTimer\);[\s\S]*this\.successReplayTimer = null/);
  assert.match(pauseSource, /setTimeout\(\(\) => this\.playNextSuccessReplayStep\(\), delayMs\)/);
  assert.match(pauseSource, /cellRevealAnimations\.length \|\| this\.sectorPurgeAnimations\.length[\s\S]*finishSuccessReplayWhenSettled\(\)/);
  assert.match(controlsSource, /state\.paused \? 'replay\.resume' : 'replay\.pause'/);
  assert.match(controlsSource, /setAttribute\('aria-pressed', String\(state\.paused\)\)/);
  assert.match(controlsSource, /setAttribute\('aria-label', this\.t\(key\)\)/);
});

test('finishes with replay celebration and restores the newest authoritative snapshot on completion or exit', () => {
  const finishSource = sourceBetween(appSource, '  finishSuccessReplay() {', '  stopSuccessReplay() {');
  const stopSource = sourceBetween(appSource, '  stopSuccessReplay() {', '  handleNetworkAction(action) {');

  assert.match(finishSource, /if \(!state \|\| state\.finished\) return/);
  assert.match(finishSource, /state\.finished = true/);
  assert.match(finishSource, /getElementById\('btn-replay-pause'\)\.disabled = true/);
  assert.match(finishSource, /sfx\.playWin\(\)/);
  assert.match(finishSource, /setTimeout\(\(\) => this\.stopSuccessReplay\(\), 1200\)/);

  assert.match(stopSource, /const snapshot = this\.pendingReplaySnapshot \?\? state\.finalSnapshot/);
  assert.match(stopSource, /this\.successReplay = null;[\s\S]*this\.pendingReplaySnapshot = null/);
  assert.match(stopSource, /document\.body\.classList\.remove\('replay-active'\)/);
  assert.match(stopSource, /this\.applyConfig\(snapshot\.config\);[\s\S]*this\.buildGridLocal\(\);[\s\S]*this\.applyRoomSnapshot\(snapshot, true\)/);
  assert.match(stopSource, /snapshot\.phase === 'won' && returnSurface === 'dialogue'[\s\S]*this\.renderSilverWolfDialogue\(\)/);
  assert.match(stopSource, /snapshot\.phase === 'won' && returnSurface === 'modal'[\s\S]*modal-overlay[\s\S]*classList\.remove\('hidden'\)/);
});

test('keeps replay independent from the hard-to-Ultimate-to-Free-Mode campaign progression', () => {
  const completionSource = sourceBetween(appSource, '  showTaskCompletion() {', '  enterFreeModeAfterCampaign() {');
  const replayLifecycleSource = sourceBetween(appSource, '  startSuccessReplay() {', '  handleNetworkAction(action) {');
  const dialogueFinishSource = sourceBetween(appSource, '  finishSilverWolfDialogue() {', '  skipTutorial() {');

  assert.match(completionSource, /taskFlow === 'freeplay'[\s\S]*titleKey:\s*'freeplay\.completeTitle'[\s\S]*messageKey:\s*'freeplay\.completeMessage'[\s\S]*factText:\s*this\.t\('tutorial\.completionFact',\s*\{\s*time:\s*this\.formatTime\(this\.timer\)\s*\}\)[\s\S]*allowReplay: true/);
  assert.match(completionSource, /this\.showSilverWolfDialogue\(steps, \{[\s\S]*allowReplay: true/);
  assert.match(completionSource, /mission === 'hard'[\s\S]*task\.hard\.complete\.3[\s\S]*tutorial\.enterUltimate/);
  assert.match(completionSource, /mission === 'hard' \? 'ultimate' : null/);
  assert.match(completionSource, /onComplete: nextMission \? \(\) => this\.advanceTaskMission\(nextMission\) : null/);
  assert.match(completionSource, /mission === 'ultimate'[\s\S]*task\.ultimate\.complete\.1[\s\S]*task\.ultimate\.complete\.2[\s\S]*tutorial\.enterFreeplay[\s\S]*onComplete: \(\) => this\.enterFreeModeAfterCampaign\(\)/);
  assert.doesNotMatch(replayLifecycleSource, /enterFreeModeAfterCampaign\s*\(/);
  assert.doesNotMatch(replayLifecycleSource, /advanceTaskMission\s*\(/);
  assert.doesNotMatch(replayLifecycleSource, /finishSilverWolfDialogue\s*\(/);
  assert.match(dialogueFinishSource, /const onComplete = this\.dialogueState\?\.onComplete[\s\S]*onComplete\?\.\(\)/);

  assert.match(i18nSource, /'tutorial\.completionFact':\s*'[^']*\{time\}[^']*100%'/);
  assert.equal((i18nSource.match(/'tutorial\.completionFact':/g) || []).length, 2);
});

test('keeps the replay controls compact on phones and removes competing mobile chrome during playback', () => {
  const mobileSource = sourceBetween(
    styleSource,
    '@media (max-width: 900px) {',
    '@media (max-width: 900px) and (max-height: 620px) {',
  );

  assert.match(mobileSource, /#btn-modal-replay:not\(\.hidden\)\s*\{[^}]*flex-basis:\s*100%/s);
  assert.match(mobileSource, /\.tutorial-actions \.replay-entry-button:not\(\.hidden\)\s*\{[^}]*flex:\s*1 0 100%[^}]*width:\s*100%[^}]*min-height:\s*48px/s);
  assert.match(mobileSource, /\.replay-hud\s*\{[^}]*width:\s*calc\(100vw - 16px\)[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(mobileSource, /\.replay-hud-progress\s*\{[^}]*grid-column:\s*1[^}]*min-width:\s*0[^}]*border:\s*0/s);
  assert.match(mobileSource, /\.replay-hud-actions\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*1 \/ span 2/s);
  assert.match(mobileSource, /\.replay-control-button\s*\{[^}]*min-height:\s*40px[^}]*padding:\s*7px 9px/s);
  assert.match(mobileSource, /body\.replay-active \.mobile-statusbar,[\s\S]*body\.replay-active #mobile-control-dock,[\s\S]*body\.replay-active #slicing-panel\s*\{[^}]*display:\s*none !important/s);
});

test('localizes replay entry, progress, pause, resume, exit, and completion copy in both languages', () => {
  for (const key of [
    'replay.button',
    'replay.hudLabel',
    'replay.kicker',
    'replay.title',
    'replay.progress',
    'replay.pause',
    'replay.resume',
    'replay.exit',
    'replay.complete',
  ]) {
    assert.equal((i18nSource.match(new RegExp(`'${key.replace('.', '\\\.')}'`, 'g')) || []).length, 2, `${key} should exist in zh and en`);
  }
});
