import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_TOOLS } from '../src/lib/ai-tools';
import { isGenericClaim } from '../src/lib/tool-directory';
import { COMPARISONS } from '../src/data/comparisons';
import { TASKS } from '../src/data/tasks';

describe('tool catalog', () => {
  it('keeps existing public slugs', () => {
    const slugs = AI_TOOLS.map((tool) => tool.slug);
    for (const slug of ['chatgpt', 'claude', 'grok', 'perplexity', 'cursor', 'github-copilot', 'claude-code', 'n8n']) {
      assert.ok(slugs.includes(slug), `missing slug ${slug}`);
    }
  });

  it('does not invent generic verified pros for unverified tools', () => {
    const unverified = AI_TOOLS.filter((tool) => (tool.verification_confidence ?? 'unverified') === 'unverified');
    for (const tool of unverified) {
      assert.equal(tool.strengths?.length ?? 0, 0, `${tool.slug} should not have unverified strengths`);
      assert.equal(tool.weaknesses?.length ?? 0, 0, `${tool.slug} should not have unverified weaknesses`);
      assert.equal(tool.pricing_summary, undefined, `${tool.slug} should not claim unverified pricing copy`);
    }
  });

  it('flags generic marketing claims', () => {
    assert.equal(isGenericClaim('Established option for most teams'), true);
    assert.equal(isGenericClaim('Public positioning emphasizes long context'), false);
  });
});

describe('workshop hubs', () => {
  it('ships the three flagship comparisons', () => {
    const slugs = COMPARISONS.map((item) => item.slug);
    assert.deepEqual(slugs.sort(), [
      'chatgpt-vs-claude',
      'chatgpt-vs-claude-vs-grok',
      'perplexity-vs-chatgpt',
    ]);
  });

  it('has a starter task list', () => {
    assert.ok(TASKS.length >= 8);
    assert.ok(TASKS.length <= 12);
  });
});
