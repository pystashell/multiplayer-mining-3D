import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appSource = readFileSync(`${root}/public/app.js`, 'utf8');
const indexSource = readFileSync(`${root}/public/index.html`, 'utf8');

const storyArt = {
  easy: 'silver-wolf-quantum-pathfinder.png',
  medium: 'silver-wolf-neighbor-hack.png',
  hard: 'silver-wolf-final-protocol.png',
  squad: 'silver-wolf-squad-link.png',
};

const dialogueArt = [
  'silver-wolf-easy-neighbors.webp',
  'silver-wolf-easy-scan.webp',
  'silver-wolf-easy-finish.webp',
  'silver-wolf-medium-tip.webp',
  'silver-wolf-medium-scan.webp',
  'silver-wolf-medium-inspect.webp',
  'silver-wolf-medium-ready.webp',
];

test('ships a distinct Silver Wolf illustration for every story route', () => {
  for (const [route, filename] of Object.entries(storyArt)) {
    assert.match(appSource, new RegExp(`${route}: 'assets/${filename.replaceAll('.', '\\.')}'`));
    assert.ok(statSync(`${root}/public/assets/${filename}`).size > 100_000, `${filename} should contain a rendered illustration`);
  }
  assert.match(indexSource, /id="mission-art"/);
  assert.match(indexSource, /id="tutorial-art"/);
});

test('uses mobile-sized master-derived art for each dialogue beat', () => {
  for (const filename of dialogueArt) {
    const bytes = statSync(`${root}/public/assets/${filename}`).size;
    assert.ok(bytes > 100_000, `${filename} should contain a rendered dialogue frame`);
    assert.ok(bytes < 250_000, `${filename} should remain lightweight for mobile dialogue loading`);
    assert.match(appSource, new RegExp(`assets/${filename.replaceAll('.', '\\.')}`));
  }
  for (const artKey of ['neighbors', 'scan', 'tip', 'ready']) {
    assert.match(appSource, new RegExp(`artKey: '${artKey}'`));
  }
});

test('reuses the advanced chapter main art for every advanced dialogue', () => {
  assert.match(appSource, /hard: Object\.freeze\(\{\s*main: STORY_ART\.hard,\s*\}\)/);
  assert.match(appSource, /ultimate: Object\.freeze\(\{\s*main: STORY_ART\.ultimate,\s*\}\)/);
  assert.match(appSource, /hard: \['main', 'main', 'main'\]/);
  assert.doesNotMatch(appSource, /silver-wolf-hard-commit|artKey: 'commit'/);
});
