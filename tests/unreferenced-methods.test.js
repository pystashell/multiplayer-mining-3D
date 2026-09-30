import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// A lightweight text heuristic, not a call-graph or reachability analysis: it
// flags a class method whose name never appears in browser code outside its
// own definition line. Known blind spots are pinned by tests below, so a
// passing scan never proves that a method is reachable.

const NOT_METHODS = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch']);
const METHOD_LINE = /^ {2}(?:(?:async|static|get|set) )*(#?[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{(?:[^{}]*\})?\s*$/;

function classMethods(source) {
  const methods = [];
  let inClass = false;
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^(?:export\s+)?class\s+\w+/.test(line)) inClass = true;
    else if (/^\}/.test(line)) inClass = false;
    if (!inClass) return;
    const match = METHOD_LINE.exec(line);
    if (match && !NOT_METHODS.has(match[1])) methods.push({ name: match[1], line: index + 1 });
  });
  return methods;
}

// Whole-line `//` comments and block comments that open a line do not count
// as references. Trailing comments after code still do (a known blind spot).
function withoutCommentLines(source) {
  let inBlock = false;
  return source.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return false;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/', 2);
      return false;
    }
    return !trimmed.startsWith('//');
  }).join('\n');
}

function referenceCount(name, text) {
  const escaped = name.replace(/[$#]/g, '\\$&');
  return (text.match(new RegExp(`(?<![\\w$#])${escaped}(?![\\w$])`, 'g')) ?? []).length;
}

function unreferencedMethods(files) {
  const corpus = [...files.values()].map(withoutCommentLines).join('\n');
  return [...files].flatMap(([file, source]) => classMethods(source)
    .filter(({ name }) => referenceCount(name, corpus) <= 1)
    .map(({ name, line }) => `${file}:${line} ${name}()`));
}

const sample = (lines) => new Map([['sample.js', lines.join('\n')]]);

test('the name-reference heuristic flags methods whose names appear nowhere else', () => {
  assert.deepEqual(unreferencedMethods(sample([
    'export class Sample {',
    '  constructor() {}',
    '  entry() {',
    '    this.helper();',
    '  }',
    '  helper() {',
    '  }',
    '  async orphan(value) {',
    '  }',
    '  inlineOrphan() { return 1; }',
    '  commentedOrphan() {',
    '  }',
    '}',
    'new Sample().entry();',
    '// commentedOrphan is only mentioned in this comment',
    '/* nor does a block comment count:',
    '   commentedOrphan */',
  ])), [
    'sample.js:8 orphan()',
    'sample.js:10 inlineOrphan()',
    'sample.js:11 commentedOrphan()',
  ]);
});

test('the heuristic documents what it cannot prove about reachability', () => {
  // Each case is dead code the text scan accepts; do not rely on it alone
  // when deciding that code is live.
  const blindSpots = {
    'same name in two classes': [
      'class A {',
      '  reset() {',
      '  }',
      '}',
      'class B {',
      '  reset() {',
      '  }',
      '}',
    ],
    'methods that only call each other': [
      'class Cycle {',
      '  ping() {',
      '    this.pong();',
      '  }',
      '  pong() {',
      '    this.ping();',
      '  }',
      '}',
    ],
    'a trailing comment after code': [
      'class Trailing {',
      '  stale() {',
      '  }',
      '}',
      'const value = 1; // stale',
    ],
    'a multi-line parameter list': [
      'class Wrapped {',
      '  wrapped(',
      '    value,',
      '  ) {',
      '  }',
      '}',
    ],
  };
  for (const [label, lines] of Object.entries(blindSpots)) {
    assert.deepEqual(unreferencedMethods(sample(lines)), [], label);
  }
});

test('every browser class method name appears somewhere besides its definition', () => {
  const publicDirectory = new URL('../public/', import.meta.url);
  const files = new Map(readdirSync(publicDirectory)
    .filter((name) => name.endsWith('.js') || name === 'index.html')
    .map((name) => [`public/${name}`, readFileSync(new URL(name, publicDirectory), 'utf8')]));
  assert.ok(files.size >= 10, 'the scan must see the browser modules');
  assert.deepEqual(
    unreferencedMethods(files),
    [],
    'these method names never appear elsewhere, so they are almost certainly dead: confirm and delete them, or wire them up',
  );
});
