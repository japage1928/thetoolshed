import type { Comparison } from '../data/comparisons';
import type { TaskChip } from '../data/tasks';

export type TaskRefs = {
  compareSlugs: string[];
  toolSlugs: string[];
  categorySlugs: string[];
  howToHrefs: string[];
};

export type ComparePickResult = {
  exact: Comparison | null;
  closest: Comparison[];
  reason: 'exact' | 'shared-tool' | 'none';
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function refsFromHrefs(hrefs: string[]): TaskRefs {
  const compareSlugs: string[] = [];
  const toolSlugs: string[] = [];
  const categorySlugs: string[] = [];
  const howToHrefs: string[] = [];

  for (const raw of hrefs) {
    const href = raw.split('#')[0] ?? raw;
    if (href.startsWith('/compare/') && href.length > '/compare/'.length) {
      compareSlugs.push(href.slice('/compare/'.length).replace(/\/$/, ''));
    } else if (href.startsWith('/tools/category/')) {
      categorySlugs.push(href.slice('/tools/category/'.length).replace(/\/$/, ''));
    } else if (href.startsWith('/tools/') && href.length > '/tools/'.length) {
      toolSlugs.push(href.slice('/tools/'.length).replace(/\/$/, ''));
    } else if (href.startsWith('/how-to')) {
      howToHrefs.push(href);
    }
  }

  return {
    compareSlugs: unique(compareSlugs),
    toolSlugs: unique(toolSlugs),
    categorySlugs: unique(categorySlugs),
    howToHrefs: unique(howToHrefs),
  };
}

export function taskRefs(task: Pick<TaskChip, 'href' | 'links'>): TaskRefs {
  return refsFromHrefs([task.href, ...task.links.map((link) => link.href)]);
}

export function tasksForCompare(slug: string, tasks: TaskChip[]): string[] {
  return tasks
    .filter((task) => {
      const refs = taskRefs(task);
      return refs.compareSlugs.includes(slug) || task.href === `/compare/${slug}` || task.href === '/compare';
    })
    .map((task) => task.slug);
}

export function tasksForTool(slug: string, categorySlugValue: string, tasks: TaskChip[]): string[] {
  return tasks
    .filter((task) => {
      const refs = taskRefs(task);
      return refs.toolSlugs.includes(slug) || refs.categorySlugs.includes(categorySlugValue);
    })
    .map((task) => task.slug);
}

export function findExactCompare(a: string, b: string, comparisons: Comparison[]): Comparison | undefined {
  if (!a || !b || a === b) return undefined;
  return comparisons
    .filter((item) => item.toolSlugs.includes(a) && item.toolSlugs.includes(b))
    .sort((left, right) => left.toolSlugs.length - right.toolSlugs.length || left.title.localeCompare(right.title))[0];
}

export function findClosestCompares(a: string, b: string, comparisons: Comparison[], limit = 2): ComparePickResult {
  const exact = findExactCompare(a, b, comparisons) ?? null;
  if (exact) {
    return { exact, closest: [exact], reason: 'exact' };
  }

  const scored = comparisons
    .map((item) => {
      let score = 0;
      if (a && item.toolSlugs.includes(a)) score += 2;
      if (b && item.toolSlugs.includes(b)) score += 2;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));

  if (scored.length > 0) {
    return {
      exact: null,
      closest: scored.slice(0, limit).map((entry) => entry.item),
      reason: 'shared-tool',
    };
  }

  return { exact: null, closest: [], reason: 'none' };
}

export function directoryCardMatches(query: string, category: string, searchBlob: string, toolCategory: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const categoryOk = !category || category === 'All' || toolCategory === category;
  const queryOk = !normalizedQuery || searchBlob.includes(normalizedQuery);
  return categoryOk && queryOk;
}

type FinderTool = {
  slug: string;
  name: string;
  category: string;
};

/**
 * Homepage finder membership: every task keeps its linked tools and
 * category matches. Do not apply a global alphabetical cap — that drops
 * later-sorting jobs (automation, research) from the live results.
 */
export function selectFinderTools<T extends FinderTool>(
  tools: T[],
  tasks: TaskChip[],
  toCategorySlug: (category: string) => string,
): T[] {
  const bySlug = new Map(tools.map((tool) => [tool.slug, tool]));
  const byCategory = new Map<string, T[]>();
  for (const tool of tools) {
    const key = toCategorySlug(tool.category);
    const list = byCategory.get(key) ?? [];
    list.push(tool);
    byCategory.set(key, list);
  }

  const selected = new Map<string, T>();
  for (const task of tasks) {
    const refs = taskRefs(task);
    for (const slug of refs.toolSlugs) {
      const tool = bySlug.get(slug);
      if (tool) selected.set(tool.slug, tool);
    }
    for (const category of refs.categorySlugs) {
      for (const tool of byCategory.get(category) ?? []) {
        selected.set(tool.slug, tool);
      }
    }
  }

  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name));
}
