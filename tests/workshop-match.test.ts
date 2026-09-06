import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPARISONS } from '../src/data/comparisons';
import { TASKS, TASK_KINDS } from '../src/data/tasks';
import {
  directoryCardMatches,
  findClosestCompares,
  findExactCompare,
  taskRefs,
  tasksForCompare,
  tasksForTool,
} from '../src/lib/workshop-match';

describe('task refs', () => {
  it('extracts compare, tool, category, and how-to links', () => {
    const write = TASKS.find((task) => task.slug === 'write-client-content');
    assert.ok(write);
    const refs = taskRefs(write);
    assert.ok(refs.compareSlugs.includes('chatgpt-vs-claude-vs-grok'));
    assert.ok(refs.toolSlugs.includes('chatgpt'));
    assert.ok(refs.toolSlugs.includes('claude'));
  });

  it('keeps a kind on every starter task', () => {
    for (const task of TASKS) {
      assert.ok((TASK_KINDS as readonly string[]).includes(task.kind), `${task.slug} missing kind`);
    }
  });
});

describe('compare picker matching', () => {
  it('finds the written ChatGPT vs Claude pair', () => {
    const exact = findExactCompare('chatgpt', 'claude', COMPARISONS);
    assert.equal(exact?.slug, 'chatgpt-vs-claude');
  });

  it('does not invent a pair we have not written', () => {
    const exact = findExactCompare('n8n', 'midjourney', COMPARISONS);
    assert.equal(exact, undefined);
    const closest = findClosestCompares('n8n', 'midjourney', COMPARISONS);
    assert.equal(closest.reason, 'none');
    assert.equal(closest.closest.length, 0);
  });

  it('points unmatched pairs at the closest shared-tool compare', () => {
    const closest = findClosestCompares('chatgpt', 'notebooklm', COMPARISONS);
    assert.equal(closest.reason, 'shared-tool');
    assert.ok(closest.closest.some((item) => item.toolSlugs.includes('chatgpt')));
  });
});

describe('finder membership', () => {
  it('maps flagship compares back to jobs', () => {
    const slugs = tasksForCompare('perplexity-vs-chatgpt', TASKS);
    assert.ok(slugs.includes('research-a-topic'));
  });

  it('maps category tools back to jobs', () => {
    const slugs = tasksForTool('n8n', 'automation', TASKS);
    assert.ok(slugs.includes('automate-a-workflow'));
  });
});

describe('directory filter', () => {
  it('matches query and category together', () => {
    assert.equal(directoryCardMatches('claude', 'AI Assistants', 'claude long-form writing', 'AI Assistants'), true);
    assert.equal(directoryCardMatches('claude', 'Research', 'claude long-form writing', 'AI Assistants'), false);
    assert.equal(directoryCardMatches('banana', 'All', 'claude long-form writing', 'AI Assistants'), false);
  });
});
