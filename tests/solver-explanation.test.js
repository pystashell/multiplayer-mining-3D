import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('renders one readable proof row for every numbered gold clue', () => {
  assert.match(htmlSource, /id="solver-hint-proof" class="solver-hint-proof hidden"/);
  assert.match(appSource, /proof\.clues\.forEach\(\(clue, index\) => \{/);
  assert.match(appSource, /row\.dataset\.proofClueId = id/);
  assert.match(appSource, /marker\.userData\.proofClueId = label \? String\(label\) : ''/);
  assert.match(appSource, /proofClues\[index\]\?\.id/);
  assert.match(appSource, /createGuidedEvidenceMarkers\(target\.evidence \|\| \[\], target\.solverHint\?\.details\?\.proof\)/);
  assert.doesNotMatch(appSource, /proof\.clues\.slice\(0,\s*4\)/);
});

test('styles the proof as a compact scroll-safe explanation instead of one opaque sentence', () => {
  assert.match(styleSource, /\.solver-hint-proof \{[\s\S]*display:grid[\s\S]*border:/);
  assert.match(styleSource, /\.solver-proof-clue \{[\s\S]*grid-template-columns:24px minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.solver-proof-conclusion \{/);
  assert.match(styleSource, /\.solver-hint-result \{ max-height:32vh; overflow-y:auto;/);
});
