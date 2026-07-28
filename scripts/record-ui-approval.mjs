import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  approvalPathForTag,
  computeUiDigest,
  loadUiChecklist,
  normalizeReleaseTag,
} from './ui-approval-lib.mjs';

function optionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length - 1; index += 1) {
    if (process.argv[index] === name) values.push(process.argv[index + 1]);
  }
  return values.filter((value) => value && !value.startsWith('--'));
}

function requiredOption(name) {
  const value = optionValues(name)[0];
  if (!value?.trim()) throw new Error(`缺少必填参数 ${name}`);
  return value.trim();
}

if (!process.argv.includes('--confirm-all')) {
  throw new Error([
    '没有记录 UI 验收：必须先逐项完成 docs/PREDEPLOY_UI_MANUAL.md。',
    '全部通过后重新运行，并显式添加 --confirm-all。',
  ].join('\n'));
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const releaseTag = normalizeReleaseTag(
  optionValues('--release')[0] ?? `v${packageJson.version}`,
);
if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
  throw new Error(`只允许正式 SemVer 发布标签，收到：${releaseTag}`);
}

const reviewer = requiredOption('--reviewer');
const browsers = optionValues('--browser').map((value) => value.trim());
const evidence = optionValues('--evidence').map((value) => value.trim());
if (!browsers.length) throw new Error('至少提供一个 --browser');
if (!evidence.length) throw new Error('至少提供一个 --evidence');

const checklist = loadUiChecklist();
const approval = {
  schemaVersion: 1,
  checklistVersion: checklist.checklistVersion,
  releaseTag,
  status: 'passed',
  uiDigest: computeUiDigest(checklist),
  reviewer,
  reviewedAt: new Date().toISOString(),
  browsers,
  results: checklist.requiredScenarios.map((scenario) => ({
    id: scenario.id,
    status: 'passed',
    evidence,
  })),
};

const outputPath = approvalPathForTag(releaseTag);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
console.log(`Recorded UI approval: ${outputPath}`);
