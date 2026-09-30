import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { npmCommand } from './npm-command.mjs';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));

// Generated copies under public/vendor/ are excluded: `npm run vendor:check`
// already proves they are byte-identical to their tested sources.
export const COVERAGE_GROUPS = Object.freeze([
  Object.freeze({
    id: 'browser',
    label: 'Browser runtime',
    root: 'public',
    extensions: Object.freeze(['.js']),
    excludePrefixes: Object.freeze(['public/vendor/']),
    runtime: true,
  }),
  Object.freeze({
    id: 'server',
    label: 'Cloudflare Worker',
    root: 'worker',
    extensions: Object.freeze(['.js']),
    excludePrefixes: Object.freeze([]),
    runtime: true,
  }),
  Object.freeze({
    id: 'tooling',
    label: 'Release and test tooling',
    root: 'scripts',
    extensions: Object.freeze(['.mjs']),
    excludePrefixes: Object.freeze([]),
    runtime: false,
  }),
]);

// The browser runs generated copies of the shared game core. `npm run
// vendor:check` keeps them identical to the Worker sources (only the import
// path on line 1 differs), so their executions count toward the source file.
export const COVERAGE_ALIASES = Object.freeze({
  'public/vendor/game-core/room-engine.js': 'worker/room-engine.js',
  'public/vendor/game-core/beginner-layout.js': 'worker/beginner-layout.js',
});

function toProjectPath(root, absolute) {
  return path.relative(root, absolute).replaceAll('\\', '/');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    });
}

export function groupForFile(file, groups = COVERAGE_GROUPS) {
  return groups.find((group) => (
    file.startsWith(`${group.root}/`)
    && group.extensions.some((extension) => file.endsWith(extension))
    && !group.excludePrefixes.some((prefix) => file.startsWith(prefix))
  )) ?? null;
}

export function collectSourceFiles({ root = projectRoot, groups = COVERAGE_GROUPS } = {}) {
  return groups.flatMap((group) => {
    const directory = path.join(root, group.root);
    if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
    return walk(directory)
      .map((absolute) => toProjectPath(root, absolute))
      .filter((file) => groupForFile(file, groups) === group);
  });
}

// A module imported as `room-client.js` and as `room-client.js?v=4.1.0` is the
// same source file loaded twice; both executions must count toward one file.
export function projectFileFromCoverageUrl(url, root = projectRoot) {
  if (!String(url).startsWith('file:')) return null;
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  const relative = toProjectPath(root, fileURLToPath(parsed));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative;
}

// Lines that can execute: not blank and not wholly inside a comment.
export function countableLines(source) {
  let inBlockComment = false;
  return source.split(/\r?\n/).map((line) => {
    let rest = line.trim();
    if (inBlockComment) {
      const end = rest.indexOf('*/');
      if (end < 0) return false;
      inBlockComment = false;
      rest = rest.slice(end + 2).trim();
    }
    while (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) {
        inBlockComment = true;
        return false;
      }
      rest = rest.slice(end + 2).trim();
    }
    return rest.length > 0 && !rest.startsWith('//');
  });
}

// V8 block coverage lists each function's full range first and nested blocks
// after it. Applying ranges from outermost to innermost lets a nested block's
// count override its parent, which is how V8 defines block execution counts.
export function executedLines(source, functions) {
  const counts = new Float64Array(source.length);
  const ranges = functions
    .flatMap((fn) => fn.ranges ?? [])
    .toSorted((left, right) => (
      left.startOffset - right.startOffset || right.endOffset - left.endOffset
    ));
  for (const range of ranges) {
    counts.fill(range.count, range.startOffset, Math.min(range.endOffset, source.length));
  }

  const executable = countableLines(source);
  const result = [];
  let offset = 0;
  source.split('\n').forEach((line, index) => {
    const firstCode = line.search(/\S/);
    result.push(executable[index] ? counts[offset + firstCode] > 0 : null);
    offset += line.length + 1;
  });
  return result;
}

export function mergeExecutedLines(target, next) {
  if (!target) return [...next];
  return target.map((value, index) => (value === null ? null : value || next[index] === true));
}

export function readCoverageDirectory(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(readFileSync(path.join(directory, name), 'utf8')).result ?? []);
}

export function summarizeCoverage({
  scripts,
  sourceFiles = collectSourceFiles(),
  root = projectRoot,
  readSource = (file) => readFileSync(path.join(root, file), 'utf8'),
  groups = COVERAGE_GROUPS,
  aliases = COVERAGE_ALIASES,
} = {}) {
  const wanted = new Set(sourceFiles);
  const executions = new Map();
  for (const script of scripts) {
    const loaded = projectFileFromCoverageUrl(script.url, root);
    const file = aliases[loaded] ?? loaded;
    if (!file || !wanted.has(file)) continue;
    if (!executions.has(file)) executions.set(file, []);
    executions.get(file).push({ loaded, functions: script.functions ?? [] });
  }

  return sourceFiles.map((file) => {
    const source = readSource(file);
    const lineCount = source.split('\n').length;
    // Offsets are interpreted against the file that actually ran; a copy whose
    // line layout differs from its source is ignored rather than misattributed.
    const runs = (executions.get(file) ?? [])
      .map(({ loaded, functions }) => executedLines(loaded === file ? source : readSource(loaded), functions))
      .filter((executed) => executed.length === lineCount);
    const lines = runs.reduce(
      (merged, executed) => mergeExecutedLines(merged, executed),
      null,
    ) ?? countableLines(source).map((executable) => (executable ? false : null));
    const uncovered = [];
    lines.forEach((value, index) => {
      if (value === false) uncovered.push(index + 1);
    });
    const total = lines.filter((value) => value !== null).length;
    return {
      file,
      group: groupForFile(file, groups)?.id ?? null,
      loaded: runs.length > 0,
      total,
      covered: total - uncovered.length,
      uncovered,
    };
  });
}

export function formatLineRanges(lines) {
  const ranges = [];
  for (const line of lines) {
    const last = ranges.at(-1);
    if (last && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(' ');
}

function percent(covered, total) {
  return total ? (covered / total) * 100 : 100;
}

export function totalsFor(rows) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const covered = rows.reduce((sum, row) => sum + row.covered, 0);
  return { total, covered, percent: percent(covered, total) };
}

export function renderCoverageReport(rows, { groups = COVERAGE_GROUPS, maxUncovered = 90 } = {}) {
  const width = Math.max(4, ...rows.map((row) => row.file.length));
  const lines = [];
  const format = (label, { covered, total }) => (
    `${label.padEnd(width)}  ${percent(covered, total).toFixed(1).padStart(6)}%  ${String(covered).padStart(5)}/${String(total).padEnd(5)}`
  );

  for (const group of groups) {
    const groupRows = rows.filter((row) => row.group === group.id);
    if (!groupRows.length) continue;
    lines.push('', `## ${group.label}`, '');
    for (const row of groupRows) {
      const status = row.loaded ? formatLineRanges(row.uncovered) : 'never loaded by any test';
      const detail = status.length > maxUncovered ? `${status.slice(0, maxUncovered)}…` : status;
      lines.push(`${format(row.file, row)}  ${detail}`.trimEnd());
    }
    lines.push(format('(group total)', totalsFor(groupRows)));
  }

  const runtimeIds = new Set(groups.filter((group) => group.runtime).map((group) => group.id));
  const runtimeRows = rows.filter((row) => runtimeIds.has(row.group));
  const loadedRuntimeRows = runtimeRows.filter((row) => row.loaded);
  lines.push(
    '',
    '## Summary (executable lines)',
    '',
    format('runtime code, all files', totalsFor(runtimeRows)),
    format('runtime code, loaded files only', totalsFor(loadedRuntimeRows)),
    format('all reported files', totalsFor(rows)),
  );
  return `${lines.join('\n').trim()}\n`;
}

// Runs the complete `npm test` once with raw V8 coverage enabled, then reports.
// The exit code is always the test run's: when the tests pass, a problem while
// building or publishing the report is logged but never fails the build.
export function runCoverageReport({
  root = projectRoot,
  env = process.env,
  groups = COVERAGE_GROUPS,
  aliases = COVERAGE_ALIASES,
  stdio = 'inherit',
  log = console.log,
  warn = console.error,
} = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'zero-domain-coverage-'));
  try {
    const npm = npmCommand(env);
    const run = spawnSync(npm.command, [...npm.args, '--prefix', root, 'test'], {
      cwd: root,
      env: { ...env, NODE_V8_COVERAGE: directory },
      stdio,
      shell: npm.shell,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) {
      warn('\nTests failed; the coverage report was not generated.');
      return run.status ?? 1;
    }
    try {
      const rows = summarizeCoverage({
        scripts: readCoverageDirectory(directory),
        sourceFiles: collectSourceFiles({ root, groups }),
        root,
        groups,
        aliases,
      });
      const report = renderCoverageReport(rows, { groups });
      log(`\n${report}`);
      if (env.GITHUB_STEP_SUMMARY) {
        appendFileSync(env.GITHUB_STEP_SUMMARY, `## Test coverage (executable lines)\n\n\`\`\`text\n${report}\`\`\`\n`);
      }
    } catch (error) {
      warn(`\nThe tests passed, but the coverage report failed: ${error?.stack ?? error}`);
    }
    return 0;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
