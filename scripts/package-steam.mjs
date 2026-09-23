import { packager } from '@electron/packager';
import {
  access,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPathInside,
  describeFiles,
} from './steam-package-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(root, 'dist');
const steamRoot = assertPathInside(distRoot, join(distRoot, 'steam'), 'Steam output root');
const stageRoot = assertPathInside(steamRoot, join(steamRoot, '.stage'), 'Steam staging directory');
const packagerRoot = assertPathInside(steamRoot, join(steamRoot, '.packager'), 'Electron Packager output');
const contentRoot = assertPathInside(steamRoot, join(steamRoot, 'content'), 'Steam content directory');
const manifestPath = assertPathInside(steamRoot, join(steamRoot, 'build-manifest.json'), 'Steam build manifest');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const electronPackage = JSON.parse(await readFile(join(root, 'node_modules', 'electron', 'package.json'), 'utf8'));
const arch = process.env.STEAM_ARCH || 'x64';
const executableName = 'ZeroDomainProtocol';
const productName = 'Zero Domain Protocol: Sector Purge';
const iconPath = join(root, 'steam', 'assets', 'app-icon.ico');
const electronZipName = `electron-v${electronPackage.version}-win32-${arch}.zip`;

if (!['x64', 'arm64'].includes(arch)) {
  throw new Error(`STEAM_ARCH must be x64 or arm64, received ${arch}.`);
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function findLocalElectronZipDir() {
  if (process.env.ELECTRON_ZIP_DIR) {
    const explicit = resolve(process.env.ELECTRON_ZIP_DIR);
    if (!await exists(join(explicit, electronZipName))) {
      throw new Error(`ELECTRON_ZIP_DIR does not contain ${electronZipName}.`);
    }
    return explicit;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return '';
  const cacheRoot = join(localAppData, 'electron', 'Cache');
  let entries;
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(cacheRoot, entry.name);
    if (await exists(join(candidate, electronZipName))) return candidate;
  }
  return '';
}

async function prepareStage() {
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await cp(join(root, 'public'), join(stageRoot, 'public'), { recursive: true });
  await cp(join(root, 'desktop'), join(stageRoot, 'desktop'), { recursive: true });
  // Keep future Steam networking prototypes in the source tree without
  // allowing them into the current single-player release artifact.
  await rm(join(stageRoot, 'desktop', 'steam'), { recursive: true, force: true });
  await rm(join(stageRoot, 'public', 'steam-room-client.js'), { force: true });
  await rm(join(stageRoot, 'public', '_headers'), { force: true });
  await copyFile(
    join(root, 'steam', 'THIRD_PARTY_NOTICES.md'),
    join(stageRoot, 'THIRD_PARTY_NOTICES.md'),
  );
  await writeFile(join(stageRoot, 'package.json'), `${JSON.stringify({
    name: 'zero-domain-protocol',
    productName,
    version: packageJson.version,
    description: 'A local-first 3D minesweeper campaign and free-play game.',
    private: true,
    main: 'desktop/main.mjs',
    type: 'module',
    license: packageJson.license,
    dependencies: {},
  }, null, 2)}\n`, 'utf8');
}

async function writeBuildManifest(customIcon) {
  const files = await describeFiles(contentRoot);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const manifest = {
    schemaVersion: 1,
    productName,
    appVersion: packageJson.version,
    electronVersion: electronPackage.version,
    platform: 'win32',
    arch,
    executable: `${executableName}.exe`,
    contentDirectory: 'content',
    customIcon,
    sourceRevision: process.env.GITHUB_SHA || process.env.STEAM_SOURCE_REVISION || null,
    releaseProfile: 'steam-single-player',
    multiplayerEnabled: false,
    networkAccessPolicy: 'blocked',
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes,
    files,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

await mkdir(steamRoot, { recursive: true });
await rm(packagerRoot, { recursive: true, force: true });
await rm(contentRoot, { recursive: true, force: true });
await rm(manifestPath, { force: true });

try {
  await prepareStage();
  const customIcon = await exists(iconPath);
  const electronZipDir = await findLocalElectronZipDir();
  const outputPaths = await packager({
    dir: stageRoot,
    out: packagerRoot,
    name: executableName,
    executableName,
    platform: 'win32',
    arch,
    electronVersion: electronPackage.version,
    ...(electronZipDir ? { electronZipDir } : {}),
    appVersion: packageJson.version,
    buildVersion: packageJson.version,
    asar: true,
    overwrite: true,
    prune: false,
    ...(customIcon ? { icon: iconPath } : {}),
    win32metadata: {
      CompanyName: process.env.STEAM_COMPANY_NAME || 'Pystashell',
      FileDescription: productName,
      ProductName: productName,
      InternalName: executableName,
      OriginalFilename: `${executableName}.exe`,
      'requested-execution-level': 'asInvoker',
    },
  });

  if (outputPaths.length !== 1) {
    throw new Error(`Expected one packaged directory, received ${outputPaths.length}.`);
  }

  await rename(outputPaths[0], contentRoot);
  const manifest = await writeBuildManifest(customIcon);
  process.stdout.write([
    'STEAM_PACKAGE=PASS',
    `version=${manifest.appVersion}`,
    `electron=${manifest.electronVersion}`,
    `arch=${manifest.arch}`,
    `files=${manifest.fileCount}`,
    `bytes=${manifest.totalBytes}`,
    `icon=${manifest.customIcon ? 'custom' : 'default-preview'}`,
    `content=${contentRoot}`,
  ].join(' ') + '\n');
} finally {
  await rm(stageRoot, { recursive: true, force: true });
  await rm(packagerRoot, { recursive: true, force: true });
}
