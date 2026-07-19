import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import worker, { withSecurityHeaders } from '../worker/index.js';

const expectedHeaders = {
  'content-security-policy': [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws: wss:",
  ],
  'permissions-policy': ['camera=()', 'geolocation=()', 'microphone=()', 'payment=()', 'usb=()'],
  'referrer-policy': ['no-referrer'],
  'strict-transport-security': ['max-age=31536000', 'includeSubDomains'],
  'x-content-type-options': ['nosniff'],
  'x-frame-options': ['DENY'],
};

function assertSecurityHeaders(response) {
  for (const [name, fragments] of Object.entries(expectedHeaders)) {
    const value = response.headers.get(name);
    assert.ok(value, `${name} should be present`);
    for (const fragment of fragments) {
      assert.ok(value.includes(fragment), `${name} should include ${fragment}`);
    }
  }
}

function staticEnvironment(responseFactory) {
  return {
    ASSETS: {
      fetch: async (request) => responseFactory(request),
    },
  };
}

test('Cloudflare static-asset bypasses receive the same security baseline via _headers', () => {
  const source = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const fragments of Object.values(expectedHeaders)) {
    for (const fragment of fragments) assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /\/vendor\/three-0\.150\.0\/\*/);
  assert.match(source, /Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(source, /googleapis|gstatic|jsdelivr/);
});

test('HTML responses receive browser security headers and must be revalidated', async () => {
  const env = staticEnvironment(() => new Response('<!doctype html>', {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/html; charset=utf-8',
    },
  }));

  const response = await worker.fetch(new Request('https://game.example/'), env);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<!doctype html>');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assertSecurityHeaders(response);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /googleapis|gstatic|jsdelivr/);
});

test('API responses retain no-store and receive the same security baseline', async () => {
  const response = await worker.fetch(
    new Request('https://game.example/api/health'),
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, service: '3d-multiplayer-mining' });
  assertSecurityHeaders(response);
});

test('versioned self-hosted vendor assets receive long-lived immutable caching', async () => {
  const env = staticEnvironment(() => new Response('export const version = 1;', {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  }));

  for (const pathname of [
    '/vendor/three-0.150.0/build/three.module.js',
    '/vendor/fonts/inter-5.2.8/inter.woff2',
    '/vendor/library/1.2.3/module.js',
  ]) {
    const response = await worker.fetch(new Request(`https://game.example${pathname}`), env);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assertSecurityHeaders(response);
  }
});

test('unversioned vendor paths are not accidentally made immutable', async () => {
  const env = staticEnvironment(() => new Response('asset', {
    headers: { 'Cache-Control': 'public, max-age=600' },
  }));

  const response = await worker.fetch(
    new Request('https://game.example/vendor/current/module.js'),
    env,
  );

  assert.equal(response.headers.get('cache-control'), 'public, max-age=600');
  assertSecurityHeaders(response);
});

test('WebSocket upgrade responses are returned unchanged', () => {
  const upgrade = {
    status: 101,
    webSocket: { accepted: true },
    headers: new Headers({ Upgrade: 'websocket' }),
  };

  const secured = withSecurityHeaders(
    upgrade,
    new Request('https://game.example/api/rooms/ABC234/socket'),
  );

  assert.strictEqual(secured, upgrade);
  assert.equal(secured.headers.get('content-security-policy'), null);
});

test('the public socket route preserves a successful 101 upgrade response', async () => {
  const upgrade = {
    status: 101,
    webSocket: { accepted: true },
    headers: new Headers({ Upgrade: 'websocket' }),
  };
  const env = {
    GAME_ROOMS: {
      getByName: () => ({ fetch: async () => upgrade }),
    },
  };

  const response = await worker.fetch(new Request('https://game.example/api/rooms/ABC234/socket', {
    headers: {
      Origin: 'https://game.example',
      Upgrade: 'websocket',
    },
  }), env);

  assert.strictEqual(response, upgrade);
});

test('HTTP rejections on the WebSocket path still receive security headers', async () => {
  const response = await worker.fetch(new Request('https://game.example/api/rooms/ABC234/socket', {
    headers: {
      Origin: 'https://attacker.example',
      Upgrade: 'websocket',
    },
  }), {});

  assert.equal(response.status, 403);
  assertSecurityHeaders(response);
});

test('thrown HTTP errors are also covered by the security baseline', async () => {
  const response = await worker.fetch(new Request('https://game.example/api/rooms', {
    method: 'POST',
    headers: {
      'Content-Length': '5000',
      Origin: 'https://game.example',
    },
    body: '{}',
  }), {});

  assert.equal(response.status, 413);
  assertSecurityHeaders(response);
});
