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
const manualFinalizeWorkflow = readFileSync(
  new URL('../.github/workflows/finalize-manual-release.yml', import.meta.url),
  'utf8',
);
const liveVersionScript = readFileSync(
  new URL('../scripts/verify-live-version.mjs', import.meta.url),
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
  assert.match(ciWorkflow, /push:\s+branches:\s+- "\*\*"/s);
  assert.doesNotMatch(ciWorkflow, /push:\s+tags:/s);
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /workflow_dispatch:/);
  assert.match(ciWorkflow, /permissions:\s+contents: read/s);
  requireOrder(ciWorkflow, ['npm ci', 'npm test', 'npm run deploy:dry']);
  assert.match(ciWorkflow, /actions\/checkout@[0-9a-f]{40} # v6/);
  assert.match(ciWorkflow, /actions\/setup-node@[0-9a-f]{40} # v6/);
});

test('release workflow deploys only unsuffixed semantic tags from an approved branch', () => {
  assert.match(
    releaseWorkflow,
    /tags:\s+- "v\*\.\*\.\*"\s+- "!v\*\.\*\.\*-\*"/s,
  );
  assert.match(releaseWorkflow, /ref: \$\{\{ github\.ref_name \}\}/);
  assert.match(
    releaseWorkflow,
    /release_commit="\$\(git rev-parse "\$\{GITHUB_SHA\}\^\{commit\}"\)"/,
  );
  assert.match(releaseWorkflow, /git merge-base --is-ancestor "\$release_commit" origin\/main/);
  assert.match(releaseWorkflow, /origin\/codex\/\$\{GITHUB_REF_NAME\}-/);
  assert.match(releaseWorkflow, /git for-each-ref[\s\S]+--contains "\$release_commit"/);
  assert.match(releaseWorkflow, /environment: production/);
  assert.match(releaseWorkflow, /actions\/checkout@[0-9a-f]{40} # v6/);
  assert.match(releaseWorkflow, /actions\/setup-node@[0-9a-f]{40} # v6/);
});

test('release remains draft until deploy and live verification both succeed', () => {
  requireOrder(releaseWorkflow, [
    'npm run release:check -- "$GITHUB_REF_NAME"',
    'npm test',
    'npm run deploy:dry',
    'npm run ui:check -- "$GITHUB_REF_NAME"',
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

test('manual release recovery only publishes an existing tag after live verification', () => {
  assert.match(
    manualFinalizeWorkflow,
    /branches:\s+- "codex\/v\*\.\*\.\*-\*"/s,
  );
  assert.match(
    manualFinalizeWorkflow,
    /if: contains\(github\.event\.head_commit\.message, '\[finalize-release\]'\)/,
  );
  assert.match(
    manualFinalizeWorkflow,
    /release_commit="\$\(git rev-parse "\$\{release_tag\}\^\{commit\}"\)"/,
  );
  assert.match(
    manualFinalizeWorkflow,
    /git merge-base --is-ancestor "\$release_commit" "\$GITHUB_SHA"/,
  );
  assert.doesNotMatch(manualFinalizeWorkflow, /wrangler deploy/);
  requireOrder(manualFinalizeWorkflow, [
    'npm run release:check -- "$RELEASE_TAG"',
    'npm test',
    'npm run ui:check -- "$RELEASE_TAG"',
    'npm run verify:live-version',
    'npm run test:live',
    'gh release edit "$RELEASE_TAG" --draft=false --latest',
  ]);
});

test('package scripts keep local deployment and release verification gates available', () => {
  assert.equal(packageJson.scripts['version:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['release:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['verify:live-version'], 'node scripts/verify-live-version.mjs');
  assert.equal(
    packageJson.scripts.predeploy,
    'npm test && npm run deploy:dry && npm run ui:check',
  );
  assert.equal(packageJson.scripts.deploy, 'npm run predeploy && wrangler deploy');
});

test('live-version verification exits naturally after success on Windows', () => {
  assert.match(liveVersionScript, /let verified = false/);
  assert.match(liveVersionScript, /verified = true;\s*break;/);
  assert.doesNotMatch(liveVersionScript, /process\.exit\(/);
});
