import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CACHE_VERSION_FILES,
  releaseTagFor,
  repositoryRoot,
} from './release-version.mjs';

const root = repositoryRoot();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = releaseTagFor(version);

await writeFile(
  path.join(root, 'public/version.json'),
  `${JSON.stringify({
    name: 'Zero Domain Protocol: Cartography Rebuild',
    version,
    release: tag,
  }, null, 2)}\n`,
  'utf8',
);

let updatedReferences = 0;
for (const filename of CACHE_VERSION_FILES) {
  const absolutePath = path.join(root, filename);
  const source = await readFile(absolutePath, 'utf8');
  const updated = source.replace(/\?v=[0-9A-Za-z.-]+/g, () => {
    updatedReferences += 1;
    return `?v=${version}`;
  });
  await writeFile(absolutePath, updated, 'utf8');
}

console.log(
  `RELEASE_VERSION_SYNC=PASS version=${version} tag=${tag} cacheRefs=${updatedReferences}`,
);
