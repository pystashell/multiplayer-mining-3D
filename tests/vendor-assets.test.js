import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const orbitControlsSource = readFileSync(
  new URL('../public/vendor/three-0.150.0/examples/jsm/controls/OrbitControls.js', import.meta.url),
  'utf8',
);

const expectedVendorFiles = [
  'public/vendor/game-core/room-engine.js',
  'public/vendor/game-core/beginner-layout.js',
  'public/vendor/three-0.150.0/build/three.module.js',
  'public/vendor/three-0.150.0/examples/jsm/controls/OrbitControls.js',
  'public/vendor/three-0.150.0/LICENSE',
  'public/vendor/fonts/orbitron-5.2.8/orbitron-latin-800-normal.woff2',
  'public/vendor/fonts/orbitron-5.2.8/orbitron-latin-900-normal.woff2',
  'public/vendor/fonts/orbitron-5.2.8/LICENSE',
  'public/vendor/fonts/share-tech-mono-5.2.7/share-tech-mono-latin-400-normal.woff2',
  'public/vendor/fonts/share-tech-mono-5.2.7/LICENSE',
  'public/vendor/fonts/inter-5.2.8/inter-latin-400-normal.woff2',
  'public/vendor/fonts/inter-5.2.8/inter-latin-600-normal.woff2',
  'public/vendor/fonts/inter-5.2.8/inter-latin-700-normal.woff2',
  'public/vendor/fonts/inter-5.2.8/inter-latin-800-normal.woff2',
  'public/vendor/fonts/inter-5.2.8/LICENSE',
];

test('the application has no runtime Google Fonts or jsDelivr dependency', () => {
  assert.doesNotMatch(indexSource, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.doesNotMatch(indexSource, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(indexSource, /<script\s+type=["']importmap["']/);
  assert.match(appSource, /\.\/vendor\/three-0\.150\.0\/build\/three\.module\.js/);
  assert.match(appSource, /\.\/vendor\/three-0\.150\.0\/examples\/jsm\/controls\/OrbitControls\.js/);
});

test('vendored OrbitControls resolves the local pinned Three.js module', () => {
  assert.doesNotMatch(orbitControlsSource, /from ['"]three['"]/);
  assert.match(orbitControlsSource, /from ['"]\.\.\/\.\.\/\.\.\/build\/three\.module\.js['"]/);
});

test('only the selected local WOFF2 weights are declared', () => {
  const localFontUrls = [...styleSource.matchAll(/url\(['"]?(\.\/vendor\/fonts\/[^)'"\s]+\.woff2)/g)]
    .map((match) => match[1]);
  assert.deepEqual(localFontUrls, [
    './vendor/fonts/orbitron-5.2.8/orbitron-latin-800-normal.woff2',
    './vendor/fonts/orbitron-5.2.8/orbitron-latin-900-normal.woff2',
    './vendor/fonts/share-tech-mono-5.2.7/share-tech-mono-latin-400-normal.woff2',
    './vendor/fonts/inter-5.2.8/inter-latin-400-normal.woff2',
    './vendor/fonts/inter-5.2.8/inter-latin-600-normal.woff2',
    './vendor/fonts/inter-5.2.8/inter-latin-700-normal.woff2',
    './vendor/fonts/inter-5.2.8/inter-latin-800-normal.woff2',
  ]);
});

test('vendored runtime files and upstream licenses are present', () => {
  for (const path of expectedVendorFiles) {
    assert.ok(statSync(new URL(`../${path}`, import.meta.url)).size > 0, `${path} should not be empty`);
  }

  assert.match(
    readFileSync(new URL('../public/vendor/three-0.150.0/LICENSE', import.meta.url), 'utf8'),
    /MIT License/,
  );
  for (const font of ['orbitron-5.2.8', 'share-tech-mono-5.2.7', 'inter-5.2.8']) {
    assert.match(
      readFileSync(new URL(`../public/vendor/fonts/${font}/LICENSE`, import.meta.url), 'utf8'),
      /SIL OPEN FONT LICENSE/,
    );
  }
});
