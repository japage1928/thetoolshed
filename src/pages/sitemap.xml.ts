import type { APIRoute } from 'astro';

export const prerender = true;

const urls = [
  'https://thetoolshed.work/',
  'https://thetoolshed.work/tools',
  'https://thetoolshed.work/prompts',
  'https://thetoolshed.work/blog',
  'https://thetoolshed.work/workflows',
  'https://thetoolshed.work/privacy-policy',
  'https://thetoolshed.work/about',
  'https://thetoolshed.work/saas-tools',
];

export const GET: APIRoute = async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
