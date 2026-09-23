import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRuntimeProfile } from '../public/runtime-profile.js';
import {
  DESKTOP_APP_URL,
  desktopUrlForSoloSave,
  isTrustedDesktopUrl,
  normalizeSoloSaveId,
  soloSaveIdFromDesktopUrl,
} from '../desktop/runtime-state.mjs';
import {
  normalizeSteamId,
  renderSteamPipeConfigs,
} from '../scripts/generate-steampipe-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (filename) => readFileSync(join(root, filename), 'utf8');

test('runtime profiles keep web multiplayer separate from the locked Steam single-player release', () => {
  assert.deepEqual(resolveRuntimeProfile(null), {
    distribution: 'web',
    multiplayerEnabled: true,
    steamworksEnabled: false,
    multiplayerTransport: 'web',
  });
  assert.deepEqual(resolveRuntimeProfile({
    distribution: 'steam',
    capabilities: { multiplayer: false, steamworks: false },
  }), {
    distribution: 'steam',
    multiplayerEnabled: false,
    steamworksEnabled: false,
    multiplayerTransport: 'none',
  });
  assert.equal(Object.isFrozen(resolveRuntimeProfile()), true);
});

test('desktop resume URLs persist only canonical local solo save identifiers', () => {
  const saveId = '8f53e09a-4c3d-4d89-8a75-0bfca92f1097';
  assert.equal(normalizeSoloSaveId(saveId.toUpperCase()), saveId);
  assert.equal(normalizeSoloSaveId('../room'), '');
  assert.equal(desktopUrlForSoloSave('invalid'), DESKTOP_APP_URL);
  assert.equal(desktopUrlForSoloSave(saveId), `${DESKTOP_APP_URL}?solo=${saveId}`);
  assert.equal(soloSaveIdFromDesktopUrl(`${DESKTOP_APP_URL}?solo=${saveId}&room=ABC234`), saveId);
  assert.equal(soloSaveIdFromDesktopUrl(`https://example.com/?solo=${saveId}`), '');
  assert.equal(isTrustedDesktopUrl(`${DESKTOP_APP_URL}?solo=${saveId}`), true);
  assert.equal(isTrustedDesktopUrl('holo://game.example/index.html'), false);
});

test('SteamPipe configuration defaults to preview and maps the verified content directory recursively', () => {
  const contentRoot = resolve(root, 'dist', 'steam', 'content');
  const buildOutput = resolve(root, 'dist', 'steam', 'steampipe-output');
  const preview = renderSteamPipeConfigs({
    appId: '1000',
    depotId: '1001',
    contentRoot,
    buildOutput,
    description: 'Preview build',
  });
  assert.match(preview.app, /"AppID" "1000"/);
  assert.match(preview.app, /"Preview" "1"/);
  assert.match(preview.app, /"1001" "depot_build_1001\.vdf"/);
  assert.match(preview.depot, /"LocalPath" "\*"/);
  assert.match(preview.depot, /"recursive" "1"/);
  assert.match(preview.depot, /"FileExclusion" "steam_appid\.txt"/);

  const upload = renderSteamPipeConfigs({
    appId: '1000',
    depotId: '1001',
    contentRoot,
    buildOutput,
    description: 'Upload build',
    upload: true,
  });
  assert.match(upload.app, /"Preview" "0"/);
  assert.throws(() => normalizeSteamId('YOUR_APP_ID', 'App ID'), /positive numeric Steam ID/);
});

test('desktop shell and package scripts enforce an offline-only Steam release boundary', () => {
  const main = source('desktop/main.mjs');
  const preload = source('desktop/preload.cjs');
  const app = source('public/app.js');
  const index = source('public/index.html');
  const packager = source('scripts/package-steam.mjs');
  const verifier = source('scripts/verify-steam-package.mjs');
  const smoke = source('scripts/smoke-steam-package.mjs');
  const workflow = source('.github/workflows/steam-build.yml');
  const packageJson = JSON.parse(source('package.json'));

  assert.match(main, /protocol\.registerSchemesAsPrivileged/);
  assert.match(main, /protocol\.handle\(APP_SCHEME, servePackagedFile\)/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /frame:\s*false/);
  assert.match(main, /fullscreen:\s*!smokeTest/);
  assert.doesNotMatch(main, /input\.key === 'Escape' && window\.isFullScreen\(\)/);
  assert.match(main, /webRequest\.onBeforeRequest/);
  assert.match(main, /callback\(\{ cancel: !allowed \}\)/);
  assert.match(main, /details\.desktopResumePersisted/);
  assert.doesNotMatch(main, /nodeIntegration:\s*true|webSecurity:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('holoRuntime'/);
  assert.match(preload, /ipcRenderer\.invoke\('holo:desktop:quit'\)/);
  assert.match(main, /ipcMain\.handle\('holo:desktop:quit'/);
  assert.match(preload, /multiplayer:\s*false/);
  assert.match(main, /STEAM_SINGLE_PLAYER_RELEASE/);
  assert.doesNotMatch(preload, /holoSteamMultiplayer|holo:steam:/);
  assert.doesNotMatch(main, /SteamOnlineService|initializeSteamworksAdapter|holo:steam:|connect_lobby/);

  assert.match(app, /resolveRuntimeProfile/);
  assert.match(app, /multiplayerButton\.hidden = true/);
  assert.match(app, /mode === 'squad' && !this\.runtimeProfile\.multiplayerEnabled/);
  assert.match(preload, /installDesktopExitControls/);
  assert.match(preload, /createExitButton\('btn-exit-game'\)/);
  assert.match(preload, /createExitButton\('btn-exit-game-lobby'/);
  assert.doesNotMatch(app, /holoDesktop|btn-exit-game|desktop\.exit/);
  assert.doesNotMatch(index, /btn-exit-game|desktop-exit-button|desktop\.exit/);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /object-src 'none'/);

  assert.match(packager, /cp\(join\(root, 'public'\)/);
  assert.match(packager, /cp\(join\(root, 'desktop'\)/);
  assert.match(packager, /rm\(join\(stageRoot, 'desktop', 'steam'\)/);
  assert.match(packager, /rm\(join\(stageRoot, 'public', 'steam-room-client\.js'\)/);
  assert.match(packager, /rm\(join\(stageRoot, 'public', '_headers'\)/);
  assert.match(packager, /releaseProfile:\s*'steam-single-player'/);
  assert.match(packager, /networkAccessPolicy:\s*'blocked'/);
  assert.doesNotMatch(packager, /steam_api64\.dll|steamworksSource/);
  assert.match(verifier, /Server\/development source leaked into app\.asar/);
  assert.match(verifier, /steam_appid\.txt/);
  assert.match(verifier, /desktop\/steam\//);
  assert.match(verifier, /public\/steam-room-client\.js/);
  assert.match(verifier, /manifest\.multiplayerEnabled, false/);
  assert.match(smoke, /--steam-online/);
  assert.match(smoke, /steamBridgeExposed, false/);
  assert.match(main, /desktopExitButtonsVisible/);
  assert.match(workflow, /npm run steam:build/);
  assert.match(workflow, /dist\/steam\/content/);

  assert.equal(packageJson.main, 'desktop/main.mjs');
  assert.equal(
    packageJson.scripts['steam:build'],
    'npm run steam:package && npm run steam:verify && npm run steam:smoke',
  );
  assert.equal(
    packageJson.scripts['steam:from-web'],
    'npm run version && npm run vendor:sync && npm run steam:build',
  );
  assert.equal(packageJson.devDependencies.electron.startsWith('^'), false);
  assert.equal(packageJson.devDependencies['@electron/packager'].startsWith('^'), false);
  assert.equal(packageJson.devDependencies['steamworks.js'], undefined);
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(
    Object.keys(packageJson.scripts).some((name) => name.startsWith('steam:online:')),
    false,
  );
});
