import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUIDE_CHARACTER,
  guideCharacterText,
  renderGuideTemplate,
} from '../public/guide-character.js';
import { TRANSLATIONS } from '../public/i18n.js';

const runtimeFiles = [
  '../public/app.js',
  '../public/i18n.js',
  '../public/index.html',
  '../public/style.css',
  '../worker/index.js',
  '../worker/room-engine.js',
];

const runtimeSource = runtimeFiles
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');

const replacementProfiles = [
  Object.freeze({
    id: 'vector',
    name: Object.freeze({ zh: '林岚', en: 'Lin Lan' }),
    codename: Object.freeze({ zh: '折线', en: 'VECTOR' }),
    role: Object.freeze({
      zh: '边界测绘师 · 路径分析员',
      en: 'Boundary Cartographer · Route Analyst',
    }),
  }),
  Object.freeze({
    id: 'wayfinder',
    name: Object.freeze({ zh: '云岬', en: 'Mira Vale' }),
    codename: Object.freeze({ zh: '航标', en: 'WAYFINDER' }),
    role: Object.freeze({
      zh: '航迹校准员 · 证据领航员',
      en: 'Route Calibrator · Evidence Navigator',
    }),
  }),
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('accepts a complete bilingual guide profile without depending on the current identity', () => {
  for (const field of ['id', 'name', 'codename', 'role']) {
    assert.ok(GUIDE_CHARACTER[field], `guide profile should define ${field}`);
  }
  for (const field of ['name', 'codename', 'role']) {
    for (const language of ['zh', 'en']) {
      assert.equal(typeof GUIDE_CHARACTER[field][language], 'string');
      assert.ok(GUIDE_CHARACTER[field][language].trim());
    }
  }
});

test('derives every displayed identity field from arbitrary replacement profiles', () => {
  for (const replacement of replacementProfiles) {
    const zh = guideCharacterText('zh', replacement);
    const en = guideCharacterText('en', replacement);

    assert.equal(zh.name, replacement.name.zh);
    assert.equal(zh.codenameLocal, replacement.codename.zh);
    assert.equal(zh.display, `${replacement.name.zh}｜${replacement.codename.en}`);
    assert.equal(zh.squad, `${replacement.codename.zh}测绘小队`);
    assert.equal(zh.computation, `${replacement.codename.zh}演算`);
    assert.equal(en.name, replacement.name.en);
    assert.equal(en.codename, replacement.codename.en);
    assert.equal(
      en.display,
      `${replacement.name.en.toUpperCase()} | ${replacement.codename.en}`,
    );
    assert.equal(
      renderGuideTemplate('zh', '{{guide.display}} · {{guide.role}}', replacement),
      `${replacement.name.zh}｜${replacement.codename.en} · ${replacement.role.zh}`,
    );
    assert.equal(
      renderGuideTemplate('en', '{{guide.nameUpper}} // {{guide.codename}}', replacement),
      `${replacement.name.en.toUpperCase()} // ${replacement.codename.en}`,
    );
  }
});

test('keeps configured identity literals out of runtime consumers and structural names', () => {
  for (const literal of [
    GUIDE_CHARACTER.id,
    GUIDE_CHARACTER.name.zh,
    GUIDE_CHARACTER.name.en,
    GUIDE_CHARACTER.codename.en,
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(escapeRegExp(literal), 'iu'));
  }
  assert.match(runtimeSource, /guide-(?:lobby|comms)|(?:show|render|advance|finish)GuideDialogue/);
});

test('resolves representative guide templates for every replacement profile and language', () => {
  for (const replacement of replacementProfiles) {
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
        const template = TRANSLATIONS[language][key];
        assert.doesNotMatch(
          renderGuideTemplate(language, template, replacement),
          /\{\{guide\./,
        );
      }
    }
  }
});
