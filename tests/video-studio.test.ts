import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchVideoEmail } from '../src/lib/video-studio/email';
import { buildProductIdentityLock, mergeUserConfirmation } from '../src/lib/video-studio/grounding';
import {
  billingEnabled,
  estimateApiCost,
  estimateCredits,
  generationEnabled,
  getStripeTestConfig,
  maxDailyVideoSpend,
  safeRelativePath,
  validateProjectInput,
} from '../src/lib/video-studio/server';

test('billing stays off unless the exact feature flag is true', () => {
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'false', VIDEO_STRIPE_SECRET_KEY: 'sk_test_example' }), false);
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'TRUE' }), false);
  assert.equal(billingEnabled({ VIDEO_BILLING_ENABLED: 'true' }), true);
});

test('Stripe wiring rejects live keys and non-test mode', () => {
  const prices = JSON.stringify({ trial: 'price_trial', starter: 'price_starter', creator: 'price_creator', topup: 'price_topup' });
  assert.throws(() => getStripeTestConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'live',
    VIDEO_STRIPE_SECRET_KEY: 'sk_test_example',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }), /test mode/i);
  assert.throws(() => getStripeTestConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'test',
    VIDEO_STRIPE_SECRET_KEY: 'sk_live_never_allowed',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }), /test secret/i);
  assert.equal(getStripeTestConfig({
    VIDEO_BILLING_ENABLED: 'true',
    VIDEO_STRIPE_MODE: 'test',
    VIDEO_STRIPE_SECRET_KEY: 'rk_test_restricted_example',
    VIDEO_STRIPE_PRICE_IDS_JSON: prices,
  }).secretKey, 'rk_test_restricted_example');
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

test('Stanley confirmation is grounded only in the current project identity', () => {
  const result = mergeUserConfirmation({
    name: 'Stanley Quencher H2.0 FlowState Stainless Steel Vacuum Insulated Tumbler',
    primaryImageUrl: 'https://m.media-amazon.com/images/I/41ryNvEnNCL._AC_SL1500_.jpg',
    sku: 'B0CP9Z56SW',
  }, {
    productName: 'Stanley Quencher H2.0 FlowState',
    brand: 'Stanley',
    model: 'Quencher H2.0 FlowState',
    variant: 'handled insulated tumbler with straw',
    color: 'light/pale pink',
  }, 1);

  assert.equal(result.confidence, 0.98);
  assert.deepEqual({
    brand: result.identity.brand,
    model: result.identity.model,
    variant: result.identity.variant,
    color: result.identity.color,
  }, {
    brand: 'Stanley',
    model: 'Quencher H2.0 FlowState',
    variant: 'handled insulated tumbler with straw',
    color: 'light/pale pink',
  });
  const lock = buildProductIdentityLock(result.identity, [result.identity.primaryImageUrl!]);
  assert.match(lock, /Stanley/);
  assert.doesNotMatch(lock, /LEVN|headset/i);
});

test('a clean project identity cannot inherit fields from a previous project', () => {
  const priorProject = {
    name: 'LEVN Wireless Headset',
    brand: 'LEVN',
    model: 'LE-HS011 Superior',
    variant: 'over-ear headset',
    color: 'black',
  };
  const newProject = mergeUserConfirmation({ name: '' }, {}, 0);

  assert.deepEqual(newProject.identity, {
    name: '',
    brand: undefined,
    model: undefined,
    variant: undefined,
    color: undefined,
    userNotes: undefined,
    evidence: ['user_confirmation'],
  });
  assert.equal(newProject.confidence, 0);
  assert.notDeepEqual(newProject.identity, priorProject);
});


test('transactional email dispatch is a safe no-op until the gateway is configured', async () => {
  const previous = process.env.VIDEO_EMAIL_WEBHOOK_URL;
  delete process.env.VIDEO_EMAIL_WEBHOOK_URL;
  try {
    const result = await dispatchVideoEmail({
      event_id: 'test:welcome',
      event_type: 'welcome',
      user_id: 'test-user',
      email: 'customer@example.com',
    });
    assert.deepEqual(result, { configured: false, accepted: false, duplicate: false });
  } finally {
    if (previous === undefined) delete process.env.VIDEO_EMAIL_WEBHOOK_URL;
    else process.env.VIDEO_EMAIL_WEBHOOK_URL = previous;
  }
});
