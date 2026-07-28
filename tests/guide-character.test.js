import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUIDE_CHARACTER,
  guideCharacterText,
  renderGuideTemplate,
} from '../public/guide-character.js';
import { translate } from '../public/i18n.js';

const runtimeFiles = [
  '../public/app.js',
  '../public/i18n.js',
  '../public/index.html',
  '../public/style.css',
  '../worker/index.js',
  '../worker/room-engine.js',
  '../README.md',
  '../GUIDE_ART_MAPPING.md',
  '../SOUNDTRACK_COMPOSITION_PROMPT.md',
  '../SOUNDTRACK_COMPOSITION_PROMPT.zh-CN.md',
];

const runtimeSource = runtimeFiles
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');

test('renders every guide identity field from one replaceable character profile', () => {
  const replacement = Object.freeze({
    id: 'vector',
    name: Object.freeze({ zh: '林岚', en: 'Lin Lan' }),
    codename: Object.freeze({ zh: '折线', en: 'VECTOR' }),
    role: Object.freeze({
      zh: '边界测绘师 · 路径分析员',
      en: 'Boundary Cartographer · Route Analyst',
    }),
  });
  const zh = guideCharacterText('zh', replacement);
  const en = guideCharacterText('en', replacement);

  assert.equal(zh.display, '林岚｜VECTOR');
  assert.equal(zh.squad, '折线测绘小队');
  assert.equal(zh.computation, '折线演算');
  assert.equal(en.display, 'LIN LAN | VECTOR');
  assert.equal(en.squad, 'Vector Survey Squad');
  assert.equal(en.computation, 'Vector Computation');
  assert.equal(
    renderGuideTemplate('zh', '{{guide.display}} · {{guide.role}}', replacement),
    '林岚｜VECTOR · 边界测绘师 · 路径分析员',
  );
  assert.equal(
    renderGuideTemplate('en', '{{guide.nameUpper}} // {{guide.codename}}', replacement),
    'LIN LAN // VECTOR',
  );
});

test('keeps the current guide identity out of runtime copy and structural names', () => {
  const current = guideCharacterText('zh');
  const english = guideCharacterText('en');
  for (const literal of [
    GUIDE_CHARACTER.name.zh,
    GUIDE_CHARACTER.name.en,
    GUIDE_CHARACTER.codename.en,
    current.computation,
    english.computation,
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(literal));
  }
  assert.doesNotMatch(runtimeSource, /Parallax(?:Dialogue|Tutorial)|parallax-(?:lobby|comms)/i);
  assert.match(runtimeSource, /guide-(?:lobby|comms)|(?:show|render|advance|finish)GuideDialogue/);
});

test('resolves guide templates in both languages without leaking placeholders', () => {
  for (const language of ['zh', 'en']) {
    for (const key of [
      'document.title',
      'subtitle',
      'mission.speaker',
      'task.guide.title',
      'players.title',
      'autoSurvey.launchTitle',
      'solver.button',
    ]) {
      assert.doesNotMatch(translate(language, key), /\{\{guide\./);
    }
  }
});

test('keeps current runtime and project copy free of the retired franchise vocabulary', () => {
  assert.doesNotMatch(
    runtimeSource,
    /silver.?wolf|银狼|silverwolf|punklorde|朋克洛德|stellaron|星核猎手|elio|艾利欧|star rail|星穹|崩坏|崩铁|honkai|量子之海|quantum|量子|antimatter|反物质|ultimate.?hack|hacker|trojan/i,
  );
});
