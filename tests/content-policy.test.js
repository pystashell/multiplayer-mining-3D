import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS } from '../public/i18n.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const policy = JSON.parse(
  readFileSync(path.join(root, 'config/content-policy.json'), 'utf8'),
);

function normalizedRelativePath(filename) {
  return path.relative(root, filename).replaceAll('\\', '/');
}

function collectFiles(target) {
  if (!existsSync(target)) return [];
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => collectFiles(path.join(target, entry.name)));
}

function contentFiles() {
  const extensions = new Set(policy.scan.textExtensions);
  const excluded = policy.scan.excludePrefixes;
  return [
    ...policy.scan.roots.flatMap((entry) => collectFiles(path.join(root, entry))),
    ...policy.scan.extraFiles.map((entry) => path.join(root, entry)),
  ]
    .filter((filename) => existsSync(filename) && statSync(filename).isFile())
    .filter((filename) => extensions.has(path.extname(filename).toLowerCase()))
    .filter((filename) => {
      const relative = normalizedRelativePath(filename);
      return !excluded.some((prefix) => relative.startsWith(prefix));
    })
    .sort();
}

function configuredPattern(rule) {
  return new RegExp(rule.expression, rule.flags);
}

test('requires every configurable content rule to explain its intent and failure response', () => {
  assert.equal(policy.schemaVersion, 1);
  const allRules = [
    ...policy.forbiddenRules,
    ...policy.requiredCampaignConcepts,
  ];
  assert.equal(new Set(allRules.map((rule) => rule.id)).size, allRules.length);
  for (const rule of allRules) {
    assert.match(rule.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(rule.descriptionZh?.trim(), `${rule.id} needs a description`);
    assert.ok(rule.failureActionZh?.trim(), `${rule.id} needs a failure action`);
    const expressions = rule.expressions ?? [rule.expression];
    assert.ok(expressions.length > 0, `${rule.id} needs at least one expression`);
    for (const expression of expressions) {
      assert.doesNotThrow(() => new RegExp(expression, rule.flags ?? 'iu'));
    }
  }
});

test('scans configured product surfaces with data-driven retired-content rules', () => {
  const failures = [];
  for (const filename of contentFiles()) {
    const relative = normalizedRelativePath(filename);
    const source = readFileSync(filename, 'utf8');
    const candidate = policy.scan.includeRelativePath
      ? `${relative}\n${source}`
      : source;
    for (const rule of policy.forbiddenRules) {
      const match = candidate.match(configuredPattern(rule));
      if (match) failures.push(`${rule.id}: ${relative}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `retired product content found:\n${failures.join('\n')}`,
  );
});

test('keeps campaign concepts defined by product policy rather than character names', () => {
  const campaignCopy = Object.entries(TRANSLATIONS)
    .flatMap(([language, table]) => Object.entries(table)
      .filter(([key]) => /^(?:mission|task|squad|lobby|tutorial)\./.test(key))
      .map(([key, value]) => `${language}.${key}: ${value}`))
    .join('\n');

  for (const concept of policy.requiredCampaignConcepts) {
    assert.ok(
      concept.expressions.some((expression) => new RegExp(expression, 'iu').test(campaignCopy)),
      `${concept.id} is missing. ${concept.failureActionZh}`,
    );
  }
});
