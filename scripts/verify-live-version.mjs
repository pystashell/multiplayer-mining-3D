import { setTimeout as delay } from 'node:timers/promises';
import {
  assertReleaseMetadata,
  readReleaseMetadata,
  repositoryRoot,
} from './release-version.mjs';

const baseUrl = (process.env.HOLO_SWEEPER_URL || '').replace(/\/+$/, '');
if (!baseUrl) {
  throw new Error('HOLO_SWEEPER_URL is required');
}

const root = repositoryRoot();
const { packageJson, packageLock, publicVersion } = await readReleaseMetadata(root);
const expected = assertReleaseMetadata({
  packageVersion: packageJson.version,
  lockVersion: packageLock.version,
  lockRootVersion: packageLock.packages?.['']?.version,
  publicVersion: publicVersion.version,
  publicRelease: publicVersion.release,
  releaseTag: process.env.RELEASE_TAG || '',
});

const attempts = 10;
let lastError;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(`${baseUrl}/version.json`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const live = await response.json();
    assertReleaseMetadata({
      packageVersion: expected.version,
      lockVersion: expected.version,
      lockRootVersion: expected.version,
      publicVersion: live.version,
      publicRelease: live.release,
      releaseTag: expected.tag,
    });
    console.log(`LIVE_RELEASE_VERSION=PASS url=${baseUrl} tag=${expected.tag}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < attempts) {
      await delay(3_000);
    }
  }
}

throw new Error(
  `Live deployment did not report ${expected.tag} after ${attempts} attempts: ${lastError?.message}`,
);
