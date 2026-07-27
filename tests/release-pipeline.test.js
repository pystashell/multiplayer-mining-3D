import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const ciWorkflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const releaseWorkflow = readFileSync(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8',
);

function requireOrder(source, commands) {
  let cursor = -1;
  for (const command of commands) {
    const next = source.indexOf(command, cursor + 1);
    assert.ok(next > cursor, `${command} must appear after the previous release gate`);
    cursor = next;
  }
}

test('CI runs complete tests before the Cloudflare deployment dry run', () => {
  assert.match(ciWorkflow, /push:/);
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /workflow_dispatch:/);
  assert.match(ciWorkflow, /permissions:\s+contents: read/s);
  requireOrder(ciWorkflow, ['npm ci', 'npm test', 'npm run deploy:dry']);
  assert.match(ciWorkflow, /actions\/checkout@[0-9a-f]{40} # v6/);
  assert.match(ciWorkflow, /actions\/setup-node@[0-9a-f]{40} # v6/);
});

test('release workflow deploys only semantic tags from the exact tagged commit', () => {
  assert.match(releaseWorkflow, /tags:\s+- "v\*\.\*\.\*"/s);
  assert.match(releaseWorkflow, /ref: \$\{\{ github\.ref_name \}\}/);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(releaseWorkflow, /environment: production/);
  assert.match(releaseWorkflow, /actions\/checkout@[0-9a-f]{40} # v6/);
  assert.match(releaseWorkflow, /actions\/setup-node@[0-9a-f]{40} # v6/);
});

test('release remains draft until deploy and live verification both succeed', () => {
  requireOrder(releaseWorkflow, [
    'npm run release:check -- "$GITHUB_REF_NAME"',
    'npm test',
    'npm run deploy:dry',
    'gh release create "$GITHUB_REF_NAME"',
    'npx wrangler deploy',
    'npm run verify:live-version',
    'npm run test:live',
    'gh release edit "$GITHUB_REF_NAME" --draft=false --latest',
  ]);
  assert.match(releaseWorkflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(releaseWorkflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(releaseWorkflow, /permissions:\s+contents: write/s);
});

test('package scripts keep local deployment and release verification gates available', () => {
  assert.equal(packageJson.scripts['version:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['release:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['verify:live-version'], 'node scripts/verify-live-version.mjs');
  assert.equal(packageJson.scripts.deploy, 'npm test && wrangler deploy');
});
