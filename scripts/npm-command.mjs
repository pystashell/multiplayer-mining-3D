import { existsSync } from 'node:fs';
import path from 'node:path';

// Runs npm without a shell: the npm CLI that started this process when run
// through npm, otherwise the copy bundled with this Node installation. A shell
// is only a last resort because it joins arguments without quoting them.
export function npmCommand(env = process.env, execPath = process.execPath) {
  const cli = [
    env.npm_execpath,
    path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((candidate) => candidate && /\.[cm]?js$/.test(candidate) && existsSync(candidate));
  return cli
    ? { command: execPath, args: [cli], shell: false }
    : { command: 'npm', args: [], shell: process.platform === 'win32' };
}
