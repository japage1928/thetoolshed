export const SITE_NAME = 'The Toolshed';
export const SITE_DESCRIPTION =
  'Practical guides and insights, published weekly.';

/** Lowercases and hyphenates a candidate slug so minor formatting from
 * an upstream pipeline (extra spaces, mixed case, underscores) doesn't
 * cause an otherwise-valid request to be rejected. */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugifyCategory(category: string): string {
  return category
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
