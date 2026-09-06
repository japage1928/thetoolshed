export const SITE_NAME = 'The Tool Shed';
export const SITE_DESCRIPTION =
  'The Tool Shed helps people pick the right AI tools for a real job, understand the true cost, and put them to work — without the hype.';
export const SITE_VALUE_PROP =
  'Walk in with a task. Walk out with a tool (or stack), a clear cost picture, and a practical way to get the job done.';

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
