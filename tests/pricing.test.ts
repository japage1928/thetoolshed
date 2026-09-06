import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRICING_GUIDES, getPricingGuide } from '../src/data/pricing';
import { estimateMonthly, formatUsd, hasEnteredRates, sanitizeAmount, USAGE_PRESETS } from '../src/lib/cost-calculator';
import { toolDomain, toolIconSrc, toolInitials, toolMarkAlt } from '../src/lib/tool-mark';

const PRICE_NUMBER = /\$\s*\d|\d+\.\d{2}\s*(?:\/|per|usd|dollars)?/i;

describe('pricing guides', () => {
  it('covers flagship tools', () => {
    for (const slug of ['chatgpt', 'claude', 'grok', 'perplexity', 'gemini', 'cursor', 'github-copilot', 'n8n']) {
      assert.ok(getPricingGuide(slug), `missing pricing guide ${slug}`);
    }
  });

  it('does not invent dollar amounts as facts', () => {
    for (const guide of PRICING_GUIDES) {
      const text = [
        guide.summary,
        guide.apiNotes,
        ...guide.plans.flatMap((plan) => [plan.name, plan.notes]),
        ...guide.caveats,
      ].join('\n');
      assert.equal(PRICE_NUMBER.test(text), false, `${guide.slug} should not quote prices`);
      assert.ok(guide.pricingUrl.startsWith('https://'), `${guide.slug} needs a vendor pricing URL`);
      assert.ok(guide.plans.length >= 2, `${guide.slug} should describe more than one plan family`);
    }
  });

  it('labels unverified guides', () => {
    const gemini = getPricingGuide('gemini');
    const n8n = getPricingGuide('n8n');
    assert.equal(gemini?.verified, false);
    assert.equal(n8n?.verified, false);
    assert.equal(getPricingGuide('chatgpt')?.verified, true);
  });
});

describe('cost calculator math', () => {
  it('multiplies seats and token assumptions', () => {
    const estimate = estimateMonthly({
      seats: 5,
      seatMonthly: 20,
      inputTokensM: 2,
      outputTokensM: 0.5,
      inputRatePerM: 3,
      outputRatePerM: 15,
    });
    assert.equal(estimate.subscription, 100);
    assert.equal(estimate.api, 13.5);
    assert.equal(estimate.total, 113.5);
    assert.equal(formatUsd(113.5), '$113.50');
  });

  it('treats junk and negatives as zero', () => {
    const estimate = estimateMonthly({
      seats: -2,
      seatMonthly: Number.NaN,
      inputTokensM: -1,
      outputTokensM: Number.POSITIVE_INFINITY,
      inputRatePerM: 3,
      outputRatePerM: 15,
    });
    assert.deepEqual(estimate, { subscription: 0, api: 0, total: 0 });
    assert.equal(sanitizeAmount(-4), 0);
    assert.equal(hasEnteredRates({ seatMonthly: 0, inputRatePerM: 0, outputRatePerM: 0 }), false);
    assert.equal(hasEnteredRates({ seatMonthly: 12, inputRatePerM: 0, outputRatePerM: 0 }), true);
  });

  it('keeps usage presets price-free', () => {
    assert.ok(USAGE_PRESETS.length >= 3);
    for (const preset of USAGE_PRESETS) {
      assert.ok(preset.seats >= 0);
      assert.equal('seatMonthly' in preset, false);
      assert.equal(PRICE_NUMBER.test(preset.notes), false);
    }
  });
});

describe('tool marks', () => {
  it('builds a public favicon URL and initials fallback', () => {
    assert.equal(toolDomain('https://www.anthropic.com/pricing'), 'anthropic.com');
    assert.equal(
      toolIconSrc('https://claude.ai', null, 64),
      'https://www.google.com/s2/favicons?domain=claude.ai&sz=64',
    );
    assert.equal(toolIconSrc('https://claude.ai', 'https://example.com/icon.png'), 'https://example.com/icon.png');
    assert.equal(toolInitials('ChatGPT'), 'CH');
    assert.equal(toolInitials('GitHub Copilot'), 'GC');
    assert.equal(toolMarkAlt('Claude'), 'Claude logo');
  });
});
