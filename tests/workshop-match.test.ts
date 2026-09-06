import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPARISONS } from '../src/data/comparisons';
import { TASKS, TASK_KINDS } from '../src/data/tasks';
import {
  directoryCardMatches,
  findClosestCompares,
  findExactCompare,
  selectFinderTools,
  taskRefs,
  tasksForCompare,
  tasksForTool,
} from '../src/lib/workshop-match';
import { AI_TOOLS } from '../src/lib/ai-tools';
import { categorySlug } from '../src/lib/tool-directory';

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

  it('keeps every linked tool in finder results, not just the first 16 alphabetically', () => {
    const catalog = AI_TOOLS.map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      category: tool.category,
    })).sort((left, right) => left.name.localeCompare(right.name));
    const selected = selectFinderTools(catalog, TASKS, categorySlug);
    const slugs = new Set(selected.map((tool) => tool.slug));

    assert.ok(slugs.has('n8n'), 'automate-a-workflow should still surface n8n');
    assert.ok(slugs.has('perplexity'), 'research-a-topic should still surface Perplexity');
    assert.ok(slugs.has('notebooklm'), 'research-a-topic should still surface NotebookLM');
    assert.ok(selected.length > 16, 'finder membership should not be a 16-tool alphabetical slice');

    for (const task of TASKS) {
      const refs = taskRefs(task);
      if (refs.toolSlugs.length === 0 && refs.categorySlugs.length === 0) continue;
      const hits = selected.filter((tool) => tasksForTool(tool.slug, categorySlug(tool.category), [task]).includes(task.slug));
      assert.ok(hits.length > 0, `${task.slug} should have at least one finder tool`);
    }
  });
});

describe('directory filter', () => {
  it('matches query and category together', () => {
    assert.equal(directoryCardMatches('claude', 'AI Assistants', 'claude long-form writing', 'AI Assistants'), true);
    assert.equal(directoryCardMatches('claude', 'Research', 'claude long-form writing', 'AI Assistants'), false);
    assert.equal(directoryCardMatches('banana', 'All', 'claude long-form writing', 'AI Assistants'), false);
  });
});
