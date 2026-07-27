import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CACHE_VERSION_FILES,
  assertCacheVersions,
  assertReleaseMetadata,
  readReleaseMetadata,
  repositoryRoot,
} from './release-version.mjs';

const root = repositoryRoot();
const { packageJson, packageLock, publicVersion } = await readReleaseMetadata(root);
const releaseTag = process.argv[2]
  || process.env.RELEASE_TAG
  || (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '');

const result = assertReleaseMetadata({
  packageVersion: packageJson.version,
  lockVersion: packageLock.version,
  lockRootVersion: packageLock.packages?.['']?.version,
  publicVersion: publicVersion.version,
  publicRelease: publicVersion.release,
  releaseTag,
});

const sources = Object.fromEntries(
  await Promise.all(CACHE_VERSION_FILES.map(async (filename) => [
    filename,
    await readFile(path.join(root, filename), 'utf8'),
  ])),
);
const cacheReferenceCount = assertCacheVersions(sources, result.version);

console.log(
  `RELEASE_VERSION_CHECK=PASS version=${result.version} tag=${result.tag} cacheRefs=${cacheReferenceCount}`,
);
