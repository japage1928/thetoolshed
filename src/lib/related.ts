import type { CollectionEntry } from 'astro:content';

type BlogEntry = CollectionEntry<'blog'>;

/**
 * Ranks other published posts by topical similarity to `current`:
 * same category outweighs tag overlap, tag overlap outweighs keyword
 * overlap. Returns only entries with a nonzero score, so unrelated
 * posts never show up as fake "related" content.
 */
export function getRelatedArticles(
  current: BlogEntry,
  allPublished: BlogEntry[],
  limit = 3,
): BlogEntry[] {
  const candidates = allPublished.filter((entry) => entry.id !== current.id);

  const currentTags = new Set(current.data.tags.map((t) => t.toLowerCase()));
  const currentKeywords = new Set(
    current.data.keywords.map((k) => k.toLowerCase()),
  );

  const scored = candidates
    .map((entry) => {
      let score = 0;

      if (
        entry.data.category.toLowerCase() ===
        current.data.category.toLowerCase()
      ) {
        score += 3;
      }

      for (const tag of entry.data.tags) {
        if (currentTags.has(tag.toLowerCase())) score += 2;
      }

      for (const kw of entry.data.keywords) {
        if (currentKeywords.has(kw.toLowerCase())) score += 1;
      }

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        b.entry.data.publishedDate.getTime() -
        a.entry.data.publishedDate.getTime()
      );
    });

  return scored.slice(0, limit).map(({ entry }) => entry);
}
