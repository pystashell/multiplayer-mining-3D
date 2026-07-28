import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  projectRoot,
  renderUiManual,
} from './ui-approval-lib.mjs';

const outputPath = path.join(projectRoot, 'docs', 'PREDEPLOY_UI_MANUAL.md');
const output = renderUiManual();

if (process.argv.includes('--check')) {
  let existing = '';
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    throw new Error('docs/PREDEPLOY_UI_MANUAL.md is missing; run npm run ui:manual');
  }
  if (existing !== output) {
    throw new Error('UI manual is stale; run npm run ui:manual');
  }
  console.log('UI manual is current.');
} else {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  console.log('Generated docs/PREDEPLOY_UI_MANUAL.md.');
}
