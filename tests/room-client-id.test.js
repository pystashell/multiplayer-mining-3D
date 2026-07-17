import test from 'node:test';
import assert from 'node:assert/strict';

import { createClientRequestId } from '../public/room-client.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uses native randomUUID when the browser provides it', () => {
  const expected = '11111111-2222-4333-8444-555555555555';
  assert.equal(createClientRequestId({ randomUUID: () => expected }), expected);
});

test('uses getRandomValues on insecure mobile HTTP origins without randomUUID', () => {
  let called = 0;
  const id = createClientRequestId({
    getRandomValues(bytes) {
      called += 1;
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    },
  });

  assert.equal(called, 1);
  assert.match(id, UUID_V4);
  assert.equal(id, '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('still creates distinct request IDs when the Crypto API is unavailable', () => {
  const first = createClientRequestId(null);
  const second = createClientRequestId(null);

  assert.match(first, UUID_V4);
  assert.match(second, UUID_V4);
  assert.notEqual(first, second);
});

test('falls through when a partial browser implementation throws', () => {
  const id = createClientRequestId({
    randomUUID() { throw new TypeError('not available in this context'); },
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
  });

  assert.match(id, UUID_V4);
});
