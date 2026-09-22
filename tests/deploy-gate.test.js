import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

function requireOrder(source, commands) {
  let cursor = -1;
  for (const command of commands) {
    const next = source.indexOf(command, cursor + 1);
    assert.ok(next > cursor, `${command} must appear after the previous gate`);
    cursor = next;
  }
}

test('production deployment requires automated, bundle, and current UI approval gates', () => {
  assert.equal(
    packageJson.scripts.deploy,
    'npm run predeploy && wrangler deploy',
    'npm run deploy must complete the reusable predeploy gate before Wrangler',
  );
  assert.equal(
    packageJson.scripts.predeploy,
    'npm test && npm run deploy:dry && npm run ui:check',
  );
  requireOrder(packageJson.scripts.predeploy, [
    'npm test',
    'npm run deploy:dry',
    'npm run ui:check',
  ]);
});

test('the complete regression command checks documentation, assets, version, and all test files', () => {
  requireOrder(packageJson.scripts.test, [
    'npm run test:catalog:check',
    'npm run ui:manual:check',
    'npm run vendor:check',
    'npm run version:check',
    'node --test tests/*.test.js',
  ]);
});

test('development, UI evidence, validation, and live-smoke scripts remain available', () => {
  assert.equal(packageJson.scripts.dev, 'wrangler dev');
  assert.equal(packageJson.scripts['vendor:sync'], 'node scripts/sync-vendor-assets.mjs');
  assert.equal(packageJson.scripts['vendor:check'], 'node scripts/sync-vendor-assets.mjs --check');
  assert.equal(packageJson.scripts.version, 'node scripts/sync-release-version.mjs');
  assert.equal(packageJson.scripts['version:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['test:catalog'], 'node scripts/generate-test-catalog.mjs');
  assert.equal(
    packageJson.scripts['test:catalog:check'],
    'node scripts/generate-test-catalog.mjs --check',
  );
  assert.equal(packageJson.scripts['ui:manual'], 'node scripts/generate-ui-manual.mjs');
  assert.equal(
    packageJson.scripts['ui:manual:check'],
    'node scripts/generate-ui-manual.mjs --check',
  );
  assert.equal(packageJson.scripts['ui:approve'], 'node scripts/record-ui-approval.mjs');
  assert.equal(packageJson.scripts['ui:check'], 'node scripts/check-ui-approval.mjs');
  assert.equal(packageJson.scripts['test:live'], 'node tests/live-room-smoke.js');
  assert.equal(packageJson.scripts['verify:live-version'], 'node scripts/verify-live-version.mjs');
  assert.equal(packageJson.scripts['deploy:dry'], 'wrangler deploy --dry-run');
});
