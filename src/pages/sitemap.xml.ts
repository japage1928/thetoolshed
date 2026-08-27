import type { APIRoute } from 'astro';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const base = 'https://thetoolshed.work';
const staticPaths = ['/', '/tools', '/prompts', '/blog', '/workflows', '/privacy-policy', '/about', '/saas-tools'];

function xmlFor(urls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>`;
}

function asList(value: unknown): { slug?: string }[] {
  return Array.isArray(value) ? value : [];
}

export const GET: APIRoute = async () => {
  const urls = new Set(staticPaths.map((path) => `${base}${path}`));
  try {
    const mod = await import('../lib/supabase');
    const [tools, prompts, posts, workflows] = await Promise.all([
      Promise.resolve(mod.getTools()).catch(() => []),
      Promise.resolve(mod.getPrompts()).catch(() => []),
      Promise.resolve(mod.getPublishedPosts()).catch(() => []),
      Promise.resolve(mod.getWorkflows()).catch(() => []),
    ]);
    asList(tools).forEach((item) => {
      if (item?.slug) urls.add(`${base}/tools/${encodeURIComponent(item.slug)}`);
    });
    asList(prompts).forEach((item) => {
      if (item?.slug) urls.add(`${base}/prompts/${encodeURIComponent(item.slug)}`);
    });
    asList(posts).forEach((item) => {
      if (item?.slug) urls.add(`${base}/blog/${encodeURIComponent(item.slug)}`);
    });
    asList(workflows).forEach((item) => {
      if (item?.slug) urls.add(`${base}/workflows/${encodeURIComponent(item.slug)}`);
    });
  } catch {
    // keep static URLs
  }
  return new Response(xmlFor([...urls]), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};
