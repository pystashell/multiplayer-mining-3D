import {
  extractFile,
  listPackage,
} from '@electron/asar';
import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINE_HIT_SOUND_PATH } from '../public/mine-hit-sound.js';

import {
  describeFiles,
  listFiles,
} from './steam-package-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const steamRoot = resolve(root, 'dist', 'steam');
const contentRoot = resolve(steamRoot, 'content');
const manifest = JSON.parse(await readFile(join(steamRoot, 'build-manifest.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const electronPackage = JSON.parse(await readFile(join(root, 'node_modules', 'electron', 'package.json'), 'utf8'));
const executablePath = join(contentRoot, manifest.executable);
const asarPath = join(contentRoot, 'resources', 'app.asar');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.appVersion, packageJson.version);
assert.equal(manifest.electronVersion, electronPackage.version);
assert.equal(manifest.contentDirectory, 'content');
assert.equal(manifest.executable, 'ZeroDomainProtocol.exe');
await readFile(executablePath);
await readFile(asarPath);

const actualFiles = await describeFiles(contentRoot);
assert.equal(actualFiles.length, manifest.fileCount);
assert.equal(
  actualFiles.reduce((sum, file) => sum + file.bytes, 0),
  manifest.totalBytes,
);
assert.deepEqual(actualFiles, manifest.files);

const outerPaths = new Set(actualFiles.map((file) => file.path.toLowerCase()));
for (const forbidden of [
  'steam_appid.txt',
  'steam_api64.dll',
  '.env',
  '.dev.vars',
  'resources/default_app.asar',
]) {
  assert.equal(outerPaths.has(forbidden), false, `Forbidden release file: ${forbidden}`);
}

const asarEntries = listPackage(asarPath, { isPack: false })
  .map((entry) => entry.replace(/^[/\\]+/, '').replaceAll('\\', '/'));
const asarEntrySet = new Set(asarEntries);
for (const required of [
  'package.json',
  'desktop/main.mjs',
  'desktop/preload.cjs',
  'desktop/runtime-state.mjs',
  'public/index.html',
  'public/app.js',
  'public/mine-hit-sound.js',
  `public/${MINE_HIT_SOUND_PATH}`,
  'public/local-room-client.js',
  'public/vendor/game-core/room-engine.js',
]) {
  assert.equal(asarEntrySet.has(required), true, `Missing packaged app file: ${required}`);
}
// Every shipped browser asset must be byte-identical to the shared web source.
const sharedFiles = (await listFiles(join(root, 'public')))
  .filter((path) => !['_headers', 'steam-room-client.js'].includes(path))
  .map((path) => `public/${path}`);
for (const sharedFile of sharedFiles) {
  assert.equal(asarEntrySet.has(sharedFile), true, `Missing web source file: ${sharedFile}`);
  assert.deepEqual(
    extractFile(asarPath, join(...sharedFile.split('/'))),
    await readFile(join(root, sharedFile)),
    `Packaged browser asset differs from web source: ${sharedFile}`,
  );
}
for (const forbiddenPrefix of [
  'worker/',
  'tests/',
  'scripts/',
  'config/',
  '.git/',
  'desktop/steam/',
  'public/steam-room-client.js',
  'public/_headers',
  'node_modules/',
]) {
  assert.equal(
    asarEntries.some((entry) => entry.startsWith(forbiddenPrefix)),
    false,
    `Server/development source leaked into app.asar: ${forbiddenPrefix}`,
  );
}
const packagedPackageJson = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
assert.equal(packagedPackageJson.version, packageJson.version);
assert.equal(packagedPackageJson.main, 'desktop/main.mjs');
assert.deepEqual(packagedPackageJson.dependencies, {});
assert.equal(manifest.releaseProfile, 'steam-single-player');
assert.equal(manifest.multiplayerEnabled, false);
assert.equal(manifest.networkAccessPolicy, 'blocked');

process.stdout.write([
  'STEAM_PACKAGE_VERIFY=PASS',
  `version=${manifest.appVersion}`,
  `electron=${manifest.electronVersion}`,
  `arch=${manifest.arch}`,
  `files=${manifest.fileCount}`,
  `bytes=${manifest.totalBytes}`,
  `icon=${manifest.customIcon ? 'custom' : 'default-preview'}`,
  `sharedWebFiles=${sharedFiles.length}`,
].join(' ') + '\n');
