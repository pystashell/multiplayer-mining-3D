// The site ships its own tab icon: an SVG for browsers that take vector icons
// and a multi-size ICO for the rest, and for clients that request
// /favicon.ico directly. Without them every visit logged a 404.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicFile = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url));
const indexSource = publicFile('index.html').toString('utf8');

test('the page declares an SVG icon with a 32-pixel ICO fallback', () => {
  assert.match(indexSource, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.match(indexSource, /<link rel="icon" href="favicon\.ico" sizes="32x32">/);
});

test('the SVG icon is a self-contained square vector image', () => {
  const svg = publicFile('favicon.svg').toString('utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32">/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.doesNotMatch(svg, /<script|href=|url\(/i, 'the icon references nothing outside itself');
});

test('the ICO bundles 16, 32, and 48 pixel PNG images that match their entries', () => {
  const ico = publicFile('favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1, 'icon resource type');
  const sizes = [];
  for (let index = 0; index < ico.readUInt16LE(4); index += 1) {
    const entry = 6 + index * 16;
    const width = ico.readUInt8(entry) || 256;
    const height = ico.readUInt8(entry + 1) || 256;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + length <= ico.length, `entry ${index} stays inside the file`);
    const png = ico.subarray(offset, offset + length);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', `entry ${index} holds a PNG`);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height], `entry ${index} size`);
    sizes.push(width);
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});
