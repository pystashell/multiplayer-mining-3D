import { runCoverageReport } from './coverage-lib.mjs';

// Node's built-in --experimental-test-coverage keys results by URL, so a module
// loaded both directly and through a cache-busting `?v=` import is reported
// from whichever test process finished last. runCoverageReport() collects raw
// V8 data from one complete `npm test` run (catalog, manual, vendor, and version
// gates included) and merges every execution of a file deterministically.
process.exitCode = runCoverageReport();
