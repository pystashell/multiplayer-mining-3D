import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

  assert.equal(release.version, '3.2.0');
  assert.equal(release.tag, 'v3.2.0');
});

test('release tags use semantic versions and reject mismatches', () => {
  assert.equal(releaseTagFor('3.2.0'), 'v3.2.0');
  assert.throws(() => releaseTagFor('version-three'), /Invalid semantic version/);
  assert.throws(
    () => assertReleaseMetadata({
      packageVersion: '3.2.0',
      lockVersion: '3.2.0',
      lockRootVersion: '3.2.0',
      publicVersion: '3.2.0',
      publicRelease: 'v3.2.0',
      releaseTag: 'v3.3.0',
    }),
    /release tag v3\.3\.0 != v3\.2\.0/,
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
  const success = spawnSync(
    process.execPath,
    ['scripts/check-release.mjs', 'v3.2.0'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /RELEASE_VERSION_CHECK=PASS/);

  const failure = spawnSync(
    process.execPath,
    ['scripts/check-release.mjs', 'v3.3.0'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /release tag v3\.3\.0 != v3\.2\.0/);
});
