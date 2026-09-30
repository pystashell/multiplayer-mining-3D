import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { npmCommand } from '../scripts/npm-command.mjs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

function requireOrder(source, commands) {
  let cursor = -1;
  for (const command of commands) {
    const next = source.indexOf(command, cursor + 1);
    assert.ok(next > cursor, `${command} must appear after the previous gate`);
    cursor = next;
  }
}

test('production deployment requires automated, bundle, and current UI approval gates', () => {
  assert.equal(
    packageJson.scripts['deploy:gate'],
    'npm test && npm run deploy:dry && npm run ui:check',
  );
  requireOrder(packageJson.scripts['deploy:gate'], [
    'npm test',
    'npm run deploy:dry',
    'npm run ui:check',
  ]);
  assert.equal(
    packageJson.scripts.deploy,
    'npm run deploy:gate && wrangler deploy',
    'npm run deploy must call the gate itself, so --ignore-scripts cannot skip it',
  );
  assert.equal(
    packageJson.scripts.predeploy,
    undefined,
    'npm runs a "predeploy" script automatically before "deploy", which would repeat the whole gate',
  );
});

test('npm is started through its CLI file, falling back to a shell only when none is found', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'npm-cli-'));
  try {
    const execPath = path.join(directory, 'node.exe');
    const bundled = path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const running = path.join(directory, 'running-npm-cli.js');
    mkdirSync(path.dirname(bundled), { recursive: true });
    writeFileSync(bundled, '');
    writeFileSync(running, '');

    assert.deepEqual(npmCommand({ npm_execpath: running }, execPath), { command: execPath, args: [running], shell: false });
    assert.deepEqual(npmCommand({}, execPath), { command: execPath, args: [bundled], shell: false });
    assert.deepEqual(
      npmCommand({ npm_execpath: path.join(directory, 'missing.js') }, execPath),
      { command: execPath, args: [bundled], shell: false },
    );
    const fallback = npmCommand({}, path.join(directory, 'elsewhere', 'node.exe'));
    assert.equal(fallback.command, 'npm');
    assert.equal(fallback.shell, process.platform === 'win32');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Runs npm in a throwaway project. Inherited npm_* variables (for example the
// outer project's prefix) are dropped so that npm can only see the probe.
function runProbeNpm(directory, args, env) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)),
  );
  const npm = npmCommand();
  return spawnSync(npm.command, [...npm.args, '--prefix', directory, ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...inherited, ...env },
    shell: npm.shell,
  });
}

test('npm run deploy runs each gate exactly once, cannot skip it, and a failing gate blocks deployment', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'deploy-gate-'));
  const log = path.join(directory, 'gates.log');
  const steps = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  try {
    // The real gate and deploy scripts, with every command that would do work
    // replaced by a recorder. Nothing in the probe may reach Wrangler.
    const scripts = {
      test: 'node record.js test',
      'deploy:dry': 'node record.js deploy:dry',
      'ui:check': 'node record.js ui:check',
      'deploy:gate': packageJson.scripts['deploy:gate'],
      deploy: packageJson.scripts.deploy.replace(/\bwrangler deploy\b/, 'node record.js publish'),
    };
    assert.ok(Object.values(scripts).every((script) => !/\bwrangler\b/.test(script)), 'the probe must never run Wrangler');
    writeFileSync(path.join(directory, 'record.js'), [
      "const { appendFileSync } = require('node:fs');",
      'const step = process.argv[2];',
      "appendFileSync(process.env.GATE_LOG, `${step}\\n`);",
      'if (process.env.FAIL_AT === step) process.exit(1);',
    ].join('\n'));
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      name: 'deploy-gate-probe',
      version: '1.0.0',
      private: true,
      scripts,
    }));

    const everyGate = ['test', 'deploy:dry', 'ui:check', 'publish'];
    for (const args of [['run', 'deploy'], ['run', 'deploy', '--ignore-scripts']]) {
      rmSync(log, { force: true });
      const run = runProbeNpm(directory, args, { GATE_LOG: log, FAIL_AT: '' });
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(steps(), everyGate, `npm ${args.join(' ')} runs each gate once, in order`);
    }

    rmSync(log, { force: true });
    const failing = runProbeNpm(directory, ['run', 'deploy'], { GATE_LOG: log, FAIL_AT: 'ui:check' });
    assert.notEqual(failing.status, 0, 'a failing gate must fail the deploy command');
    assert.deepEqual(steps(), ['test', 'deploy:dry', 'ui:check'], 'the last gate failing must still block the deploy');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the complete regression command checks documentation, assets, version, and all test files', () => {
  requireOrder(packageJson.scripts.test, [
    'npm run test:catalog:check',
    'npm run ui:manual:check',
    'npm run vendor:check',
    'npm run version:check',
    'node --test tests/*.test.js',
  ]);
});

test('development, UI evidence, validation, and live-smoke scripts remain available', () => {
  assert.equal(packageJson.scripts.dev, 'wrangler dev');
  assert.equal(packageJson.scripts['vendor:sync'], 'node scripts/sync-vendor-assets.mjs');
  assert.equal(packageJson.scripts['vendor:check'], 'node scripts/sync-vendor-assets.mjs --check');
  assert.equal(packageJson.scripts.version, 'node scripts/sync-release-version.mjs');
  assert.equal(packageJson.scripts['version:check'], 'node scripts/check-release.mjs');
  assert.equal(packageJson.scripts['test:catalog'], 'node scripts/generate-test-catalog.mjs');
  assert.equal(
    packageJson.scripts['test:catalog:check'],
    'node scripts/generate-test-catalog.mjs --check',
  );
  assert.equal(packageJson.scripts['ui:manual'], 'node scripts/generate-ui-manual.mjs');
  assert.equal(
    packageJson.scripts['ui:manual:check'],
    'node scripts/generate-ui-manual.mjs --check',
  );
  assert.equal(packageJson.scripts['ui:approve'], 'node scripts/record-ui-approval.mjs');
  assert.equal(packageJson.scripts['ui:check'], 'node scripts/check-ui-approval.mjs');
  assert.equal(packageJson.scripts['test:live'], 'node tests/live-room-smoke.js');
  assert.equal(packageJson.scripts['verify:live-version'], 'node scripts/verify-live-version.mjs');
  assert.equal(packageJson.scripts['deploy:dry'], 'wrangler deploy --dry-run');
});
