import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE_CHARACTER } from '../public/guide-character.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const testsDirectory = path.join(root, 'tests');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('keeps automated test source independent from the currently configured guide identity', () => {
  const sources = readdirSync(testsDirectory)
    .filter((filename) => filename.endsWith('.test.js'))
    .map((filename) => ({
      filename,
      source: readFileSync(path.join(testsDirectory, filename), 'utf8'),
    }));

  for (const literal of [
    GUIDE_CHARACTER.id,
    GUIDE_CHARACTER.name.zh,
    GUIDE_CHARACTER.name.en,
    GUIDE_CHARACTER.codename.en,
  ]) {
    const expression = new RegExp(escapeRegExp(literal), 'iu');
    const offenders = sources
      .filter(({ source }) => expression.test(source))
      .map(({ filename }) => filename);
    assert.deepEqual(
      offenders,
      [],
      `tests must not hard-code the active guide literal "${literal}"`,
    );
  }
});
