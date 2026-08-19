import type { APIRoute } from 'astro';
import { getPublishedPosts, getPrompts, getTools, getWorkflows } from '../lib/supabase';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() ?? 'https://thetoolshed.work').replace(/\/$/, '');
  const staticPaths = ['/', '/tools', '/prompts', '/templates', '/blog', '/about', '/privacy-policy'];
  const [tools, workflows, prompts, posts] = await Promise.all([
    getTools(),
    getWorkflows(),
    getPrompts(),
    getPublishedPosts(),
  ]);

  const urls = new Set(staticPaths.map((path) => `${base}${path}`));
  tools.forEach((item) => urls.add(`${base}/tools/${encodeURIComponent(item.slug)}`));
  workflows.forEach((item) => urls.add(`${base}/templates/${encodeURIComponent(item.slug)}`));
  prompts.forEach((item) => urls.add(`${base}/prompts/${encodeURIComponent(item.slug)}`));
  posts.forEach((item) => urls.add(`${base}/blog/${encodeURIComponent(item.slug)}`));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls]
    .map((url) => `<url><loc>${esc(url)}</loc></url>`)
    .join('')}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
