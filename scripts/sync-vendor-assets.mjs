import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const packages = Object.freeze({
  three: Object.freeze({ name: 'three', version: '0.150.0', license: 'MIT' }),
  orbitron: Object.freeze({ name: '@fontsource/orbitron', version: '5.2.8', license: 'OFL-1.1' }),
  shareTechMono: Object.freeze({ name: '@fontsource/share-tech-mono', version: '5.2.7', license: 'OFL-1.1' }),
  inter: Object.freeze({ name: '@fontsource/inter', version: '5.2.8', license: 'OFL-1.1' }),
});

const manifestDestination = 'public/vendor/manifest.json';

const outputs = [
  {
    source: 'worker/room-engine.js',
    destination: 'public/vendor/game-core/room-engine.js',
  },
  {
    source: 'worker/beginner-layout.js',
    destination: 'public/vendor/game-core/beginner-layout.js',
    transform(content) {
      const source = content.toString('utf8');
      const workerImport = '"../public/minesweeper-solver.js"';
      const matches = source.split(workerImport).length - 1;
      if (matches !== 1) {
        throw new Error(`Expected one worker solver import in beginner layout, found ${matches}.`);
      }
      return Buffer.from(source.replace(workerImport, '"../../minesweeper-solver.js"'));
    },
  },
  {
    source: 'node_modules/three/build/three.module.js',
    destination: 'public/vendor/three-0.150.0/build/three.module.js',
  },
  {
    source: 'node_modules/three/examples/jsm/controls/OrbitControls.js',
    destination: 'public/vendor/three-0.150.0/examples/jsm/controls/OrbitControls.js',
    transform(content) {
      const source = content.toString('utf8');
      const importPattern = /from 'three';/g;
      const matches = source.match(importPattern) ?? [];
      if (matches.length !== 1) {
        throw new Error(`Expected one bare Three.js import in OrbitControls, found ${matches.length}.`);
      }
      return Buffer.from(source.replace(importPattern, "from '../../../build/three.module.js';"));
    },
  },
  {
    source: 'node_modules/three/LICENSE',
    destination: 'public/vendor/three-0.150.0/LICENSE',
  },
  ...fontOutputs('orbitron', packages.orbitron, [800, 900]),
  ...fontOutputs('share-tech-mono', packages.shareTechMono, [400]),
  ...fontOutputs('inter', packages.inter, [400, 600, 700, 800]),
];

function fontOutputs(slug, metadata, weights) {
  const packageDirectory = metadata.name;
  return [
    ...weights.map((weight) => ({
      source: `node_modules/${packageDirectory}/files/${slug}-latin-${weight}-normal.woff2`,
      destination: `public/vendor/fonts/${slug}-${metadata.version}/${slug}-latin-${weight}-normal.woff2`,
    })),
    {
      source: `node_modules/${packageDirectory}/LICENSE`,
      destination: `public/vendor/fonts/${slug}-${metadata.version}/LICENSE`,
    },
  ];
}

function manifestContent() {
  return Buffer.from(`${JSON.stringify({
    generatedBy: 'npm run vendor:sync',
    packages,
    files: outputs.map(({ destination }) => destination.replace(/^public\//, '')),
  }, null, 2)}\n`);
}

async function assertPackageVersions() {
  for (const metadata of Object.values(packages)) {
    const packageJsonPath = join(root, 'node_modules', metadata.name, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    if (packageJson.version !== metadata.version || packageJson.license !== metadata.license) {
      throw new Error(
        `${metadata.name} must be ${metadata.version} (${metadata.license}); found ${packageJson.version} (${packageJson.license}).`,
      );
    }
  }
}

async function expectedContent(output) {
  const content = await readFile(join(root, output.source));
  return output.transform ? output.transform(content) : content;
}

async function sync() {
  const publicDirectory = resolve(root, 'public');
  const vendorDirectory = resolve(publicDirectory, 'vendor');
  if (!vendorDirectory.startsWith(`${publicDirectory}${sep}`)) {
    throw new Error(`Refusing to clean vendor directory outside public/: ${vendorDirectory}`);
  }
  await rm(vendorDirectory, { recursive: true, force: true });

  for (const output of outputs) {
    const destination = join(root, output.destination);
    await mkdir(dirname(destination), { recursive: true });
    if (output.transform) {
      await writeFile(destination, await expectedContent(output));
    } else {
      await copyFile(join(root, output.source), destination);
    }
  }

  await writeFile(join(root, manifestDestination), manifestContent());
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'));
  }
  return files;
}

async function verify() {
  let totalBytes = 0;
  for (const output of outputs) {
    const expected = await expectedContent(output);
    const destination = join(root, output.destination);
    let actual;
    try {
      actual = await readFile(destination);
    } catch {
      throw new Error(`Missing generated vendor file: ${relative(root, destination)}`);
    }

    const expectedHash = createHash('sha256').update(expected).digest('hex');
    const actualHash = createHash('sha256').update(actual).digest('hex');
    if (expectedHash !== actualHash) {
      throw new Error(`Vendor file is stale or modified: ${relative(root, destination)}`);
    }
    totalBytes += (await stat(destination)).size;
  }

  const expectedManifest = manifestContent();
  const actualManifest = await readFile(join(root, manifestDestination));
  if (!actualManifest.equals(expectedManifest)) {
    throw new Error(`Vendor manifest is stale or modified: ${manifestDestination}`);
  }
  totalBytes += actualManifest.length;

  const expectedFiles = new Set([
    ...outputs.map(({ destination }) => destination),
    manifestDestination,
  ]);
  const unexpectedFiles = (await listFiles(join(root, 'public/vendor')))
    .filter((path) => !expectedFiles.has(path));
  if (unexpectedFiles.length > 0) {
    throw new Error(`Unexpected files in generated vendor directory: ${unexpectedFiles.join(', ')}`);
  }
  return totalBytes;
}

await assertPackageVersions();
if (!checkOnly) await sync();
const totalBytes = await verify();
console.log(`${checkOnly ? 'Verified' : 'Synced'} ${outputs.length + 1} vendor files (${totalBytes.toLocaleString('en-US')} bytes).`);
