import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingEnabled,
  estimateApiCost,
  estimateCredits,
  generationEnabled,
  getStripeConfig,
  maxDailyVideoSpend,
  safeRelativePath,
  validateProjectInput,
} from '../src/lib/video-studio/server';

test('billing stays off unless the exact feature flag is true', () => {
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'false', VIDEO_STRIPE_SECRET_KEY: 'sk_test_example' }), false);
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'TRUE' }), false);
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'true' }), true);
});

test('Stripe wiring enforces matching test and live credentials', () => {
  const prices = JSON.stringify({ trial: 'price_trial', starter: 'price_starter' });
  assert.throws(() => getStripeConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'live',
    VIDEO_STRIPE_SECRET_KEY: 'sk_test_example',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }), /live-mode API credential/i);
  assert.throws(() => getStripeConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'test',
    VIDEO_STRIPE_SECRET_KEY: 'sk_live_never_allowed',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }), /test-mode API credential/i);
  assert.equal(getStripeConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'test',
    VIDEO_STRIPE_SECRET_KEY: 'rk_test_restricted',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }).mode, 'test');
  assert.equal(getStripeConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'live',
    VIDEO_STRIPE_SECRET_KEY: 'sk_live_example',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }).mode, 'live');
});

test('Stripe wiring requires only the single-plan intro and monthly prices', () => {
  assert.throws(() => getStripeConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'test',
    VIDEO_STRIPE_SECRET_KEY: 'sk_test_example',
    VIDEO_STRIPE_PRICE_IDS_JSON: JSON.stringify({ trial: 'price_trial' }),
  }), /starter/i);
});

test('generation requires the kill switch and both n8n connector values', () => {
  assert.equal(generationEnabled({ VIDEO_GENERATION_ENABLED: 'false' }), false);
  assert.equal(generationEnabled({ VIDEO_GENERATION_ENABLED: 'true' }), false);
  assert.equal(generationEnabled({
    VIDEO_GENERATION_ENABLED: 'true',
    VIDEO_N8N_WEBHOOK_URL: 'https://n8n.example/webhook/video',
    VIDEO_N8N_SERVICE_SECRET: 'test-secret',
  }), true);
});

test('credit estimates scale by duration and resolution', () => {
  assert.equal(estimateCredits({ durationSeconds: 30, resolution: '480p' }), 10);
  assert.equal(estimateCredits({ durationSeconds: 30, resolution: '720p' }), 15);
  assert.equal(estimateCredits({ durationSeconds: 30, resolution: '1080p' }), 25);
});

test('API cost estimates and the daily cap are conservative and configurable', () => {
  assert.equal(estimateApiCost(1), 0.25);
  assert.equal(estimateApiCost(10), 1.2);
  assert.equal(maxDailyVideoSpend({}), 5);
  assert.equal(maxDailyVideoSpend({ VIDEO_MAX_DAILY_SPEND_USD: '12.50' }), 12.5);
  assert.equal(maxDailyVideoSpend({ VIDEO_MAX_DAILY_SPEND_USD: '-1' }), 5);
});

test('project input accepts HTTPS URLs and rejects unsafe schemes', () => {
  const valid = validateProjectInput({
    sourceType: 'url',
    sourceUrl: 'https://example.com/product',
    durationSeconds: 30,
    resolution: '480p',
    aspectRatio: '9:16',
  });
  assert.equal(valid.sourceUrl, 'https://example.com/product');
  assert.throws(() => validateProjectInput({ sourceType: 'url', sourceUrl: 'javascript:alert(1)' }), /valid HTTPS/i);
  assert.throws(() => validateProjectInput({ sourceType: 'brief', brief: 'too short' }), /12 characters/i);
});

test('post-auth redirects remain local to The Tool Shed', () => {
  assert.equal(safeRelativePath('/app/video-studio?tab=projects'), '/app/video-studio?tab=projects');
  assert.equal(safeRelativePath('//evil.example'), '/app/video-studio');
  assert.equal(safeRelativePath('https://evil.example'), '/app/video-studio');
});
