import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptSecret,
  encryptSecret,
  looksLikeUrl,
  secureEqual,
  validTimezone,
  validatePostContent,
} from '../src/lib/evergreen-x/server';

process.env.EVERGREEN_X_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

test('URL preview classifier detects protocol, www, and bare domains', () => {
  assert.equal(looksLikeUrl('Read https://example.com/post'), true);
  assert.equal(looksLikeUrl('Read www.example.com/post'), true);
  assert.equal(looksLikeUrl('Read example.com/post'), true);
  assert.equal(looksLikeUrl('Plain evergreen text only'), false);
});

test('post validation rejects blank and oversized content', () => {
  assert.throws(() => validatePostContent('   '), /cannot be empty/i);
  assert.throws(() => validatePostContent('x'.repeat(281)), /280-character/i);
  assert.equal(validatePostContent(' Evergreen post '), 'Evergreen post');
});

test('timezone validation accepts IANA zones and rejects nonsense', () => {
  assert.equal(validTimezone('America/Detroit'), true);
  assert.equal(validTimezone('Not/A_Timezone'), false);
});

test('AES-GCM token vault round-trips without storing plaintext', () => {
  const token = 'super-secret-oauth-token';
  const encrypted = encryptSecret(token);
  assert.notEqual(encrypted, token);
  assert.equal(encrypted.startsWith('v1.'), true);
  assert.equal(decryptSecret(encrypted), token);
});

test('service secret comparison is timing-safe for equal-length values', () => {
  assert.equal(secureEqual('abc123', 'abc123'), true);
  assert.equal(secureEqual('abc123', 'abc124'), false);
  assert.equal(secureEqual('short', 'much-longer'), false);
});
