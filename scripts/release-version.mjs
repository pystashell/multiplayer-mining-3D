import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const CACHE_VERSION_FILES = Object.freeze([
  'public/index.html',
  'public/app.js',
  'public/local-room-client.js',
]);

export function releaseTagFor(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return `v${version}`;
}

export function assertReleaseMetadata({
  packageVersion,
  lockVersion,
  lockRootVersion,
  publicVersion,
  publicRelease,
  releaseTag = '',
}) {
  const expectedTag = releaseTagFor(packageVersion);
  const mismatches = [];

  if (lockVersion !== packageVersion) {
    mismatches.push(`package-lock version ${lockVersion} != ${packageVersion}`);
  }
  if (lockRootVersion !== packageVersion) {
    mismatches.push(`package-lock root version ${lockRootVersion} != ${packageVersion}`);
  }
  if (publicVersion !== packageVersion) {
    mismatches.push(`public version ${publicVersion} != ${packageVersion}`);
  }
  if (publicRelease !== expectedTag) {
    mismatches.push(`public release ${publicRelease} != ${expectedTag}`);
  }
  if (releaseTag && releaseTag !== expectedTag) {
    mismatches.push(`release tag ${releaseTag} != ${expectedTag}`);
  }

  if (mismatches.length) {
    throw new Error(`Release metadata mismatch:\n- ${mismatches.join('\n- ')}`);
  }

  return Object.freeze({ version: packageVersion, tag: expectedTag });
}

export function cacheVersionsIn(source) {
  return [...source.matchAll(/\?v=([0-9A-Za-z.-]+)/g)].map((match) => match[1]);
}

export function assertCacheVersions(sources, expectedVersion) {
  const mismatches = [];
  let count = 0;

  for (const [filename, source] of Object.entries(sources)) {
    const versions = cacheVersionsIn(source);
    count += versions.length;
    for (const version of versions) {
      if (version !== expectedVersion) {
        mismatches.push(`${filename}: ${version}`);
      }
    }
  }

  if (count === 0) {
    throw new Error('No browser cache-version parameters were found');
  }
  if (mismatches.length) {
    throw new Error(
      `Browser cache versions must all be ${expectedVersion}:\n- ${mismatches.join('\n- ')}`,
    );
  }
  return count;
}

export function repositoryRoot(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

export async function readReleaseMetadata(root) {
  const [packageText, lockText, publicText] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'package-lock.json'), 'utf8'),
    readFile(path.join(root, 'public/version.json'), 'utf8'),
  ]);

  const packageJson = JSON.parse(packageText);
  const packageLock = JSON.parse(lockText);
  const publicVersion = JSON.parse(publicText);

  return {
    packageJson,
    packageLock,
    publicVersion,
  };
}
