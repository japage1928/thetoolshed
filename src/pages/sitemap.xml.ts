import type { APIRoute } from 'astro';
import { getPublishedPosts, getPrompts, getTools, getWorkflows } from '../lib/supabase';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const base = 'https://thetoolshed.work';

async function safe<T>(fn: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const GET: APIRoute = async () => {
  const staticPaths = [
    '/',
    '/tools',
    '/prompts',
    '/blog',
    '/workflows',
    '/privacy-policy',
  ];
  try {
    const [tools, prompts, posts, workflows] = await Promise.all([
      safe(() => getTools()),
      safe(() => getPrompts()),
      safe(() => getPublishedPosts()),
      safe(() => getWorkflows()),
    ]);
    const urls = new Set(staticPaths.map((path) => `${base}${path}`));
    tools.forEach((item) => urls.add(`${base}/tools/${encodeURIComponent(item.slug)}`));
    prompts.forEach((item) => urls.add(`${base}/prompts/${encodeURIComponent(item.slug)}`));
    posts.forEach((item) => urls.add(`${base}/blog/${encodeURIComponent(item.slug)}`));
    workflows.forEach((item) => urls.add(`${base}/workflows/${encodeURIComponent(item.slug)}`));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map((url) => `<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
  } catch {
    const urls = staticPaths.map((path) => `${base}${path}`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  }
};
