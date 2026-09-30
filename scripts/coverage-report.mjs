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
// merge every execution of a file deterministically.
const directory = mkdtempSync(path.join(os.tmpdir(), 'zero-domain-coverage-'));

try {
  const run = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=dot', 'tests/*.test.js'],
    {
      cwd: projectRoot,
      env: { ...process.env, NODE_V8_COVERAGE: directory },
      stdio: 'inherit',
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
