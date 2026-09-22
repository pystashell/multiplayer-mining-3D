import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testsDirectory = path.join(root, 'tests');
const manifestPath = path.join(root, 'config', 'test-suite-manifest.json');
const outputPath = path.join(root, 'docs', 'AUTOMATED_TEST_CATALOG.md');

function testDefinitions(filename) {
  const source = readFileSync(path.join(testsDirectory, filename), 'utf8');
  return source
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(/^\s*test\(\s*(['"`])(.+)\1\s*,/);
      if (!match) return [];
      return [{
        line: index + 1,
        title: match[2].replaceAll('|', '\\|'),
      }];
    });
}

function assertManifest(manifest, testFiles) {
  if (manifest.schemaVersion !== 1) {
    throw new Error('config/test-suite-manifest.json must use schemaVersion 1');
  }

  const registeredFiles = Object.keys(manifest.suites).sort();
  const missing = testFiles.filter((filename) => !registeredFiles.includes(filename));
  const stale = registeredFiles.filter((filename) => !testFiles.includes(filename));
  if (missing.length || stale.length) {
    throw new Error([
      missing.length ? `Unregistered test suites: ${missing.join(', ')}` : '',
      stale.length ? `Stale test suite entries: ${stale.join(', ')}` : '',
    ].filter(Boolean).join('\n'));
  }

  for (const filename of testFiles) {
    const suite = manifest.suites[filename];
    const category = manifest.categories[suite.category];
    if (!category) throw new Error(`${filename} uses unknown category ${suite.category}`);
    if (!suite.purposeZh?.trim()) throw new Error(`${filename} needs purposeZh`);
    for (const field of [
      'labelZh',
      'automationLevelZh',
      'failureActionZh',
      'validityReviewZh',
    ]) {
      if (!category[field]?.trim()) {
        throw new Error(`${suite.category} needs ${field}`);
      }
    }
    const definitions = testDefinitions(filename);
    if (!definitions.length) throw new Error(`${filename} has no discoverable test() cases`);
    for (const definition of definitions) {
      if (definition.title.length < 12) {
        throw new Error(`${filename}:${definition.line} needs a descriptive test title`);
      }
    }
  }

  for (const gate of manifest.gates ?? []) {
    for (const field of ['id', 'command', 'purposeZh', 'failureActionZh']) {
      if (!gate[field]?.trim()) throw new Error(`deployment gate needs ${field}`);
    }
  }
}

function renderCatalog(manifest, testFiles) {
  const definitionCount = testFiles
    .map((filename) => testDefinitions(filename).length)
    .reduce((sum, count) => sum + count, 0);
  const lines = [
    '# 自动化测试目录',
    '',
    '> 本文件由 `config/test-suite-manifest.json` 与真实 `tests/*.test.js` 自动生成。',
    '> 请不要直接编辑；修改清单后运行 `npm run test:catalog`。',
    '',
    '## 如何使用',
    '',
    `当前登记 **${testFiles.length} 个测试套件、${definitionCount} 个静态用例定义**。参数化用例会在运行时展开为多个实际结果。`,
    '',
    '- “测试内容”直接取自可执行用例名称，因此目录不会与代码分叉。',
    '- 每个套件都明确说明失败处理和测试何时可能需要评审。',
    '- 角色改名、代号变化或更换素材，不是修改通用测试的理由。',
    '- 源码级 UI 契约只能发现结构回归，仍必须执行 `PREDEPLOY_UI_MANUAL.md`。',
    '',
    '## 强制门禁',
    '',
    '| 命令 | 检查内容 | 失败时处理 |',
    '| --- | --- | --- |',
    ...(manifest.gates ?? []).map((gate) => (
      `| \`${gate.command}\` | ${gate.purposeZh} | ${gate.failureActionZh} |`
    )),
    '',
    '## 套件与用例',
    '',
  ];

  for (const filename of testFiles) {
    const suite = manifest.suites[filename];
    const category = manifest.categories[suite.category];
    lines.push(
      `### ${filename}`,
      '',
      `- 分类：${category.labelZh}`,
      `- 自动化层级：${category.automationLevelZh}`,
      `- 套件目的：${suite.purposeZh}`,
      `- 任一用例失败：${suite.failureActionZh ?? category.failureActionZh}`,
      `- 有效性评审：${suite.validityReviewZh ?? category.validityReviewZh}`,
      '',
      '| 源码 | 测试内容 |',
      '| --- | --- |',
      ...testDefinitions(filename).map((definition) => (
        `| [L${definition.line}](../tests/${filename}#L${definition.line}) | \`${definition.title}\` |`
      )),
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const testFiles = readdirSync(testsDirectory)
  .filter((filename) => filename.endsWith('.test.js'))
  .sort();

assertManifest(manifest, testFiles);
const output = renderCatalog(manifest, testFiles);

if (process.argv.includes('--check')) {
  let existing = '';
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    throw new Error('docs/AUTOMATED_TEST_CATALOG.md is missing; run npm run test:catalog');
  }
  if (existing !== output) {
    throw new Error('Automated test catalog is stale; run npm run test:catalog');
  }
  console.log(`Test catalog is current: ${testFiles.length} suites.`);
} else {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  console.log(`Generated docs/AUTOMATED_TEST_CATALOG.md for ${testFiles.length} suites.`);
}
