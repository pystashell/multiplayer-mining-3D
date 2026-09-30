import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  projectRoot,
  readCoverageDirectory,
  renderCoverageReport,
  summarizeCoverage,
} from './coverage-lib.mjs';

// Node's built-in --experimental-test-coverage keys results by URL, so a module
// loaded both directly and through a cache-busting `?v=` import is reported
// from whichever test process finished last. Collect raw V8 data instead and
// merge every execution of a file deterministically. Running the whole
// `npm test` script also measures the catalog, manual, vendor, and version
// gates that run before the test files.
const directory = mkdtempSync(path.join(os.tmpdir(), 'zero-domain-coverage-'));
const npmCli = process.env.npm_execpath;

try {
  const run = spawnSync(
    npmCli ? process.execPath : 'npm',
    npmCli ? [npmCli, 'test'] : ['test'],
    {
      cwd: projectRoot,
      env: { ...process.env, NODE_V8_COVERAGE: directory },
      stdio: 'inherit',
      shell: !npmCli && process.platform === 'win32',
    },
  );
  if (run.error) throw run.error;
  if (run.status !== 0) {
    console.error('\nTests failed; the coverage report was not generated.');
    process.exitCode = run.status ?? 1;
  } else {
    const rows = summarizeCoverage({ scripts: readCoverageDirectory(directory) });
    console.log(`\n${renderCoverageReport(rows)}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
