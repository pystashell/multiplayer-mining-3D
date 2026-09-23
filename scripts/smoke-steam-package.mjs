import assert from 'node:assert/strict';
import {
  readFile,
  rm,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const steamRoot = resolve(root, 'dist', 'steam');
const contentRoot = resolve(steamRoot, 'content');
const manifest = JSON.parse(await readFile(join(steamRoot, 'build-manifest.json'), 'utf8'));
const executablePath = resolve(contentRoot, manifest.executable);
const resultPath = resolve(steamRoot, '.smoke-result.json');

await rm(resultPath, { force: true });

// Deliberately include legacy/preview online arguments. A production
// single-player artifact must ignore them and remain offline.
const child = spawn(executablePath, [
  '--steam-smoke-test',
  '--steam-online',
  '--connect-lobby=90000000000000000',
  '+connect_lobby',
  '90000000000000000',
], {
  cwd: contentRoot,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    HOLO_STEAM_SMOKE_RESULT: resultPath,
  },
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });

const exitCode = await new Promise((resolveExit, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error('Packaged Steam smoke test timed out after 25 seconds.'));
  }, 25000);
  child.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once('exit', (code) => {
    clearTimeout(timeout);
    resolveExit(code);
  });
});

let result;
try {
  result = JSON.parse(await readFile(resultPath, 'utf8'));
} catch (error) {
  throw new Error([
    `Packaged app exited with ${exitCode} without a readable smoke result.`,
    stdout.trim(),
    stderr.trim(),
    error.message,
  ].filter(Boolean).join('\n'));
} finally {
  await rm(resultPath, { force: true });
}

assert.equal(exitCode, 0, stderr || stdout);
assert.equal(result.pass, true, JSON.stringify(result.details));
assert.equal(result.details.networkCalls, 0);
assert.equal(result.details.runtime.capabilities.multiplayer, false);
assert.equal(result.details.runtime.capabilities.multiplayerTransport, 'none');
assert.equal(result.details.runtime.steam.reason, 'STEAM_SINGLE_PLAYER_RELEASE');
assert.equal(result.details.steamBridgeExposed, false);
assert.equal(result.details.enteredSoloGame, true);
assert.equal(result.details.localSaveInUrl, true);
assert.equal(result.details.desktopResumePersisted, true);

process.stdout.write(
  `STEAM_PACKAGED_SMOKE=PASS protocol=${result.details.protocol} offline=true save=true resume=true executable=${executablePath}\n`,
);
