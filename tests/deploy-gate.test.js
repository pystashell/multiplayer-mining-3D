import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

test('production deployment is blocked unless the complete test suite passes first', () => {
  assert.equal(
    packageJson.scripts.deploy,
    'npm test && wrangler deploy',
    'npm run deploy must run the complete test suite before invoking Wrangler',
  );
});

test('development, validation, and live-smoke scripts remain available', () => {
  assert.equal(packageJson.scripts.dev, 'wrangler dev');
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.js');
  assert.equal(packageJson.scripts['test:live'], 'node tests/live-room-smoke.js');
  assert.equal(packageJson.scripts['deploy:dry'], 'wrangler deploy --dry-run');
});
