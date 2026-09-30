import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  COVERAGE_ALIASES,
  collectSourceFiles,
  countableLines,
  executedLines,
  formatLineRanges,
  groupForFile,
  mergeExecutedLines,
  projectFileFromCoverageUrl,
  readCoverageDirectory,
  renderCoverageReport,
  runCoverageReport,
  summarizeCoverage,
  totalsFor,
} from '../scripts/coverage-lib.mjs';

const FIXTURE_GROUPS = Object.freeze([
  { id: 'fixture', label: 'Fixture runtime', root: 'src', extensions: ['.mjs'], excludePrefixes: ['src/vendor/'], runtime: true },
  { id: 'tools', label: 'Fixture tooling', root: 'tools', extensions: ['.mjs'], excludePrefixes: [], runtime: false },
]);

function withTempProject(files, callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'coverage-fixture-'));
  try {
    for (const [file, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), source);
    }
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('counts only executable lines and ignores blank and comment-only lines', () => {
  const source = [
    'const a = 1;',
    '',
    '// line comment',
    '/* block',
    '   still comment */',
    '/* inline */ const b = 2;',
    '   ',
    '/** one-line doc */',
    'const c = 3; // trailing',
  ].join('\n');
  assert.deepEqual(countableLines(source), [true, false, false, false, false, true, false, false, true]);
});

test('applies nested V8 block ranges so inner counts override their parent', () => {
  const source = [
    'function used(flag) {',
    '  if (flag) {',
    '    return 1;',
    '  }',
    '  return 0;',
    '}',
    '',
    'function unused() {',
    '  return 2;',
    '}',
  ].join('\n');
  const at = (text) => source.indexOf(text);
  const functions = [
    { ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] },
    {
      ranges: [
        { startOffset: at('function used'), endOffset: at('function unused') - 2, count: 1 },
        { startOffset: at('{\n    return 1'), endOffset: at('  return 0'), count: 0 },
      ],
    },
    { ranges: [{ startOffset: at('function unused'), endOffset: source.length, count: 0 }] },
  ];
  assert.deepEqual(
    executedLines(source, functions),
    [true, true, false, false, true, true, null, false, false, false],
  );
});

test('merges executions line by line so any run that executed a line covers it', () => {
  assert.deepEqual(mergeExecutedLines(null, [true, false, null]), [true, false, null]);
  assert.deepEqual(mergeExecutedLines([true, false, null, false], [false, true, true, false]), [true, true, null, false]);
});

test('maps coverage URLs to project files without cache-busting queries', () => {
  const root = path.join(os.tmpdir(), 'project-root');
  const url = (relative) => pathToFileURL(path.join(root, relative)).href;
  assert.equal(projectFileFromCoverageUrl(`${url('public/room-client.js')}?v=4.1.1`, root), 'public/room-client.js');
  assert.equal(projectFileFromCoverageUrl(`${url('worker/index.js')}#fragment`, root), 'worker/index.js');
  assert.equal(projectFileFromCoverageUrl(pathToFileURL(path.join(os.tmpdir(), 'elsewhere.js')).href, root), null);
  assert.equal(projectFileFromCoverageUrl('node:internal/test_runner/runner', root), null);
});

test('assigns files to report groups and skips generated vendor copies', () => {
  assert.equal(groupForFile('src/app.mjs', FIXTURE_GROUPS).id, 'fixture');
  assert.equal(groupForFile('tools/build.mjs', FIXTURE_GROUPS).id, 'tools');
  assert.equal(groupForFile('src/vendor/lib.mjs', FIXTURE_GROUPS), null);
  assert.equal(groupForFile('src/readme.md', FIXTURE_GROUPS), null);
  assert.equal(COVERAGE_ALIASES['public/vendor/game-core/room-engine.js'], 'worker/room-engine.js');

  withTempProject({
    'src/a.mjs': 'export const a = 1;\n',
    'src/nested/b.mjs': 'export const b = 2;\n',
    'src/vendor/c.mjs': 'export const c = 3;\n',
    'tools/d.mjs': 'export const d = 4;\n',
  }, (root) => {
    assert.deepEqual(
      collectSourceFiles({ root, groups: FIXTURE_GROUPS }),
      ['src/a.mjs', 'src/nested/b.mjs', 'tools/d.mjs'],
    );
    assert.deepEqual(collectSourceFiles({ root, groups: [{ ...FIXTURE_GROUPS[0], root: 'missing' }] }), []);
  });
});

test('reports never-loaded files as uncovered and merges aliased copies by line', () => {
  const sources = {
    'src/engine.mjs': 'export const a = 1;\nexport function b() {\n  return 2;\n}\n',
    'src/vendor/engine.mjs': 'export const a = 1;\nexport function b() {\n  return 2;\n}\n',
    'src/skewed.mjs': 'export const x = 1;\n',
    'src/idle.mjs': 'export const idle = true;\n// nothing else\n',
  };
  const readSource = (file) => sources[file];
  const root = path.join(os.tmpdir(), 'alias-project');
  const url = (file) => pathToFileURL(path.join(root, file)).href;
  const whole = (file) => ({ startOffset: 0, endOffset: sources[file].length, count: 1 });
  const scripts = [
    // The vendored copy ran b(); its executions count toward the source file.
    {
      url: url('src/vendor/engine.mjs'),
      functions: [{ ranges: [whole('src/vendor/engine.mjs')] }, { ranges: [{ startOffset: 20, endOffset: 55, count: 1 }] }],
    },
    // A copy whose line layout differs is ignored rather than misattributed.
    { url: url('src/vendor/skewed.mjs'), functions: [{ ranges: [{ startOffset: 0, endOffset: 5, count: 1 }] }] },
  ];
  const rows = summarizeCoverage({
    scripts,
    sourceFiles: ['src/engine.mjs', 'src/skewed.mjs', 'src/idle.mjs'],
    root,
    readSource: (file) => (file === 'src/vendor/skewed.mjs' ? 'a\nb\nc\n' : readSource(file)),
    groups: FIXTURE_GROUPS,
    aliases: { 'src/vendor/engine.mjs': 'src/engine.mjs', 'src/vendor/skewed.mjs': 'src/skewed.mjs' },
  });

  assert.deepEqual(rows.map(({ file, loaded, covered, total }) => ({ file, loaded, covered, total })), [
    { file: 'src/engine.mjs', loaded: true, covered: 4, total: 4 },
    { file: 'src/skewed.mjs', loaded: false, covered: 0, total: 1 },
    { file: 'src/idle.mjs', loaded: false, covered: 0, total: 1 },
  ]);
  assert.deepEqual(rows[2].uncovered, [1]);
});

test('formats uncovered line ranges and renders runtime and tooling totals separately', () => {
  assert.equal(formatLineRanges([1, 2, 3, 7, 9, 10]), '1-3 7 9-10');
  assert.equal(formatLineRanges([]), '');
  const rows = [
    { file: 'src/app.mjs', group: 'fixture', loaded: false, total: 10, covered: 0, uncovered: [1, 2] },
    { file: 'src/core.mjs', group: 'fixture', loaded: true, total: 10, covered: 9, uncovered: [4] },
    { file: 'tools/build.mjs', group: 'tools', loaded: true, total: 5, covered: 5, uncovered: [] },
  ];
  const totals = totalsFor(rows);
  assert.deepEqual([totals.total, totals.covered], [25, 14]);
  assert.ok(Math.abs(totals.percent - 56) < 1e-9);
  assert.equal(totalsFor([]).percent, 100);

  const report = renderCoverageReport(rows, { groups: FIXTURE_GROUPS });
  assert.match(report, /## Fixture runtime/);
  assert.match(report, /src\/app\.mjs\s+0\.0%\s+0\/10\s+never loaded by any test/);
  assert.match(report, /src\/core\.mjs\s+90\.0%\s+9\/10\s+4/);
  assert.match(report, /runtime code, all files\s+45\.0%\s+9\/20/);
  assert.match(report, /runtime code, loaded files only\s+90\.0%\s+9\/10/);
  assert.match(report, /all reported files\s+56\.0%\s+14\/25/);

  const long = renderCoverageReport(
    [{ ...rows[1], uncovered: Array.from({ length: 60 }, (_, index) => index * 2) }],
    { groups: FIXTURE_GROUPS, maxUncovered: 20 },
  );
  assert.match(long, /…/);
});

test('merges real V8 coverage from a module imported under two cache-busting URLs', () => {
  withTempProject({
    'src/lib.mjs': [
      'export function pick(flag) {',
      '  if (flag) {',
      "    return 'yes';",
      '  }',
      "  return 'no';",
      '}',
      '',
      'export function unused() {',
      '  return 42;',
      '}',
      '',
    ].join('\n'),
    'src/main.mjs': [
      "import { pick } from './lib.mjs';",
      "import { pick as pickAgain } from './lib.mjs?v=2';",
      'pick(false);',
      'pickAgain(true);',
      '',
    ].join('\n'),
  }, (root) => {
    const coverageDirectory = path.join(root, 'v8');
    const run = spawnSync(process.execPath, [path.join(root, 'src', 'main.mjs')], {
      env: { ...process.env, NODE_V8_COVERAGE: coverageDirectory },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);

    const scripts = readCoverageDirectory(coverageDirectory);
    const libRuns = scripts.filter((script) => script.url.includes('lib.mjs'));
    assert.equal(libRuns.length, 2, 'V8 reports each URL as a separate script');
    const source = readFileSync(path.join(root, 'src', 'lib.mjs'), 'utf8');
    const plain = executedLines(source, libRuns.find((script) => !script.url.includes('?')).functions);
    const busted = executedLines(source, libRuns.find((script) => script.url.includes('?v=2')).functions);
    assert.equal(plain[2], false, 'the plain URL alone never returned "yes"');
    assert.equal(busted[4], false, 'the ?v=2 URL alone never returned "no"');

    const [lib] = summarizeCoverage({ scripts, sourceFiles: ['src/lib.mjs'], root, groups: FIXTURE_GROUPS });
    assert.equal(lib.loaded, true);
    // Each URL alone leaves one branch of pick() unexecuted; merged, only the
    // body of unused() remains. Its `export function` line runs at module
    // evaluation (V8's zero range starts at `function`), as in c8.
    assert.deepEqual(lib.uncovered, [9, 10], 'only unused() stays uncovered once both runs are merged');
  });
});

// A throwaway project whose `npm test` covers part of src/lib.mjs.
function coverageProject(testScript = 'node src/main.mjs') {
  return {
    'package.json': JSON.stringify({ name: 'coverage-probe', private: true, scripts: { test: testScript } }),
    'src/lib.mjs': 'export function used() {\n  return 1;\n}\n\nexport function unused() {\n  return 2;\n}\n',
    'src/main.mjs': "import { used } from './lib.mjs';\nused();\n",
    'src/idle.mjs': 'export const idle = true;\n',
  };
}

function runProbe(root, extraEnv = {}) {
  const logs = [];
  const warnings = [];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(npm_|GITHUB_STEP_SUMMARY$)/i.test(key)));
  const code = runCoverageReport({
    root,
    env: { ...env, ...extraEnv },
    groups: FIXTURE_GROUPS,
    aliases: {},
    stdio: 'ignore',
    log: (message) => logs.push(message),
    warn: (message) => warnings.push(message),
  });
  return { code, output: logs.join('\n'), warnings: warnings.join('\n') };
}

test('the coverage run reports after passing tests and appends the report to the CI job summary', () => {
  withTempProject(coverageProject(), (root) => {
    const summary = path.join(root, 'step-summary.md');
    const { code, output, warnings } = runProbe(root, { GITHUB_STEP_SUMMARY: summary });
    assert.equal(code, 0, warnings);
    assert.match(output, /src\/lib\.mjs\s+\d+\.\d%/);
    assert.match(output, /src\/idle\.mjs\s+0\.0%\s+0\/1\s+never loaded by any test/);
    const published = readFileSync(summary, 'utf8');
    assert.match(published, /^## Test coverage \(executable lines\)/);
    assert.ok(published.includes(output.trim()), 'the job summary carries the same report');
  });
});

test('the coverage run fails exactly when the tests fail and skips the report', () => {
  withTempProject(coverageProject('node -e "process.exit(3)"'), (root) => {
    const summary = path.join(root, 'step-summary.md');
    const { code, output, warnings } = runProbe(root, { GITHUB_STEP_SUMMARY: summary });
    assert.equal(code, 3, 'the test exit code is propagated');
    assert.match(warnings, /Tests failed; the coverage report was not generated/);
    assert.equal(output, '');
    assert.equal(existsSync(summary), false);
  });
});

test('a coverage reporting problem after passing tests is logged without failing the run', () => {
  withTempProject(coverageProject(), (root) => {
    // A directory cannot be appended to, so publishing the summary throws.
    const { code, output, warnings } = runProbe(root, { GITHUB_STEP_SUMMARY: path.join(root, 'src') });
    assert.equal(code, 0);
    assert.match(output, /src\/lib\.mjs/);
    assert.match(warnings, /The tests passed, but the coverage report failed/);
  });
});
