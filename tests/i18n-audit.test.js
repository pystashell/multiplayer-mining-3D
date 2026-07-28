import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSLATIONS } from '../public/i18n.js';
import { renderGuideTemplate } from '../public/guide-character.js';

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

test('resolves every guide token and keeps English copy free of accidental Chinese text', () => {
  for (const [language, table] of Object.entries(TRANSLATIONS)) {
    for (const [key, template] of Object.entries(table)) {
      assert.equal(typeof template, 'string', `${language}.${key} should be a string`);
      assert.ok(template.trim(), `${language}.${key} should not be empty`);
      assert.doesNotMatch(
        renderGuideTemplate(language, template),
        /\{\{guide\./,
        `${language}.${key} contains an unknown guide token`,
      );
      if (language === 'en' && key !== 'language.toggle') {
        assert.doesNotMatch(template, /[\u3400-\u9fff]/, `${key} contains Chinese text in the English table`);
      }
    }
  }
});

test('keeps the rewritten campaign centered on original cartography vocabulary', () => {
  const campaignCopy = Object.entries(TRANSLATIONS)
    .flatMap(([language, table]) => Object.entries(table)
      .filter(([key]) => /^(?:mission|task|squad|lobby|tutorial)\./.test(key))
      .map(([key, value]) => `${language}.${key}: ${value}`))
    .join('\n');

  assert.doesNotMatch(
    campaignCopy,
    /silver.?wolf|银狼|punklorde|朋克洛德|stellaron|星核猎手|elio|艾利欧|star rail|星穹|崩坏|崩铁|honkai|quantum|量子|antimatter|反物质|firewall|防火墙|admin(?:istrator)?|管理员|backdoor|后门|root access|根权限|ultimate.?hack|hacker|trojan/i,
  );
  assert.match(campaignCopy, /零域|zero-domain/i);
  assert.match(campaignCopy, /测绘|survey/i);
  assert.match(campaignCopy, /坐标|coordinate/i);
  assert.match(campaignCopy, /异常节点|anomaly nodes/i);
});
