import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  approvalPathForTag,
  computeUiDigest,
  loadUiChecklist,
  normalizeReleaseTag,
  projectRoot,
  renderUiManual,
  validateUiApproval,
} from '../scripts/ui-approval-lib.mjs';

const checklist = loadUiChecklist();
const currentDigest = computeUiDigest(checklist);

function validApproval(overrides = {}) {
  return {
    schemaVersion: 1,
    checklistVersion: checklist.checklistVersion,
    releaseTag: 'v9.8.7',
    status: 'passed',
    uiDigest: currentDigest,
    reviewer: 'Release reviewer',
    reviewedAt: '2026-01-02T03:04:05.000Z',
    browsers: ['Browser on desktop', 'Browser on mobile'],
    results: checklist.requiredScenarios.map((scenario) => ({
      id: scenario.id,
      status: 'passed',
      evidence: [`evidence/${scenario.id}.png`],
    })),
    ...overrides,
  };
}

test('accepts a complete approval only when every configured visual scenario passed', () => {
  assert.deepEqual(
    validateUiApproval(validApproval(), {
      checklist,
      expectedTag: 'v9.8.7',
      expectedDigest: currentDigest,
    }),
    [],
  );
});

test('rejects stale UI hashes, missing scenarios, and incomplete human evidence', () => {
  const approval = validApproval({
    uiDigest: 'sha256:stale',
    reviewer: '',
  });
  approval.results = approval.results.slice(1);
  approval.results[0] = {
    ...approval.results[0],
    status: 'failed',
    evidence: [],
  };

  const errors = validateUiApproval(approval, {
    checklist,
    expectedTag: 'v9.8.7',
    expectedDigest: currentDigest,
  });
  assert.ok(errors.some((error) => error.includes('源码摘要')));
  assert.ok(errors.some((error) => error.includes('reviewer')));
  assert.ok(errors.some((error) => error.includes('缺少场景')));
  assert.ok(errors.some((error) => error.includes('场景未通过')));
  assert.ok(errors.some((error) => error.includes('场景缺少证据')));
});

function runScript(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_TAG: '' },
  });
}

test('normalizes release tags and maps each one to its approval record', () => {
  assert.equal(normalizeReleaseTag('4.1.1'), 'v4.1.1');
  assert.equal(normalizeReleaseTag(' v4.1.1 '), 'v4.1.1');
  assert.match(approvalPathForTag('4.1.1').replaceAll('\\', '/'), /predeploy\/ui-approvals\/v4\.1\.1\.json$/);
});

test('the UI digest is stable and changes when the covered file set changes', () => {
  assert.match(currentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(computeUiDigest(checklist), currentDigest);
  const widened = { ...checklist, digestFiles: [...checklist.digestFiles, 'package.json'] };
  assert.notEqual(computeUiDigest(widened), currentDigest);
});

test('rejects approvals for other releases, stale checklists, and malformed review metadata', () => {
  const approval = validApproval({
    schemaVersion: 2,
    checklistVersion: 'outdated-checklist',
    status: 'draft',
    reviewedAt: 'last Tuesday',
    browsers: ['   '],
  });
  approval.results.push({ ...approval.results[0] });
  const errors = validateUiApproval(approval, {
    checklist,
    expectedTag: 'v9.8.8',
    expectedDigest: currentDigest,
  });
  for (const fragment of ['schemaVersion', 'releaseTag 应为 v9.8.8', 'checklistVersion', 'status', 'reviewedAt', '浏览器', '重复 id']) {
    assert.ok(errors.some((error) => error.includes(fragment)), fragment);
  }

  const prerelease = validateUiApproval(validApproval({ releaseTag: 'v9.8.7-rc.1' }), {
    checklist,
    expectedTag: 'v9.8.7-rc.1',
    expectedDigest: currentDigest,
  });
  assert.ok(prerelease.some((error) => error.includes('正式 SemVer')));
});

test('renders the committed UI manual from the checklist and rejects unknown viewport profiles', () => {
  const committed = readFileSync(new URL('../docs/PREDEPLOY_UI_MANUAL.md', import.meta.url), 'utf8');
  assert.equal(renderUiManual(checklist), committed.replace(/\r\n/g, '\n'));

  const broken = structuredClone(checklist);
  broken.requiredScenarios[0].profiles = ['unknown-profile'];
  assert.throws(() => renderUiManual(broken), /Unknown viewport profile: unknown-profile/);

  const check = runScript('scripts/generate-ui-manual.mjs', ['--check']);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /UI manual is current/);
});

test('refuses to record a UI approval without confirmation, a formal tag, a reviewer, a browser, and evidence', () => {
  const complete = ['--release', 'v9.9.9', '--reviewer', 'Reviewer', '--browser', 'Browser', '--evidence', 'evidence/'];
  const without = (flag) => {
    const index = complete.indexOf(flag);
    return ['--confirm-all', ...complete.slice(0, index), ...complete.slice(index + 2)];
  };
  const cases = [
    [complete, /--confirm-all/],
    [['--confirm-all', ...complete.slice(2), '--release', 'v9.9'], /正式 SemVer/],
    [without('--reviewer'), /--reviewer/],
    [without('--browser'), /--browser/],
    [without('--evidence'), /--evidence/],
  ];
  for (const [args, message] of cases) {
    const run = runScript('scripts/record-ui-approval.mjs', args);
    assert.notEqual(run.status, 0, args.join(' '));
    assert.match(run.stderr, message, args.join(' '));
  }
  assert.equal(existsSync(approvalPathForTag('v9.9.9')), false, 'a refused approval never writes a record');
});

test('fails closed when a release has no UI approval or only a stale one', () => {
  const missing = runScript('scripts/check-ui-approval.mjs', ['v0.0.0']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /缺少 v0\.0\.0 的 UI 人工验收记录/);

  const approvalsDirectory = new URL('../predeploy/ui-approvals/', import.meta.url);
  const staleTag = readdirSync(approvalsDirectory)
    .filter((name) => /^v\d+\.\d+\.\d+\.json$/.test(name))
    .map((name) => ({
      tag: name.slice(0, -'.json'.length),
      record: JSON.parse(readFileSync(new URL(name, approvalsDirectory), 'utf8')),
    }))
    .find(({ record }) => record.uiDigest !== currentDigest)?.tag;
  if (staleTag) {
    const stale = runScript('scripts/check-ui-approval.mjs', [staleTag]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, new RegExp(`${staleTag.replaceAll('.', '\\.')} 的 UI 人工验收无效[\\s\\S]*UI 源码摘要已变化`));
  }
});
