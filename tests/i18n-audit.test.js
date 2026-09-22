import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSLATIONS } from '../public/i18n.js';
import { renderGuideTemplate } from '../public/guide-character.js';

const syntheticGuide = Object.freeze({
  id: 'waypoint',
  name: Object.freeze({ zh: '测试领航员', en: 'Test Navigator' }),
  codename: Object.freeze({ zh: '航点', en: 'WAYPOINT' }),
  role: Object.freeze({
    zh: '测试角色 · 导航员',
    en: 'Test Role · Navigator',
  }),
});

function parameterNames(template) {
  const withoutGuideTokens = template.replaceAll(/\{\{guide\.[a-zA-Z]+\}\}/g, '');
  return [...withoutGuideTokens.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

test('keeps Chinese and English translation keys and interpolation parameters in parity', () => {
  const zhKeys = Object.keys(TRANSLATIONS.zh).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(enKeys, zhKeys);

  for (const key of zhKeys) {
    assert.deepEqual(
      parameterNames(TRANSLATIONS.en[key]),
      parameterNames(TRANSLATIONS.zh[key]),
      `${key} should use the same runtime parameters in both languages`,
    );
  }
});

test('resolves every guide token with a synthetic profile and keeps English copy language-pure', () => {
  for (const [language, table] of Object.entries(TRANSLATIONS)) {
    for (const [key, template] of Object.entries(table)) {
      assert.equal(typeof template, 'string', `${language}.${key} should be a string`);
      assert.ok(template.trim(), `${language}.${key} should not be empty`);
      assert.doesNotMatch(
        renderGuideTemplate(language, template, syntheticGuide),
        /\{\{guide\./,
        `${language}.${key} contains an unknown guide token`,
      );
      if (language === 'en' && key !== 'language.toggle') {
        assert.doesNotMatch(template, /[\u3400-\u9fff]/, `${key} contains Chinese text in the English table`);
      }
    }
  }
});
