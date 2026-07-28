import { readFileSync } from 'node:fs';
import {
  approvalPathForTag,
  computeUiDigest,
  loadUiChecklist,
  normalizeReleaseTag,
  validateUiApproval,
} from './ui-approval-lib.mjs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const requestedTag = process.argv[2]
  ?? process.env.RELEASE_TAG
  ?? `v${packageJson.version}`;
const releaseTag = normalizeReleaseTag(requestedTag);
const approvalPath = approvalPathForTag(releaseTag);

let approval;
try {
  approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
} catch {
  throw new Error([
    `缺少 ${releaseTag} 的 UI 人工验收记录：${approvalPath}`,
    '请先执行 docs/PREDEPLOY_UI_MANUAL.md，再运行：',
    'npm run ui:approve -- --reviewer "验收人" --browser "浏览器/系统" --evidence "截图目录或证据链接" --confirm-all',
  ].join('\n'));
}

const checklist = loadUiChecklist();
const errors = validateUiApproval(approval, {
  checklist,
  expectedTag: releaseTag,
  expectedDigest: computeUiDigest(checklist),
});
if (errors.length) {
  throw new Error([
    `${releaseTag} 的 UI 人工验收无效：`,
    ...errors.map((error) => `- ${error}`),
    '请按最新 UI 手册重新验收并生成记录。',
  ].join('\n'));
}

console.log(`UI approval is valid for ${releaseTag}: ${approval.reviewer}`);
