import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GUIDE_ART } from '../public/guide-character.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const appSource = readFileSync(`${root}/public/app.js`, 'utf8');
const indexSource = readFileSync(`${root}/public/index.html`, 'utf8');

function configuredGuideArtSources() {
  return new Set([
    ...Object.values(GUIDE_ART.story),
    ...Object.values(GUIDE_ART.dialogue)
      .flatMap((chapter) => Object.values(chapter)),
  ]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('ships a configured guide illustration for every story route', () => {
  for (const [route, source] of Object.entries(GUIDE_ART.story)) {
    assert.ok(
      statSync(`${root}/public/${source}`).size > 100_000,
      `${route} should point to a rendered illustration`,
    );
  }
  assert.match(appSource, /import \{ GUIDE_ART \} from '\.\/guide-character\.js'/);
  for (const source of configuredGuideArtSources()) {
    assert.doesNotMatch(
      appSource,
      new RegExp(escapeRegExp(source)),
      `${source} must be referenced only through GUIDE_ART`,
    );
  }
  assert.match(indexSource, /id="mission-art"/);
  assert.match(indexSource, /id="tutorial-art"/);
  assert.doesNotMatch(indexSource, /id="(?:mission|tutorial)-art"[^>]*\ssrc=/);
});

test('uses mobile-sized master-derived art for each dialogue beat', () => {
  const sources = new Set(Object.values(GUIDE_ART.dialogue).flatMap((chapter) => Object.values(chapter)));
  for (const source of sources) {
    const bytes = statSync(`${root}/public/${source}`).size;
    assert.ok(bytes > 100_000, `${source} should contain a rendered dialogue frame`);
    if (source.endsWith('.webp')) {
      assert.ok(bytes < 250_000, `${source} should remain lightweight for mobile dialogue loading`);
    }
  }
  for (const artKey of ['neighbors', 'scan', 'tip', 'ready']) {
    assert.match(appSource, new RegExp(`artKey: '${artKey}'`));
  }
});

test('reuses the advanced chapter main art for every advanced dialogue', () => {
  assert.equal(GUIDE_ART.dialogue.hard.main, GUIDE_ART.story.hard);
  assert.equal(GUIDE_ART.dialogue.ultimate.main, GUIDE_ART.story.ultimate);
  assert.match(appSource, /hard: \['main', 'main', 'main'\]/);
  assert.doesNotMatch(appSource, /artKey: 'commit'/);
});
