import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('keeps the matrix centered while desktop camera bindings remain runtime-configurable', () => {
  assert.match(appSource, /this\.controls\.enablePan\s*=\s*false/);
  assert.match(appSource, /this\.controls\.enableRotate\s*=\s*true/);
  assert.match(appSource, /this\.controls\.enableZoom\s*=\s*true/);
  assert.match(appSource, /this\.controls\.rotateSpeed\s*=\s*0\.9/);
  assert.match(appSource, /this\.controls\.touches\.ONE\s*=\s*THREE\.TOUCH\.ROTATE/);
  assert.match(appSource, /this\.controls\.touches\.TWO\s*=\s*THREE\.TOUCH\.DOLLY_PAN/);
  assert.match(appSource, /applyControlBindings\(\)[\s\S]*const dragActions = \{[\s\S]*rotate:\s*THREE\.MOUSE\.ROTATE[\s\S]*zoom:\s*THREE\.MOUSE\.DOLLY[\s\S]*none:\s*null/);
  assert.match(appSource, /this\.controls\.mouseButtons\.LEFT\s*=\s*null[\s\S]*this\.controls\.mouseButtons\.RIGHT\s*=\s*dragActions\[this\.controlSettings\.rightDragAction\][\s\S]*this\.controls\.mouseButtons\.MIDDLE\s*=\s*dragActions\[this\.controlSettings\.middleDragAction\]/);
  assert.match(appSource, /this\.controls\.target\.set\(0, 0, 0\)/);
  assert.match(appSource, /addEventListener\('wheel',[\s\S]*handleConfiguredWheel\(event\)[\s\S]*capture:\s*true,\s*passive:\s*false/);
  assert.match(appSource, /handleConfiguredWheel\(event\)[\s\S]*wheelActionForEvent\(this\.controlSettings, event\)[\s\S]*normalizeWheelDelta\(event, window\.innerHeight\)/);
  assert.match(appSource, /const rotatedMatrix = distance >= 5 && cameraAngle >= 0\.002[\s\S]*if \(!rotatedMatrix && distance < clickDistance && timeElapsed < clickDuration\)/);
  assert.match(appSource, /e\.pointerType === 'mouse' && e\.button === 1[\s\S]*this\.clearPointerHighlights\(\);[\s\S]*return;[\s\S]*const clickDistance/);
  assert.match(appSource, /addEventListener\('auxclick',[\s\S]*event\.button === 1[\s\S]*event\.preventDefault\(\)/);
});

test('keeps view controls discoverable without making rotation a beginner task', () => {
  assert.match(appSource, /startSilverWolfTutorial\(\)[\s\S]*messageKey: 'tutorial\.intro'[\s\S]*factKey: 'tutorial\.controlsNote'/);
  assert.doesNotMatch(appSource, /action: 'observe'|hasObservedMatrix|recordCameraRotation|completeTutorialAction\('observe'\)|tutorial\.actionHint\.observe/);
  assert.match(appSource, /blockBeginnerBoardInput\(\)[\s\S]*this\.setTutorialActionHint\(this\.waitingTutorialAction\)/);
  assert.match(indexSource, /id="btn-control-settings"[\s\S]*data-i18n="controls\.open"/);
  assert.match(indexSource, /id="btn-control-settings-lobby"[\s\S]*data-i18n-aria-label="controls\.open"/);
});

test('keeps the beginner flag step reachable and visibly raises its flag', () => {
  assert.match(appSource, /activateGuidedTarget\(inputMethod = 'primary'\)[\s\S]*void inputMethod;[\s\S]*target\.action === 'flag'[\s\S]*this\.toggleFlag/);
  assert.doesNotMatch(appSource, /target\.action === 'flag' && !coarsePointer && inputMethod !== 'secondary'/);
  assert.match(appSource, /const guidedFlagHit =[\s\S]*object\.userData\.x === guidedFlagTarget\.x[\s\S]*this\.toggleFlag\(guidedFlagTarget\.x/);
  assert.match(appSource, /flagGroup\.position\.y = 0\.58/);
  assert.match(appSource, /const animateFlagRise = \(now\) =>[\s\S]*BOARD_ANIMATION_TIMING\.flagRiseDurationMs[\s\S]*requestAnimationFrame\(animateFlagRise\)/);
});

test('preserves left, right, and two-button minesweeper actions across camera profiles', () => {
  assert.match(appSource, /addEventListener\('mousedown',[\s\S]*const chordButton = e\.button === 0 \? 1 : \(e\.button === 2 \? 2 : 0\)[\s\S]*stopImmediatePropagation\(\)/);
  assert.doesNotMatch(appSource, /addEventListener\('pointerdown',[\s\S]{0,400}const chordButton/);
  assert.match(appSource, /const chordButton = e\.button === 0 \? 1 : \(e\.button === 2 \? 2 : 0\)[\s\S]*mergeTwoButtonState\(this\.mouseChordButtons, e\.buttons, chordButton\)/);
  assert.match(appSource, /focusTarget: this\.mouseChordFocusTarget[\s\S]*dragThreshold: 10/);
  assert.match(appSource, /pointerdown',[\s\S]*this\.handlePointerMove\(e\);[\s\S]*mouseChordFocusTarget = this\.currentPointerFocusTarget\(\)/);
  assert.match(appSource, /event\.button === 2 \|\| this\.activeMode === 'flag'[\s\S]*this\.toggleFlag\(x, y, z\)[\s\S]*this\.dig\(x, y, z\)/);
  assert.match(appSource, /e\.pointerType === 'mouse' && \(e\.buttons & 4\) !== 0[\s\S]*this\.clearPointerHighlights\(\);[\s\S]*return;/);
  assert.match(appSource, /this\.controlSettings\.rightDragAction !== 'none'[\s\S]*\(e\.buttons & 2\) !== 0[\s\S]*Math\.sqrt\(dx \* dx \+ dy \* dy\) >= 5[\s\S]*this\.clearPointerHighlights\(\)/);
  assert.match(appSource, /if \(e\.pointerType === 'mouse' && \(this\.mouseChordButtons & 3\) !== 0\) return;/);
  assert.match(appSource, /if \(!rotatedMatrix && distance < clickDistance && timeElapsed < clickDuration\)/);
});

test('keeps desktop two-button actions reliable across oblique views and interrupted input', () => {
  assert.match(appSource, /pickTwoButtonTargetAtPointer\(event, \{ includeClueProxy = false \} = \{\}\)[\s\S]*primaryTargets[\s\S]*clueProxyTargets[\s\S]*resolveTwoButtonRayHits/);
  assert.match(appSource, /currentPointerFocusTarget\(\)[\s\S]*targetFromFocusedCell\(this\.hoveredCell\)/);
  assert.match(appSource, /resolveTwoButtonGestureTargets\(\{ \.\.\.gesture, currentTarget \}, getCell\)/);
  assert.match(appSource, /cameraMoved \? Number\.POSITIVE_INFINITY : anchorDistance/);
  assert.match(appSource, /progress >= 1[\s\S]*animation\.mesh\.visible = false[\s\S]*animation\.mesh\.scale\.setScalar\(1\)/);
  assert.match(appSource, /window\.addEventListener\('mouseup',[\s\S]*resetMouseChordState/);
  assert.match(appSource, /window\.addEventListener\('blur', \(\) => \{[\s\S]*resetMouseChordState\(\);[\s\S]*clearPointerHighlights\(\);[\s\S]*\}\)/);
  assert.match(appSource, /addEventListener\('lostpointercapture',[\s\S]*resetMouseChordState/);
});

test('makes the highlighted number or cube the exact two-button target', () => {
  assert.match(appSource, /getImageData\(0, 0, canvas\.width, canvas\.height\)[\s\S]*numberHitMask:/);
  assert.match(appSource, /handlePointerMove\(event\)[\s\S]*pickTwoButtonTargetAtPointer\(event, \{ includeClueProxy: false \}\)/);
  assert.match(appSource, /startNeighborInspection\(event\)[\s\S]*includeClueProxy: event\.pointerType === 'touch'/);
  assert.match(appSource, /startNeighborInspection\(event\)[\s\S]*this\.focusNumberCell\(this\.grid\[x\]\?\.\[y\]\?\.\[z\]\)/);
  assert.match(appSource, /highlightNeighborsOn\(cx, cy, cz\)[\s\S]*this\.grid\[n\.x\]\?\.\[n\.y\]\?\.\[n\.z\]/);
  assert.match(appSource, /highlightNeighborsOff\(cx, cy, cz\)[\s\S]*this\.grid\[n\.x\]\?\.\[n\.y\]\?\.\[n\.z\]/);
  assert.match(appSource, /target\?\.type === 'number'[\s\S]*this\.focusNumberCell/);
  assert.match(appSource, /focusNumberCell\(cell\)[\s\S]*spriteInstance\.scale\.set\(0\.9, 0\.9, 0\.9\)[\s\S]*numberHoverMarker/);
  assert.match(appSource, /currentPointerFocusTarget\(\)[\s\S]*targetFromFocusedNumber\(this\.hoveredNumberCell\)[\s\S]*targetFromFocusedCell\(this\.hoveredCell\)/);
  assert.match(appSource, /intersectObjects\(targets\)[\s\S]*filter\(\(intersection\) => intersectionHitsVisibleNumberPixel\(intersection\)\)/);
});

test('makes solver actions visual-first while keeping coordinates as secondary checks', () => {
  assert.match(indexSource, /id="solver-hint-target"[\s\S]*id="solver-hint-coordinate"/);
  assert.match(indexSource, /id="solver-hint-action-label"[\s\S]*id="solver-hint-action-detail"/);
  assert.match(appSource, /targetType = hint\.certainty === 'guess' \? 'guess'/);
  assert.match(appSource, /solver\.coordinate/);
  assert.match(appSource, /preferMines: this\.reductionEnabled/);
  assert.match(appSource, /hint\.action === 'flag' && this\.reductionEnabled \? 'reduce' : hint\.action/);
  assert.match(styleSource, /\.solver-hint-action strong\s*\{[^}]*font:\s*800 15px/s);
  assert.match(styleSource, /\.solver-hint-result\.mine \.solver-hint-action strong\s*\{\s*color:#ff4fd8/);
  assert.match(styleSource, /\.solver-hint-result\.guess \.solver-hint-action strong\s*\{\s*color:#ffb347/);
});

test('renders practical verification inside the current task panel', () => {
  assert.equal((indexSource.match(/id="mission-floating-panel"/g) || []).length, 1);
  assert.equal((indexSource.match(/id="solo-guide-section"/g) || []).length, 1);
  assert.equal((indexSource.match(/id="mission-action-hint"/g) || []).length, 1);
  assert.match(indexSource, /id="mission-floating-panel"[\s\S]*class="mission-objective"[\s\S]*id="mission-action-hint"[\s\S]*id="solo-guide-section"[\s\S]*class="panel-section guide-section"/);
  assert.match(styleSource, /\.mission-floating-panel\s*\{[^}]*background:\s*rgba\(8, 5, 23, \.6\)/s);
  assert.match(styleSource, /\.mission-action-hint\s*\{[^}]*border-left:2px solid var\(--neon-cyan\)[^}]*text-align:left/s);
  assert.match(styleSource, /\.solo-guide-steps\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styleSource, /\.solo-guide-steps li\s*\{[^}]*border-radius:\s*0[^}]*background:\s*transparent/s);
  assert.match(styleSource, /body\[data-game-mode="task"\] #social-panel > \.silver-wolf-comms,[\s\S]*#social-panel > \.guide-section\s*\{\s*display:\s*none/s);
  assert.match(appSource, /renderTutorialActionHint\(message = ''\)[\s\S]*mission-action-hint[\s\S]*tutorial-action-hint/);
  assert.match(appSource, /renderGuidedHint\(correction = false[\s\S]*this\.renderTutorialActionHint\(message\)/);
});

test('keeps the solver at bottom center and restores squad communications', () => {
  assert.match(styleSource, /\.floating-assist-stack\s*\{[^}]*left:\s*50%[^}]*bottom:\s*22px[^}]*transform:\s*translateX\(-50%\)/s);
  assert.doesNotMatch(styleSource, /body\[data-game-mode="task"\] \.floating-assist-stack\s*\{[^}]*right:\s*20px/s);
  assert.match(styleSource, /@media \(min-width: 901px\)[\s\S]*\.mobile-tutorial-action-hint\s*\{\s*display:none !important/);
  assert.match(styleSource, /body\[data-game-mode="multiplayer"\] #social-panel > \.mission-floating-panel,[\s\S]*#social-panel > \.guide-section\s*\{\s*display:none/);
  assert.match(styleSource, /body\[data-game-mode="multiplayer"\] #chat-section\s*\{[^}]*flex:1 0 210px !important[^}]*min-height:210px/s);
  assert.match(styleSource, /body\[data-game-mode="multiplayer"\] #social-panel\s*\{[^}]*height:\s*calc\(100vh - 92px\)[^}]*overflow-y:\s*auto/s);
  assert.match(appSource, /document\.getElementById\('player-list-section'\)\.classList\.toggle\('hidden', solo\)/);
  assert.match(appSource, /document\.getElementById\('chat-section'\)\.classList\.toggle\('hidden', solo\)/);
});

test('plays the squad mine sound once when a player gives up revival', () => {
  assert.match(appSource, /const explosionSoundAlreadyPlayed = previous\?\.phase === 'revive' && Boolean\(previous\.pendingMine\)/);
  assert.match(appSource, /triggerGameOver\(explosion\.x, explosion\.y, explosion\.z, \{[\s\S]*playExplosionSound: !explosionSoundAlreadyPlayed/);
  assert.match(appSource, /case 'end_game':[\s\S]*triggerGameOver\(this\.pendingGameOver\.x, this\.pendingGameOver\.y, this\.pendingGameOver\.z, \{[\s\S]*playExplosionSound: false/);
  assert.match(appSource, /triggerGameOver\(explosionX, explosionY, explosionZ, \{ playExplosionSound = true \} = \{\}\)[\s\S]*if \(playExplosionSound\) sfx\.playExplosion\(\)/);
});

test('keeps the illustrated background inside the dialogue frame without covering text', () => {
  assert.match(appSource, /easy: Object\.freeze\(\{[\s\S]*?main: STORY_ART\.easy,[\s\S]*?neighbors: 'assets\/silver-wolf-easy-neighbors\.webp'/);
  assert.match(appSource, /medium: Object\.freeze\(\{[\s\S]*?main: STORY_ART\.medium,[\s\S]*?tip: 'assets\/silver-wolf-medium-tip\.webp'/);
  assert.doesNotMatch(appSource, /assets\/silver-wolf-[^'\n]*-cutout-v2\.webp/);
  assert.match(indexSource, /id="tutorial-art" src="assets\/silver-wolf-quantum-pathfinder\.png"/);
  assert.doesNotMatch(indexSource, /id="tutorial-art"[^>]*class="is-cutout"/);
  assert.match(appSource, /tutorialArt\.classList\.toggle\('is-cutout', source\.includes\('-cutout-'\)\)/);
  assert.match(styleSource, /\.tutorial-dialog\s*\{[^}]*grid-template-columns:\s*180px minmax\(0, 560px\)[^}]*overflow:\s*hidden[^}]*background:\s*rgba\(11,7,30,\.94\)/s);
  assert.match(styleSource, /\.tutorial-portrait\s*\{[^}]*min-height:\s*210px[^}]*overflow:\s*hidden/s);
  assert.match(styleSource, /\.tutorial-portrait img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
  assert.match(styleSource, /\.tutorial-portrait::after\s*\{[^}]*linear-gradient\(90deg,transparent 55%,rgba\(11,7,30,\.98\)\)/s);
  assert.match(styleSource, /\.tutorial-content\s*\{[^}]*z-index:2[^}]*padding:24px 26px 20px 8px/s);
  assert.match(styleSource, /\.tutorial-dialog\s*\{\s*grid-template-columns:\s*86px minmax\(0, 1fr\);\s*width:\s*100%;[\s\S]*?\.tutorial-portrait span\s*\{\s*left:\s*6px;[^}]*\}[\s\S]*?\.tutorial-content\s*\{[^}]*padding:\s*16px 12px 12px 4px/s);
});
