import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('suppresses native mobile selection without blocking form text selection', () => {
  assert.match(styleSource, /-webkit-user-select:\s*none/);
  assert.match(styleSource, /-webkit-touch-callout:\s*none/);
  assert.match(styleSource, /input,\s*\n\s*textarea\s*\{[^}]*user-select:\s*text/s);
  assert.match(appSource, /addEventListener\('selectstart', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(appSource, /removeAllRanges\(\)/);
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
  assert.match(appSource, /addEventListener\('mousedown',[\s\S]*\(e\.buttons & 3\) !== 3[\s\S]*this\.handleTwoButtonActionAtPointer\(e\)/);
  assert.match(appSource, /mobileDoubleTapMs = 450/);
  assert.match(appSource, /handleMobileNumberTap\(x, y, z\)[\s\S]*previous\.x === x[\s\S]*now - previous\.at <= this\.mobileDoubleTapMs[\s\S]*this\.chord\(x, y, z\)/);
  assert.match(appSource, /event\.pointerType === 'touch' && topObject\.userData\.type === 'number'[\s\S]*this\.handleMobileNumberTap\(x, y, z\)/);
  assert.match(appSource, /mobileReductionDoubleTapMs = 320/);
  assert.match(appSource, /handleMobileDigModeTap\(x, y, z\)[\s\S]*sameCell[\s\S]*this\.reduceCell\(x, y, z\)[\s\S]*this\.dig\(x, y, z\)/);
  assert.match(appSource, /event\.pointerType === 'touch'[\s\S]*this\.activeMode === 'dig'[\s\S]*this\.reductionEnabled[\s\S]*this\.handleMobileDigModeTap\(x, y, z\)/);
  assert.match(appSource, /handleTwoButtonActionAtPointer\(event\)[\s\S]*type === 'number'[\s\S]*this\.chord\(x, y, z\)[\s\S]*this\.reductionEnabled[\s\S]*!cell\.isRevealed[\s\S]*this\.reduceCell\(x, y, z\)/);
  assert.doesNotMatch(appSource, /this\.ruleset === 'reduction'/);
  assert.match(appSource, /this\.roomClient\.send\(\{ op: 'chord', x, y, z \}\)/);
  assert.match(appSource, /this\.roomClient\.send\(\{ op: 'reduce', x, y, z \}\)/);
});

test('stacks the tutorial action above the solver hint and mobile dock', () => {
  const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(indexSource, /class="floating-assist-stack">\s*<div id="tutorial-action-hint"[\s\S]*<section id="solver-hint-panel"/);
  assert.match(indexSource, /id="solver-hint-panel"/);
  assert.match(indexSource, /id="btn-request-solver-hint"/);
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
  assert.match(appSource, /panel\.classList\.add\('mobile-open'\);\s*document\.body\.classList\.add\('mobile-panel-active'\)/s);
  assert.match(appSource, /document\.body\.classList\.remove\('mobile-panel-active'\)/);
  assert.match(styleSource, /#slicing-panel\.mobile-open\s*\{[^}]*z-index:\s*180\s*!important/s);
  assert.match(styleSource, /\.floating-assist-stack\s*\{[^}]*display:\s*contents/s);
  assert.match(styleSource, /\.tutorial-action-hint\s*\{[^}]*position:\s*fixed[^}]*top:\s*calc\(58px \+ env\(safe-area-inset-top\)\)[^}]*bottom:\s*auto/s);
  assert.match(styleSource, /\.solver-hint-panel\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(styleSource, /body\.mobile-panel-active \.solver-hint-panel,\s*body:has\(#slicing-panel\.mobile-open\) \.solver-hint-panel\s*\{[^}]*display:\s*none\s*!important/s);
});

test('lets players exit reasoning mode and uses a transparent clue reticle', () => {
  assert.match(appSource, /if \(this\.solverHint\) \{\s*this\.clearSolverHint\(\);\s*return;/s);
  assert.match(appSource, /btn-close-solver-hint.*clearSolverHint/);
  assert.match(appSource, /syncSolverHintButton\(\)/);
  assert.match(appSource, /if \(active\) this\.setTutorialActionHint\(\)/);
  assert.match(appSource, /else if \(this\.waitingTutorialAction\) this\.setTutorialActionHint\(this\.waitingTutorialAction\)/);
  assert.match(appSource, /createEvidenceReticle\(\)/);
  assert.match(appSource, /new THREE\.Sprite\(new THREE\.SpriteMaterial/);
  assert.doesNotMatch(appSource, /const evidenceBox = new THREE\.BoxGeometry/);
});
