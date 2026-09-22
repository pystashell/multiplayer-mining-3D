import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUiDigest,
  loadUiChecklist,
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
