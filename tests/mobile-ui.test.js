import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('suppresses native mobile selection without blocking form text selection', () => {
  assert.match(styleSource, /-webkit-user-select:\s*none/);
  assert.match(styleSource, /-webkit-touch-callout:\s*none/);
  assert.match(styleSource, /input,\s*\n\s*textarea\s*\{[^}]*user-select:\s*text/s);
  assert.match(appSource, /addEventListener\('selectstart', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(appSource, /removeAllRanges\(\)/);
});

test('keeps the lobby at its 420px design width until the viewport is genuinely narrower', () => {
  assert.match(
    styleSource,
    /\.silver-lobby\s*\{[^}]*width:\s*min\(420px,\s*calc\(100vw - 16px\)\)\s*!important[^}]*max-width:\s*calc\(100vw - 16px\)/s,
  );
});

test('accepts one mobile lobby tap while letting the same action retry only its existing session', () => {
  const bindStart = appSource.indexOf('  bindUI() {');
  const bindEnd = appSource.indexOf('  handleConfiguredWheel(event) {', bindStart);
  const bindSource = appSource.slice(bindStart, bindEnd);
  assert.equal((bindSource.match(/if \(this\.lobbyEntryPending\) return;/g) || []).length, 3);
  assert.equal((bindSource.match(/if \(this\.retryPendingLobbyConnection\('btn-(?:start-task|join-room|create-room)'\)\) return;/g) || []).length, 3);
  assert.equal((bindSource.match(/this\.setLobbyEntryPending\(true, 'btn-(?:start-task|join-room|create-room)'\);/g) || []).length, 3);
  assert.match(bindSource, /retryPendingLobbyConnection\('btn-start-task'\)[\s\S]*if \(this\.lobbyEntryPending\) return/);
  assert.match(appSource, /setLobbyEntryPending\(pending, activeButtonId = null\)[\s\S]*inactivePendingAction = this\.lobbyEntryPending && id !== this\.lobbyEntryButtonId[\s\S]*button\.disabled = inactivePendingAction[\s\S]*aria-busy/);
  assert.match(appSource, /LOBBY_ENTRY_TIMEOUT_MS[\s\S]*this\.lobbyEntryRetryReady = Boolean\(this\.roomClient\.session\)[\s\S]*this\.setLobbyEntryPending\(false\)[\s\S]*retryConnection/);
  assert.match(appSource, /retryPendingLobbyConnection\(buttonId = this\.lobbyEntryButtonId\)[\s\S]*buttonId !== this\.lobbyEntryButtonId[\s\S]*this\.roomClient\.session[\s\S]*this\.setLobbyEntryPending\(true, buttonId\)[\s\S]*this\.roomClient\.retryNow\(\)/);
  assert.match(appSource, /handleRoomWelcome\(message\) \{\s*this\.lobbyEntryRetryReady = false;\s*this\.setLobbyEntryPending\(false\)/);
  assert.match(appSource, /handleRoomError\(error\)[\s\S]*this\.setLobbyEntryPending\(false\)/);
  assert.match(styleSource, /button,\s*\[role="button"\],\s*\[role="tab"\],\s*\[role="radio"\]\s*\{[^}]*touch-action:\s*manipulation/s);
  assert.match(styleSource, /#lobby-modal\[aria-busy="true"\] #btn-start-task[\s\S]*cursor:\s*wait/);
  assert.match(styleSource, /#lobby-modal\[aria-busy="true"\] button\[aria-busy="true"\]\s*\{[^}]*cursor:\s*pointer/s);
});

test('uses a five-button mobile dock with slices and an anchored guided-cell pointer', () => {
  const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(indexSource, /btn-mobile-slices/);
  assert.match(indexSource, /slicing-panel/);
  assert.match(indexSource, /<button id="guided-cell-pointer"/);
  assert.match(indexSource, /id="guided-cell-leader"/);
  assert.match(appSource, /activateGuidedTarget\(/);
  assert.match(styleSource, /grid-template-columns:\s*repeat\(5,/);
  assert.match(styleSource, /\.guided-cell-pointer\.safe/);
  assert.match(styleSource, /\.guided-cell-pointer\.mine/);
  assert.match(appSource, /updateGuidedPointerPosition\(\)/);
  assert.match(appSource, /guidedCalloutSafeBounds\(board\)/);
});

test('separates number auto-open from direct cell reduction on desktop and mobile', () => {
  assert.match(appSource, /addEventListener\('mousedown',[\s\S]*mouseChordFocusTarget[\s\S]*this\.handleTwoButtonActionAtPointer\(e, \{[\s\S]*focusTarget:[\s\S]*anchorTarget:[\s\S]*dragThreshold: 10/);
  assert.match(appSource, /mobileDoubleTapMs = 450/);
  assert.match(appSource, /handleMobileNumberTap\(x, y, z\)[\s\S]*previous\.x === x[\s\S]*now - previous\.at <= this\.mobileDoubleTapMs[\s\S]*this\.chord\(x, y, z\)/);
  assert.match(appSource, /event\.pointerType === 'touch' && topObject\.userData\.type === 'number'[\s\S]*this\.handleMobileNumberTap\(x, y, z\)/);
  assert.match(appSource, /mobileCellDoubleTapMs = 320/);
  assert.match(appSource, /handleMobileCellTap\(x, y, z\)[\s\S]*sameCell[\s\S]*this\.reduceCell\(x, y, z\)[\s\S]*mode: this\.activeMode[\s\S]*tap\.mode === 'flag'[\s\S]*this\.toggleFlag\(x, y, z\)[\s\S]*this\.dig\(x, y, z\)/);
  assert.match(appSource, /event\.pointerType === 'touch'[\s\S]*this\.reductionEnabled[\s\S]*topObject\.userData\.type === 'cell'[\s\S]*this\.handleMobileCellTap\(x, y, z\)/);
  assert.doesNotMatch(appSource, /&& this\.activeMode === 'dig'/);
  assert.doesNotMatch(appSource, /handleMobileDigModeTap|mobileReductionDoubleTapMs/);
  assert.match(appSource, /performTwoButtonAction\(target\)[\s\S]*type === 'number'[\s\S]*this\.chord\(x, y, z\)[\s\S]*this\.reductionEnabled[\s\S]*!cell\.isRevealed[\s\S]*this\.reduceCell\(x, y, z\)/);
  assert.doesNotMatch(appSource, /this\.ruleset === 'reduction'/);
  assert.match(appSource, /this\.roomClient\.send\(\{ op: 'chord', x, y, z \}\)/);
  assert.match(appSource, /this\.roomClient\.send\(\{ op: 'reduce', x, y, z \}\)/);
});

test('stacks the tutorial action above the solver hint and mobile dock', () => {
  const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(indexSource, /id="mission-floating-panel"[\s\S]*id="mission-action-hint"[\s\S]*id="mission-action-hint-text"/);
  assert.match(indexSource, /class="floating-assist-stack">\s*<div id="tutorial-action-hint"[\s\S]*<section id="solver-hint-panel"/);
  assert.match(indexSource, /id="solver-hint-panel"/);
  assert.match(indexSource, /id="btn-request-solver-hint"/);
  assert.match(indexSource, /id="btn-collapse-solver-hint"[^>]*aria-controls="solver-hint-body"[^>]*aria-expanded="true"/);
  assert.match(indexSource, /id="solver-hint-body" class="solver-hint-body"/);
  assert.match(indexSource, /id="btn-close-solver-hint"/);
  assert.match(indexSource, /aria-pressed="false"/);
  assert.match(indexSource, /aria-live="polite"/);
  assert.match(appSource, /import \{ solveMinesweeperHint \} from '\.\/minesweeper-solver\.js'/);
  assert.match(appSource, /\['medium', 'hard'\]\.includes\(this\.taskMission\)/);
  assert.match(styleSource, /\.floating-assist-stack\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styleSource, /\.tutorial-action-hint\s*\{[^}]*position:\s*relative/s);
  assert.match(styleSource, /\.solver-hint-panel\s*\{[^}]*position:\s*relative/s);
});

test('keeps mobile drawer actions clear of the Silver Wolf hint panel', () => {
  const customStart = indexSource.indexOf('id="custom-toggle"');
  const pickerStart = indexSource.indexOf('id="ruleset-picker"');
  const ultimateStart = indexSource.indexOf('id="ultimate-hack-launch"');
  const actionStart = indexSource.indexOf('class="panel-section action-section"');
  assert.ok(customStart >= 0 && customStart < pickerStart && pickerStart < ultimateStart && ultimateStart < actionStart);
  assert.match(appSource, /panel\.classList\.add\('mobile-open'\);\s*document\.body\.classList\.add\('mobile-panel-active'\)/s);
  assert.match(appSource, /document\.body\.classList\.remove\('mobile-panel-active'\)/);
  assert.match(styleSource, /body\.in-room\.mobile-panel-active \.return-lobby-button\s*\{[^}]*display:\s*none\s*!important[^}]*pointer-events:\s*none\s*!important/s);
  assert.match(styleSource, /#control-panel \.action-section\s*\{\s*display:\s*none/);
  assert.match(styleSource, /#slicing-panel\.mobile-open\s*\{[^}]*z-index:\s*180\s*!important/s);
  assert.match(styleSource, /\.floating-assist-stack\s*\{[^}]*display:\s*contents/s);
  assert.match(styleSource, /\.tutorial-action-hint\s*\{[^}]*position:\s*fixed[^}]*top:\s*calc\(58px \+ env\(safe-area-inset-top\)\)[^}]*bottom:\s*auto/s);
  assert.match(styleSource, /body:has\(#social-panel\.mobile-open\) \.mobile-tutorial-action-hint\s*\{\s*display:none !important/);
  assert.match(styleSource, /\.solver-hint-panel\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(styleSource, /body\.mobile-panel-active \.solver-hint-panel,\s*body:has\(#slicing-panel\.mobile-open\) \.solver-hint-panel\s*\{[^}]*display:\s*none\s*!important/s);
});

test('lets players exit reasoning mode and uses a transparent clue reticle', () => {
  assert.match(appSource, /if \(this\.solverHint\) \{\s*this\.clearSolverHint\(\);\s*return;/s);
  assert.match(appSource, /btn-close-solver-hint.*clearSolverHint/);
  assert.match(appSource, /btn-collapse-solver-hint.*toggleSolverHintCollapsed/);
  const collapseStart = appSource.indexOf('  toggleSolverHintCollapsed() {');
  const collapseEnd = appSource.indexOf('  clearSolverHint() {', collapseStart);
  const collapseSource = appSource.slice(collapseStart, collapseEnd);
  assert.match(collapseSource, /this\.solverHintCollapsed = !this\.solverHintCollapsed/);
  assert.match(collapseSource, /this\.syncReasoningCoordinateAxes\(\)/);
  assert.doesNotMatch(collapseSource, /clearSolverHint|clearSolverHintMarkers|this\.solverHint = null/);
  assert.match(styleSource, /\.solver-hint-result\.is-collapsed \.solver-hint-body\s*\{\s*display:none/);
  assert.match(styleSource, /\.solver-hint-result\.is-collapsed \.solver-hint-collapsed-label\s*\{\s*display:flex/);
  assert.match(appSource, /syncSolverHintButton\(\)/);
  assert.match(appSource, /if \(active\) this\.setTutorialActionHint\(\)/);
  assert.match(appSource, /else if \(this\.waitingTutorialAction\) this\.setTutorialActionHint\(this\.waitingTutorialAction\)/);
  assert.match(indexSource, /id="btn-request-solver-hint"[\s\S]*<button id="btn-close-solver-hint"[\s\S]*id="solver-hint-result"[\s\S]*class="solver-hint-controls">\s*<button id="btn-collapse-solver-hint"/);
  assert.match(styleSource, /\.solver-hint-close\s*\{[^}]*position:absolute[^}]*top:10px[^}]*right:9px[^}]*display:none/s);
  assert.match(styleSource, /\.solver-hint-button\[aria-pressed="true"\] \+ \.solver-hint-close\s*\{\s*display:grid/);
  assert.match(styleSource, /\.solver-hint-result\s*\{[^}]*padding:11px 54px 13px 14px/);
  assert.match(styleSource, /\.solver-hint-controls\s*\{\s*top:5px;\s*right:5px;/);
  assert.match(styleSource, /\.solver-hint-close\s*\{\s*top:3px;\s*right:5px;/);
  assert.match(appSource, /createEvidenceReticle\(label = ''\)/);
  assert.match(appSource, /new THREE\.Sprite\(new THREE\.SpriteMaterial/);
  assert.doesNotMatch(appSource, /const evidenceBox = new THREE\.BoxGeometry/);
});
