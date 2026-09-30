import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const publicDirectory = new URL('../public/', import.meta.url);
const sources = new Map(readdirSync(publicDirectory)
  .filter((name) => name.endsWith('.js'))
  .map((name) => [name, readFileSync(new URL(name, publicDirectory), 'utf8')]));
const corpus = [...sources.values(), readFileSync(new URL('index.html', publicDirectory), 'utf8')].join('\n');

const NOT_METHODS = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch']);

function classMethods(source) {
  const methods = [];
  let inClass = false;
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^(?:export\s+)?class\s+\w+/.test(line)) inClass = true;
    else if (/^\}/.test(line)) inClass = false;
    if (!inClass) return;
    const match = /^ {2}(?:(?:async|static|get|set) )*(#?[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/.exec(line);
    if (match && !NOT_METHODS.has(match[1])) methods.push({ name: match[1], line: index + 1 });
  });
  return methods;
}

function referenceCount(name, text = corpus) {
  const escaped = name.replace(/[$#]/g, '\\$&');
  return (text.match(new RegExp(`(?<![\\w$#])${escaped}(?![\\w$])`, 'g')) ?? []).length;
}

test('the dead-method scan recognizes class methods and their call sites', () => {
  const sample = [
    'export class Sample {',
    '  constructor() {}',
    '  used() {',
    '    this.helper();',
    '  }',
    '  helper() {',
    '  }',
    '  async orphan(value) {',
    '  }',
    '}',
    'function outside() {',
    '}',
  ].join('\n');
  assert.deepEqual(classMethods(sample).map(({ name }) => name), ['used', 'helper', 'orphan']);
  assert.equal(referenceCount('helper', sample), 2);
  assert.equal(referenceCount('orphan', sample), 1);
});

test('every browser class method is referenced somewhere besides its own definition', () => {
  const unreferenced = [];
  for (const [file, source] of sources) {
    for (const { name, line } of classMethods(source)) {
      if (referenceCount(name) <= 1) unreferenced.push(`public/${file}:${line} ${name}()`);
    }
  }
  assert.ok(sources.size >= 10, 'the scan must see the browser modules');
  assert.deepEqual(
    unreferenced,
    [],
    'delete unreachable methods (or wire them up) instead of letting tests keep them alive',
  );
});
