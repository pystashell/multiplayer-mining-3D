// Lists every Three.js export the browser code names (THREE.X, including the
// MOUSE and TOUCH members it binds) and checks the vendored build still
// provides it. A Three.js upgrade that removes or renames one then fails with
// the exact names, instead of as a blank canvas in the browser tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const publicDirectory = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('vendor/manifest.json', publicDirectory), 'utf8'));
const vendoredFile = (pattern) => manifest.files.find((file) => pattern.test(file));
const THREE = await import(new URL(vendoredFile(/^vendor\/three-[^/]+\/build\/three\.module\.js$/), publicDirectory));
const { OrbitControls } = await import(new URL(vendoredFile(/\/controls\/OrbitControls\.js$/), publicDirectory));

const browserSources = readdirSync(publicDirectory)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, source: readFileSync(new URL(file, publicDirectory), 'utf8') }));

function namesUsed(pattern) {
  const found = new Map();
  for (const { file, source } of browserSources) {
    for (const match of source.matchAll(pattern)) {
      const name = match.slice(1).join('.');
      found.set(name, [...(found.get(name) ?? []), file]);
    }
  }
  return found;
}

test('the vendored Three.js build exports every class, constant, and enum the game uses', () => {
  const exportsUsed = namesUsed(/\bTHREE\.([A-Za-z_][A-Za-z0-9_]*)\b/g);
  assert.ok(exportsUsed.size >= 30, `found only ${exportsUsed.size} Three.js names in public/*.js`);
  const missing = [...exportsUsed].filter(([name]) => THREE[name] === undefined)
    .map(([name, files]) => `THREE.${name} (${[...new Set(files)].join(', ')})`);
  assert.deepEqual(missing, [], 'Three.js no longer exports these names');

  const enumMembers = namesUsed(/\bTHREE\.(MOUSE|TOUCH)\.([A-Z_]+)\b/g);
  assert.ok(enumMembers.size >= 5);
  const missingMembers = [...enumMembers.keys()].filter((path) => {
    const [group, member] = path.split('.');
    return THREE[group]?.[member] === undefined;
  });
  assert.deepEqual(missingMembers, [], 'Three.js no longer defines these input bindings');
});

test('the vendored OrbitControls module exports the camera controller the game constructs', () => {
  assert.equal(typeof OrbitControls, 'function');
  const app = browserSources.find(({ file }) => file === 'app.js').source;
  assert.match(app, /new OrbitControls\(this\.camera, this\.renderer\.domElement\)/);
});
