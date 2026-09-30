import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  assertCacheVersions,
  assertReleaseMetadata,
  cacheVersionsIn,
  releaseTagFor,
} from '../scripts/release-version.mjs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
const publicVersion = JSON.parse(
  readFileSync(new URL('../public/version.json', import.meta.url), 'utf8'),
);

test('release identity is synchronized across package, lockfile, and public metadata', () => {
  const release = assertReleaseMetadata({
    packageVersion: packageJson.version,
    lockVersion: packageLock.version,
    lockRootVersion: packageLock.packages[''].version,
    publicVersion: publicVersion.version,
    publicRelease: publicVersion.release,
  });

  assert.equal(release.version, packageJson.version);
  assert.equal(release.tag, releaseTagFor(packageJson.version));
});

test('release tags use semantic versions and reject mismatches', () => {
  assert.equal(releaseTagFor('4.0.0'), 'v4.0.0');
  assert.throws(() => releaseTagFor('version-three'), /Invalid semantic version/);
  assert.throws(
    () => assertReleaseMetadata({
      packageVersion: '4.0.0',
      lockVersion: '4.0.0',
      lockRootVersion: '4.0.0',
      publicVersion: '4.0.0',
      publicRelease: 'v4.0.0',
      releaseTag: 'v4.0.1',
    }),
    /release tag v4\.0\.1 != v4\.0\.0/,
  );
});

test('all browser cache parameters use the product release version', () => {
  const sources = {
    'public/index.html': readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'),
    'public/app.js': readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'),
    'public/local-room-client.js': readFileSync(
      new URL('../public/local-room-client.js', import.meta.url),
      'utf8',
    ),
  };

  assert.ok(assertCacheVersions(sources, packageJson.version) >= 9);
  assert.deepEqual(cacheVersionsIn('a.js?v=3.1.0 b.css?v=3.1.0'), ['3.1.0', '3.1.0']);
});

test('release check accepts the matching tag and rejects a different tag', () => {
  const root = new URL('..', import.meta.url);
  const matchingTag = releaseTagFor(packageJson.version);
  const [major, minor, patch] = packageJson.version.split('.').map(Number);
  const differentTag = `v${major}.${minor}.${patch + 1}`;
  const success = spawnSync(
    process.execPath,
    ['scripts/check-release.mjs', matchingTag],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /RELEASE_VERSION_CHECK=PASS/);

  const failure = spawnSync(
    process.execPath,
    ['scripts/check-release.mjs', differentTag],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(failure.status, 0);
  assert.ok(failure.stderr.includes(`release tag ${differentTag} != ${matchingTag}`), failure.stderr);
});

const repositoryDirectory = new URL('..', import.meta.url);
const cleanReleaseEnv = (extra = {}) => ({
  ...process.env,
  RELEASE_TAG: '',
  GITHUB_REF_TYPE: '',
  GITHUB_REF_NAME: '',
  ...extra,
});

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: repositoryDirectory, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('reports every mismatched release field at once', () => {
  assert.throws(
    () => assertReleaseMetadata({
      packageVersion: '4.1.1',
      lockVersion: '4.1.0',
      lockRootVersion: '4.0.9',
      publicVersion: '4.1.0',
      publicRelease: 'v4.1.0',
    }),
    (error) => {
      for (const fragment of [
        'package-lock version 4.1.0 != 4.1.1',
        'package-lock root version 4.0.9 != 4.1.1',
        'public version 4.1.0 != 4.1.1',
        'public release v4.1.0 != v4.1.1',
      ]) {
        assert.ok(error.message.includes(fragment), fragment);
      }
      return true;
    },
  );
});

test('cache-version checks fail when parameters are missing or disagree', () => {
  assert.throws(
    () => assertCacheVersions({ 'public/index.html': '<script src="app.js"></script>' }, '4.1.1'),
    /No browser cache-version parameters/,
  );
  assert.throws(
    () => assertCacheVersions({
      'public/index.html': '<script src="app.js?v=4.1.1"></script><link href="style.css?v=4.1.0">',
      'public/app.js': "import './i18n.js?v=4.0.0';",
    }, '4.1.1'),
    (error) => {
      assert.match(error.message, /public\/index\.html: 4\.1\.0/);
      assert.match(error.message, /public\/app\.js: 4\.0\.0/);
      assert.doesNotMatch(error.message, /: 4\.1\.1/);
      return true;
    },
  );
});

test('release checks read the tag from RELEASE_TAG or a GitHub tag ref, not branch refs', () => {
  const matchingTag = releaseTagFor(packageJson.version);
  const run = (env) => spawnSync(process.execPath, ['scripts/check-release.mjs'], {
    cwd: repositoryDirectory,
    encoding: 'utf8',
    env: cleanReleaseEnv(env),
  });

  const fromEnvironment = run({ RELEASE_TAG: matchingTag });
  assert.equal(fromEnvironment.status, 0, fromEnvironment.stderr);
  const fromTagRef = run({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.1' });
  assert.notEqual(fromTagRef.status, 0);
  assert.match(fromTagRef.stderr, /release tag v0\.0\.1 != /);
  const fromBranchRef = run({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' });
  assert.equal(fromBranchRef.status, 0, 'branch builds are not compared with a tag');
});

test('live verification accepts a deployment that serves the release version and needs a URL', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/version.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(publicVersion));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const live = await runNode('scripts/verify-live-version.mjs', cleanReleaseEnv({
      HOLO_SWEEPER_URL: `http://127.0.0.1:${port}//`,
    }));
    assert.equal(live.code, 0, live.stderr);
    assert.match(live.stdout, new RegExp(`LIVE_RELEASE_VERSION=PASS url=http://127\\.0\\.0\\.1:${port} tag=${releaseTagFor(packageJson.version)}`));
  } finally {
    server.close();
  }

  const unconfigured = await runNode('scripts/verify-live-version.mjs', cleanReleaseEnv({ HOLO_SWEEPER_URL: '' }));
  assert.notEqual(unconfigured.code, 0);
  assert.match(unconfigured.stderr, /HOLO_SWEEPER_URL is required/);
});
