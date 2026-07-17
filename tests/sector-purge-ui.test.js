import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../worker/room-engine.js', import.meta.url), 'utf8');
const revealAnimationSource = readFileSync(new URL('../public/reveal-animation.js', import.meta.url), 'utf8');

test('renders the Sector Purge identity and live elimination banner', () => {
  assert.match(indexSource, /Zero Domain Protocol: Sector Purge/);
  assert.match(indexSource, /id="sector-purge-banner"[^>]*role="status"[^>]*aria-live="assertive"/);
  assert.match(indexSource, /ZERO\/\/DOMAIN\s*<span>PURGE<\/span>/);
  assert.match(styleSource, /\.sector-purge-banner\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/s);
});

test('keeps legacy physical purge holes removed across slicing and animates them', () => {
  assert.match(appSource, /isPurged:\s*false/);
  assert.match(appSource, /cell\.group\.visible\s*=\s*!cell\.isPurged[\s\S]*this\.slice\.xMin/);
  assert.match(appSource, /animateSectorPurge\(newlyPurged, event\)/);
  assert.match(appSource, /this\.updateSectorPurgeAnimations\(\);/);
  assert.match(appSource, /this\.particles\?\.createExplosion\(world, 0x29e7ff, 24\)/);
  assert.match(engineSource, /restored\.sectorPurgedMineIndexes \?\?= \[\.\.\.restored\.purged\]/);
});

test('uses one fast first-cell timing and a slower overlapping recursive cadence', () => {
  assert.match(revealAnimationSource, /primaryRevealDurationMs:\s*110[\s\S]*cascadeRevealDurationMs:\s*420[\s\S]*cascadeLeadInMs:\s*150[\s\S]*cascadeWaveStepMs:\s*140[\s\S]*flagRiseDurationMs:\s*210[\s\S]*sectorPurgeFlagPreviewMs:\s*420[\s\S]*sectorPurgeCellDurationMs:\s*650/);
  assert.match(appSource, /revealAnimationTiming\(isActionReveal \? actionWave : null\)/);
  assert.match(appSource, /durationMs:\s*timing\.durationMs[\s\S]*delayMs:\s*revealDelayMs/);
  assert.match(appSource, /duration:\s*BOARD_ANIMATION_TIMING\.sectorPurgeCellDurationMs/);
  assert.match(appSource, /const eased = progress \* progress \* \(3 - 2 \* progress\)/);
});

test('rewrites an Auto-Purged mine as a clue and previews its flag before reveal', () => {
  assert.match(engineSource, /for \(const mine of mineIndexes\) clueSet\.add\(mine\)/);
  assert.match(engineSource, /const zeroClueSet = new Set\(updatedClues\.filter\(\(\{ count \}\) => count === 0\)/);
  assert.match(engineSource, /const targetZeroIndexes = mineIndexes\.filter\(\(index\) => zeroClueSet\.has\(index\)\)/);
  assert.match(engineSource, /replacementCells = \(purgeEvent\.mineIndexes \|\| \[\]\)[\s\S]*depth:\s*0/);
  assert.match(appSource, /sectorReplacementKeys = new Set\([\s\S]*lastPurge\?\.purgedMines[\s\S]*revealedKeys\.has\(key\)/);
  assert.match(appSource, /sectorLeadFlagKeys = new Set\([\s\S]*sectorReplacementKeys\.has\(key\)/);
  assert.match(appSource, /if \(sectorLeadFlagKeys\.has\(key\) && this\.grid\[x\]\[y\]\[z\]\.isFlagged && !shouldFlag\) continue/);
  assert.match(appSource, /revealDelayMs = timing\.delayMs \+ \(holdLeadFlag[\s\S]*sectorPurgeFlagPreviewMs/);
  assert.match(appSource, /holdFlagUntilReveal:\s*holdLeadFlag/);
  assert.match(appSource, /revealServerCell\(data,[\s\S]*holdFlagUntilReveal = false[\s\S]*if \(cell\.isFlagged && holdFlagUntilReveal\)[\s\S]*const revealNumber = \(\) =>[\s\S]*cell\.group\.remove\(heldFlag\)/);
  assert.match(appSource, /animateCellReveal\(cell, \{ durationMs, delayMs, wave, onStart: revealNumber \}\)/);
  assert.match(appSource, /const animationGeneration = this\.boardAnimationGeneration;[\s\S]*const burst = \(\) => \{[\s\S]*animationGeneration !== this\.boardAnimationGeneration/);
});

test('replay keeps replacement clues while retaining legacy physical purge holes', () => {
  assert.match(appSource, /openedKeys = new Set\(opened\.map/);
  assert.match(appSource, /physicallyPurgedMines = purgedMines[\s\S]*filter\(\(point\) => !openedKeys\.has/);
  assert.match(appSource, /for \(const point of physicallyPurgedMines\) purgedByKey\.set/);
  assert.match(appSource, /replacementLeadFlagKeys = new Set\([\s\S]*purgedMineKeys\.has\(key\) && openedKeys\.has\(key\)/);
  assert.match(appSource, /replacementLeadFlagKeys\.has\(this\.pointKey\(point\)\)[\s\S]*sectorPurgeFlagPreviewMs/);
  assert.match(appSource, /holdFlagUntilReveal:\s*holdLeadFlag/);
});

test('keeps the legacy physical-hole flag preview and dissolve animation compatible', () => {
  assert.match(engineSource, /purgeSolvedSectors\(playerId, now, \{ leadFlagIndexes = \[\] \} = \{\}\)/);
  assert.match(engineSource, /purgeSolvedSectors\(playerId, now, \{ leadFlagIndexes: \[index\] \}\)/);
  assert.match(engineSource, /leadFlags:\s*\(this\.state\.lastPurge\.leadFlagIndexes \|\| \[\]\)\.map/);
  assert.match(appSource, /const leadFlagKeys = new Set\([\s\S]*event\.leadFlags[\s\S]*!cell\.flagInstance[\s\S]*this\.attachFlagVisual\(cell, \{ animate: true \}\)[\s\S]*cell\.isPurged = true/);
  assert.match(appSource, /sectorPurgeAnimationTiming\(ordered\.length,[\s\S]*flagPreview: Boolean\(event\?\.leadFlags\?\.length\)/);
  assert.match(appSource, /this\.revealAnimationEndsAt = Math\.max\([\s\S]*performance\.now\(\) \+ timing\.totalMs/);
});

test('plays dig, chord, and Reduction recursion as delayed BFS wave fronts', () => {
  assert.match(engineSource, /revealSafeCells\(startIndexes, mineSet, startingDepth = 0\)[\s\S]*opened\.push\(\{ index: current, depth \}\)/);
  assert.match(engineSource, /let head = 0[\s\S]*while \(head < queue\.length\)[\s\S]*queued\.has\(index\)/);
  assert.match(engineSource, /recordReveal\("dig", this\.appendPurgeCascade\(opened, purgeEvent\), now\)/);
  assert.match(engineSource, /recordReveal\("chord", this\.appendPurgeCascade\(opened, purgeEvent\), now\)/);
  assert.match(engineSource, /recordReveal\(RULESETS\.SECTOR, cascade, now\)/);
  assert.match(engineSource, /this\.recordReveal\(operationKind,[\s\S]*depth:\s*0[\s\S]*cascadeCells/);
  assert.match(engineSource, /lastReveal[\s\S]*wave:\s*Math\.max\(0, Number\(this\.state\.lastReveal\.openedDepths/);
  assert.match(appSource, /revealWaves = new Map[\s\S]*const actionWave = revealWaves\.get\(key\)/);
  assert.match(appSource, /wavePulse = animation\.wave && progress < 0\.42[\s\S]*Math\.sin/);
  assert.match(appSource, /revealWaveEffects[\s\S]*wavePoints[\s\S]*createExplosion\(wavePoint, 0x29e7ff, particleCount\)/);
  assert.match(appSource, /revealAnimationEndsAt = Math\.max[\s\S]*waveAnimationWait \+ 1200/);
  assert.match(appSource, /onStart:\s*revealNumber[\s\S]*updateCellRevealAnimations[\s\S]*animation\.onStart\?\.\(\)/);
  assert.match(appSource, /boardAnimationGeneration[\s\S]*this\.boardAnimationGeneration !== animationGeneration/);
  assert.match(appSource, /startNewGame\(\) \{[\s\S]*?this\.boardAnimationGeneration \+= 1;[\s\S]*?this\.roomClient\.send\(\{ op: 'restart'/);
  assert.match(appSource, /this\.texture = this\.createParticleTexture\(\)[\s\S]*map:\s*this\.texture/);
  assert.match(appSource, /frameScale = Math\.min\(3, deltaTime \* 60\)[\s\S]*Math\.pow\(0\.96, frameScale\)/);
});

test('refreshes recalculated numbers, hides only zero clues, and shows remaining mines', () => {
  assert.match(appSource, /remainingMineCount\s*=\s*this\.roomSnapshot\?\.remainingMineCount\s*\?\?\s*this\.mineCount/);
  assert.match(appSource, /if \(cell\.neighborMines !== data\.count\)[\s\S]*this\.refreshNumberSprite\(cell\)/);
  assert.match(appSource, /refreshNumberSprite\(cell\)[\s\S]*if \(cell\.isRevealed && cell\.neighborMines > 0\) this\.createNumberSprite\(cell\)/);
  assert.match(appSource, /cell\.spriteInstance !== sprite/);
});

test('derives progress from the active board after Reduction creates a new safe clue', () => {
  assert.match(appSource, /currentBoardProgress\(snapshot = this\.roomSnapshot\)[\s\S]*totalCells - purgedCells - remainingMineCount/);
  assert.match(appSource, /revealedCells = snapshot\?\.revealed\?\.length \?\? this\.revealedCount/);
  assert.match(appSource, /checkVictory\(snapshot = this\.roomSnapshot\)[\s\S]*revealedCells >= safeCells/);
  assert.doesNotMatch(appSource, /completedSafeCells\s*=\s*this\.revealedCount\s*\+\s*Number\(this\.roomSnapshot\?\.purgedSafeCount/);
});

test('keeps the purge notice compact on mobile and below the top verification area', () => {
  assert.match(styleSource, /@media \(max-width:\s*900px\)[\s\S]*\.sector-purge-banner\s*\{[^}]*top:\s*calc\(58px \+ env\(safe-area-inset-top\)\)[^}]*width:\s*calc\(100vw - 20px\)/s);
  assert.match(styleSource, /body:has\(#tutorial-action-hint:not\(\.hidden\)\) \.sector-purge-banner\s*\{[^}]*top:\s*calc\(178px \+ env\(safe-area-inset-top\)\)/s);
});

test('progresses campaign features from classic to auto purge to the combined toolset', () => {
  assert.match(appSource, /easy:\s*Object\.freeze\(\{[^}]*ruleset:\s*'classic'[^}]*autoPurge:\s*false[^}]*reduction:\s*false[^}]*campaign:\s*true/s);
  assert.match(appSource, /medium:\s*Object\.freeze\(\{[^}]*mineCount:\s*10[^}]*ruleset:\s*'sector'[^}]*autoPurge:\s*true[^}]*reduction:\s*false[^}]*campaign:\s*true/s);
  assert.match(appSource, /hard:\s*Object\.freeze\(\{[^}]*mineCount:\s*30[^}]*ruleset:\s*'reduction'[^}]*autoPurge:\s*true[^}]*reduction:\s*true[^}]*campaign:\s*true/s);
  assert.match(indexSource, /id="btn-preset-medium"[^>]*data-m="10"[\s\S]*id="btn-preset-hard"[^>]*data-m="30"/);
  assert.match(engineSource, /purgeSolvedSectors\(playerId, now\)[\s\S]*this\.sectorPurgeEnabled\(\)/);
  assert.match(engineSource, /reduceCell\(playerId, point, now\)[\s\S]*this\.reductionEnabled\(\)/);
  assert.match(engineSource, /reduceCell\(playerId, point, now\)[\s\S]*this\.purgeMines\(playerId, \[index\]/);
  assert.match(appSource, /titleKey:\s*'reduction\.tutorialTitle'/);
});

test('keeps every campaign chapter open and moves free play configuration into the game', () => {
  const pickerStart = indexSource.indexOf('id="ruleset-picker"');
  const pickerEnd = indexSource.indexOf('id="ultimate-hack-launch"', pickerStart);
  const pickerSource = indexSource.slice(pickerStart, pickerEnd);
  assert.match(indexSource, /id="btn-task-freeplay"/);
  assert.match(indexSource, /data-mission="easy"[\s\S]*data-mission="medium"[\s\S]*data-mission="hard"/);
  assert.doesNotMatch(indexSource, /freeplayLocked|data-freeplay-preset|data-freeplay-ruleset/);
  assert.doesNotMatch(appSource, /campaignProgress|CAMPAIGN_PROGRESS_KEY|campaignMissionUnlocked/);
  assert.match(appSource, /button\.disabled = false/);
  assert.match(indexSource, /class="panel-section settings-section"[\s\S]*id="btn-preset-easy"[\s\S]*id="btn-preset-medium"[\s\S]*id="btn-preset-hard"/);
  assert.match(appSource, /FREEPLAY_DEFAULT_ADDONS = Object\.freeze\(\{[^}]*ruleset:\s*'reduction'[^}]*autoPurge:\s*true[^}]*reduction:\s*true[^}]*campaign:\s*false/s);
  assert.match(pickerSource, /role="group"[\s\S]*data-feature="autoPurge"[^>]*role="switch"[\s\S]*data-feature="reduction"[^>]*role="switch"/);
  assert.equal((pickerSource.match(/data-feature=/g) || []).length, 2);
  assert.doesNotMatch(pickerSource, /data-ruleset=|ruleset\.classic|经典扫描|Classic Scan/);
  assert.match(appSource, /toggleGameFeature\(feature\)[\s\S]*feature === 'autoPurge'[\s\S]*feature === 'reduction'[\s\S]*this\.syncFeatureButtons\(\)/);
  assert.match(appSource, /syncFeatureButtons\(\)[\s\S]*button\.dataset\.feature === 'autoPurge'[\s\S]*this\.autoPurgeEnabled[\s\S]*this\.reductionEnabled[\s\S]*aria-checked/);
  assert.match(appSource, /autoPurge:\s*this\.autoPurgeEnabled[\s\S]*reduction:\s*this\.reductionEnabled/);
  assert.match(engineSource, /const autoPurge = typeof value\.autoPurge === "boolean"[\s\S]*const reduction = typeof value\.reduction === "boolean"/);
  assert.match(styleSource, /body\[data-game-mode="task"\]\[data-task-flow="campaign"\] \.settings-section\s*\{\s*display:\s*none/);
});

test('maps every Free Mode lobby level to its matching board with both add-ons enabled', () => {
  const freeplayPanelStart = indexSource.indexOf('id="lobby-freeplay-panel"');
  const freeplayPanelEnd = indexSource.indexOf('id="btn-start-task"', freeplayPanelStart);
  const freeplayPanelSource = indexSource.slice(freeplayPanelStart, freeplayPanelEnd);
  assert.ok(freeplayPanelStart >= 0 && freeplayPanelEnd > freeplayPanelStart);
  assert.match(freeplayPanelSource, /freeplay-mission-picker[^>]*role="radiogroup"/);
  assert.match(freeplayPanelSource, /data-mission="easy"[^>]*role="radio"[^>]*aria-checked="true"[\s\S]*3³[\s\S]*3×3×3[^<]*3 /);
  assert.match(freeplayPanelSource, /data-mission="medium"[^>]*role="radio"[^>]*aria-checked="false"[\s\S]*5³[\s\S]*5×5×5[^<]*10 /);
  assert.match(freeplayPanelSource, /data-mission="hard"[^>]*role="radio"[^>]*aria-checked="false"[\s\S]*7³[\s\S]*7×7×7[^<]*30 /);
  assert.equal((freeplayPanelSource.match(/data-mission=/g) || []).length, 3);
  assert.match(styleSource, /#lobby-campaign-panel\.hidden,[\s\S]*#lobby-freeplay-panel\.hidden,[\s\S]*display:\s*none !important/);

  assert.match(appSource, /easy:\s*Object\.freeze\(\{[^}]*width:\s*3[^}]*height:\s*3[^}]*depth:\s*3[^}]*mineCount:\s*3/s);
  assert.match(appSource, /medium:\s*Object\.freeze\(\{[^}]*width:\s*5[^}]*height:\s*5[^}]*depth:\s*5[^}]*mineCount:\s*10/s);
  assert.match(appSource, /hard:\s*Object\.freeze\(\{[^}]*width:\s*7[^}]*height:\s*7[^}]*depth:\s*7[^}]*mineCount:\s*30/s);
  assert.match(appSource, /FREEPLAY_DEFAULT_ADDONS = Object\.freeze\(\{[^}]*ruleset:\s*'reduction'[^}]*autoPurge:\s*true[^}]*reduction:\s*true[^}]*campaign:\s*false/s);

  const startHandlerStart = appSource.indexOf("document.getElementById('btn-start-task').addEventListener");
  const startHandlerEnd = appSource.indexOf("document.getElementById('btn-join-room').addEventListener", startHandlerStart);
  const startHandlerSource = appSource.slice(startHandlerStart, startHandlerEnd);
  assert.ok(startHandlerStart >= 0 && startHandlerEnd > startHandlerStart);
  assert.match(startHandlerSource, /const mission = TASK_MISSIONS\[this\.taskMission\] \?\? TASK_MISSIONS\.easy/);
  assert.match(startHandlerSource, /this\.taskFlow === 'campaign'[\s\S]*\? mission[\s\S]*:\s*\{ \.\.\.mission, \.\.\.FREEPLAY_DEFAULT_ADDONS \}/);
  assert.match(startHandlerSource, /this\.pendingTaskMission = this\.taskMission/);
  assert.match(startHandlerSource, /this\.pendingTaskConfig = \{ \.\.\.desired \}/);
  assert.match(startHandlerSource, /this\.roomClient\.create\(nickname, 'solo'\)/);

  const selectionStart = appSource.indexOf('  selectTaskMission(mission) {');
  const selectionEnd = appSource.indexOf('  storyArtKey(', selectionStart);
  const selectionSource = appSource.slice(selectionStart, selectionEnd);
  assert.match(selectionSource, /this\.taskMission = mission/);
  assert.match(selectionSource, /button\.dataset\.mission === mission[\s\S]*aria-checked/);
});

test('queues Free Mode presets and waits for the authoritative snapshot before replacing the board', () => {
  assert.match(indexSource, /id="btn-preset-easy"[^>]*data-w="3"[^>]*data-h="3"[^>]*data-d="3"[^>]*data-m="3"/);
  assert.match(indexSource, /id="btn-preset-medium"[^>]*data-w="5"[^>]*data-h="5"[^>]*data-d="5"[^>]*data-m="10"/);
  assert.match(indexSource, /id="btn-preset-hard"[^>]*data-w="7"[^>]*data-h="7"[^>]*data-d="7"[^>]*data-m="30"/);

  const presetStart = appSource.indexOf('  selectPreset(element) {');
  const presetEnd = appSource.indexOf('  toggleGameFeature(', presetStart);
  const presetSource = appSource.slice(presetStart, presetEnd);
  assert.ok(presetStart >= 0 && presetEnd > presetStart);
  assert.doesNotMatch(presetSource, /this\.(?:width|height|depth|mineCount)\s*=/);
  assert.match(presetSource, /getElementById\('custom-toggle'\)\.classList\.remove\('active'\)/);
  assert.match(presetSource, /getElementById\('custom-inputs'\)\.classList\.add\('hidden'\)/);
  assert.match(presetSource, /this\.startNewGame\(\)/);

  const restartStart = appSource.indexOf('  startNewGame() {');
  const restartEnd = appSource.indexOf('  buildGridLocal()', restartStart);
  const restartSource = appSource.slice(restartStart, restartEnd);
  assert.ok(restartStart >= 0 && restartEnd > restartStart);
  assert.match(restartSource, /const config\s*=\s*\{[\s\S]*width:\s*width \?\? this\.width[\s\S]*height:\s*height \?\? this\.height[\s\S]*depth:\s*depth \?\? this\.depth[\s\S]*mineCount:\s*mineCount \?\? this\.mineCount/);
  assert.doesNotMatch(restartSource, /this\.(?:width|height|depth|mineCount)\s*=/);
  assert.match(restartSource, /if \(this\.gameMode === 'solo'\) \{[\s\S]*this\.pendingTaskConfig = \{ \.\.\.config \}/);
  assert.match(restartSource, /this\.isInteractionLocked = true/);
  assert.match(restartSource, /this\.roomClient\.send\(\{[\s\S]*op:\s*'restart',[\s\S]*config,[\s\S]*\}\)/);
  assert.doesNotMatch(restartSource, /this\.(?:applyConfig|buildGridLocal)\(/);

  const snapshotStart = appSource.indexOf('  applyRoomSnapshot(snapshot, initial = false) {');
  const snapshotEnd = appSource.indexOf('  renderPlayers(', snapshotStart);
  const snapshotSource = appSource.slice(snapshotStart, snapshotEnd);
  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart);
  assert.match(snapshotSource, /if \(configChanged \|\| restarted \|\| !this\.grid\.length\) \{[\s\S]*this\.applyConfig\(snapshot\.config\);[\s\S]*this\.buildGridLocal\(\)/);
});

test('enters the hidden Ultimate chapter after hard, then returns to a hard Free Mode board', () => {
  const methodStart = appSource.indexOf('  enterFreeModeAfterCampaign()');
  const methodEnd = appSource.indexOf('  advanceTaskMission(', methodStart);
  const methodSource = appSource.slice(methodStart, methodEnd);

  assert.match(appSource, /task\.hard\.complete\.3[^}]*buttonKey:\s*'tutorial\.enterUltimate'/);
  assert.match(appSource, /mission === 'hard' \? 'ultimate' : null/);
  assert.match(appSource, /onComplete:\s*nextMission \? \(\) => this\.advanceTaskMission\(nextMission\) : null/);
  assert.match(appSource, /mission === 'ultimate'[\s\S]*task\.ultimate\.complete\.2[\s\S]*buttonKey:\s*'tutorial\.enterFreeplay'[\s\S]*onComplete:\s*\(\) => this\.enterFreeModeAfterCampaign\(\)/);
  assert.match(methodSource, /this\.taskMission === 'ultimate'[\s\S]*TASK_MISSIONS\.hard/);
  assert.match(methodSource, /\.\.\.completedConfig,\s*campaign:\s*false/);
  assert.match(methodSource, /this\.pendingTaskConfig = \{ \.\.\.config \}/);
  assert.match(methodSource, /this\.roomClient\.send\(\{ op: 'restart', config \}\)/);
  assert.doesNotMatch(methodSource, /\b(?:width|height|depth|mineCount|ruleset|autoPurge|reduction)\s*:/);
});

test('keeps number auto-open separate from direct cell reduction', () => {
  const chordSource = engineSource.slice(engineSource.indexOf('  chord('), engineSource.indexOf('  reduceCell('));
  assert.equal((appSource.match(/titleKey: 'reduction\.tutorialTitle'/g) || []).length, 1);
  assert.doesNotMatch(appSource, /maybeShowHardReductionTip|hardReductionTipShown|reduction\.ready/);
  assert.match(appSource, /event\.kind === 'reduction' \? 'reduction' : 'purge'/);
  assert.match(appSource, /this\.roomClient\.send\(\{ op: 'reduce', x, y, z \}\)/);
  assert.doesNotMatch(chordSource, /purgeMines/);
});

test('shows an explosion without inventing a mine when Reduction targets a safe cell', () => {
  assert.match(engineSource, /triggerMine\(playerId, index, now, "reduction_miss"\)/);
  assert.match(appSource, /showMine:\s*snapshot\.pendingFailureKind !== 'reduction_miss'/);
  assert.match(appSource, /triggerMineLocal\(x, y, z, \{ showMine = true \} = \{\}\)[\s\S]*if \(showMine\)[\s\S]*this\.geometries\.mine\.clone\(\)[\s\S]*else \{[\s\S]*cell\.mesh\.visible = true/);
});
