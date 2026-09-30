// Starts the real Worker under `wrangler dev --local` (workerd, Durable
// Objects, alarms, hibernatable WebSockets, Workers Static Assets) on free
// ports with a throwaway state directory. The in-memory stand-ins in
// workers-runtime.js cannot tell whether a Wrangler or workerd upgrade changed
// runtime behaviour; tests built on this helper can.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Wrangler runs workerd as a child process; stopping only the Node parent
// would leave workerd holding the port, so end the whole process tree.
function stopProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, 5_000).unref();
  }
  return Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

// Windows keeps workerd's files locked for a moment after the process ends.
async function removeStateDirectory(directory) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  process.emitWarning(`Could not remove the wrangler dev state directory ${directory}`);
}

async function waitForPortToClose(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function startWranglerDev({ timeoutMs = 120_000 } = {}) {
  const [port, inspectorPort] = [await freePort(), await freePort()];
  const persistTo = mkdtempSync(path.join(tmpdir(), 'holo-sweeper-wrangler-'));
  const child = spawn(process.execPath, [
    WRANGLER_BIN,
    'dev',
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(port),
    '--inspector-port', String(inspectorPort),
    '--persist-to', persistTo,
    '--show-interactive-dev-session=false',
    '--log-level', 'warn',
  ], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  const record = (chunk) => { output += chunk; };
  child.stdout.setEncoding('utf8').on('data', record);
  child.stderr.setEncoding('utf8').on('data', record);

  const url = `http://127.0.0.1:${port}`;
  const close = async () => {
    await stopProcessTree(child);
    await waitForPortToClose(url);
    await removeStateDirectory(persistTo);
  };
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (child.exitCode !== null) throw new Error(`wrangler dev exited with ${child.exitCode}`);
      try {
        const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) });
        if (response.ok) break;
      } catch {}
      if (Date.now() > deadline) throw new Error('wrangler dev did not become ready');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch (error) {
    await close();
    throw new Error(`${error.message}\n${output}`);
  }
  return { url, output: () => output, close };
}
