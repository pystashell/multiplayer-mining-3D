import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));
export const checklistPath = path.join(
  projectRoot,
  'config',
  'predeploy-ui-checklist.json',
);

export function loadUiChecklist() {
  return JSON.parse(readFileSync(checklistPath, 'utf8'));
}

function collectFiles(target) {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectFiles(path.join(target, entry.name)));
}

export function computeUiDigest(checklist = loadUiChecklist()) {
  const files = [
    ...checklist.digestRoots.flatMap((entry) => collectFiles(path.join(projectRoot, entry))),
    ...checklist.digestFiles.map((entry) => path.join(projectRoot, entry)),
  ].sort();
  const hash = createHash('sha256');
  for (const filename of files) {
    const relative = path.relative(projectRoot, filename).replaceAll('\\', '/');
    hash.update(relative);
    hash.update('\0');
    hash.update(readFileSync(filename));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function normalizeReleaseTag(value) {
  const normalized = String(value || '').trim();
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

export function approvalPathForTag(releaseTag) {
  return path.join(
    projectRoot,
    'predeploy',
    'ui-approvals',
    `${normalizeReleaseTag(releaseTag)}.json`,
  );
}

export function validateUiApproval(
  approval,
  {
    checklist = loadUiChecklist(),
    expectedTag,
    expectedDigest = computeUiDigest(checklist),
  } = {},
) {
  const errors = [];
  const releaseTag = normalizeReleaseTag(expectedTag ?? approval?.releaseTag);
  if (approval?.schemaVersion !== 1) errors.push('schemaVersion 必须为 1');
  if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
    errors.push(`发布标签不是正式 SemVer：${releaseTag}`);
  }
  if (approval?.releaseTag !== releaseTag) {
    errors.push(`releaseTag 应为 ${releaseTag}`);
  }
  if (approval?.checklistVersion !== checklist.checklistVersion) {
    errors.push(`checklistVersion 应为 ${checklist.checklistVersion}`);
  }
  if (approval?.status !== 'passed') errors.push('status 必须为 passed');
  if (approval?.uiDigest !== expectedDigest) {
    errors.push('UI 源码摘要已变化，必须重新执行人工验收');
  }
  if (!approval?.reviewer?.trim()) errors.push('缺少 reviewer');
  if (!Number.isFinite(Date.parse(approval?.reviewedAt))) {
    errors.push('reviewedAt 必须是有效时间');
  }
  if (!Array.isArray(approval?.browsers) || !approval.browsers.some((item) => item?.trim())) {
    errors.push('至少记录一个实际浏览器');
  }

  const results = Array.isArray(approval?.results) ? approval.results : [];
  const resultIds = results.map((result) => result.id);
  if (new Set(resultIds).size !== resultIds.length) {
    errors.push('场景验收结果存在重复 id');
  }
  for (const scenario of checklist.requiredScenarios) {
    const result = results.find((candidate) => candidate.id === scenario.id);
    if (!result) {
      errors.push(`缺少场景：${scenario.id}`);
      continue;
    }
    if (result.status !== 'passed') {
      errors.push(`场景未通过：${scenario.id}`);
    }
    if (!Array.isArray(result.evidence) || !result.evidence.some((item) => item?.trim())) {
      errors.push(`场景缺少证据：${scenario.id}`);
    }
  }
  return errors;
}

function profileLabel(checklist, profileId) {
  const profile = checklist.viewportProfiles[profileId];
  if (!profile) throw new Error(`Unknown viewport profile: ${profileId}`);
  return `${profile.labelZh}（${profile.viewport}，${profile.input}）`;
}

export function renderUiManual(checklist = loadUiChecklist()) {
  const lines = [
    '# 发布前 UI 人工测试手册',
    '',
    '> 本文件由 `config/predeploy-ui-checklist.json` 自动生成。',
    '> 请不要直接编辑；修改清单后运行 `npm run ui:manual`。',
    '',
    '## 适用范围',
    '',
    '这份手册负责自动化源码测试无法证明的视觉与真实交互结果，包括遮挡、裁切、人物一致性、触摸手感、双浏览器同步和控制台清洁度。',
    '',
    '自动化测试通过不等于 UI 验收通过。任何正式部署都必须同时具备：',
    '',
    '1. `npm test` 通过。',
    '2. `npm run deploy:dry` 通过。',
    '3. 本手册全部场景通过并留下证据。',
    '4. `npm run ui:check` 确认验收记录仍绑定当前源码。',
    '',
    '## 执行与记录',
    '',
    '1. 运行 `npm run dev`，打开终端显示的本地地址。',
    '2. 按下列场景逐项执行；发现失败立即停止，不得勾选通过。',
    '3. 截图建议放在仓库外或团队约定的证据目录，避免把临时截图混入产品资源。',
    '4. 全部通过后执行：',
    '',
    '```powershell',
    'npm run ui:approve -- --reviewer "验收人" --browser "Chrome 版本/系统" --evidence "截图目录或证据链接" --confirm-all',
    '```',
    '',
    '5. 把生成的 `predeploy/ui-approvals/vX.Y.Z.json` 与待发布代码一起提交。',
    '6. 任何 `public/` 文件或本清单变化都会改变摘要，使旧验收自动失效。',
    '',
    '## 失败判定原则',
    '',
    '- 产品行为错误：修复产品代码，然后从自动化测试重新开始。',
    '- 需求明确改变：先更新需求、清单和实现，再重新完成全部受影响场景。',
    '- 仅测试步骤过时：必须证明用户可见行为仍正确，再更新清单；不能直接跳过。',
    '- 浏览器或网络偶发问题：保存证据并复现；无法解释的失败仍然阻止发布。',
    '',
  ];

  checklist.requiredScenarios.forEach((scenario, index) => {
    lines.push(
      `## ${index + 1}. ${scenario.titleZh}`,
      '',
      `**目的：** ${scenario.purposeZh}`,
      '',
      `**测试环境：** ${scenario.profiles.map((id) => profileLabel(checklist, id)).join('；')}`,
      '',
      '**步骤：**',
      '',
      ...scenario.stepsZh.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
      '',
      '**通过标准：**',
      '',
      ...scenario.expectedZh.map((expectation) => `- ${expectation}`),
      '',
      `**证据：** ${scenario.evidenceZh}`,
      '',
      `**失败处理：** ${scenario.failureActionZh}`,
      '',
    );
  });

  return `${lines.join('\n').trimEnd()}\n`;
}
