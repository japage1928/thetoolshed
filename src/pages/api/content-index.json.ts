import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Generated fresh on every build, so it always reflects exactly what's
// published in src/content/blog at build time. The n8n pipeline should
// fetch this before writing internalLinks so it never invents a URL that
// doesn't exist on the site.
export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime(),
  );

  const articles = posts.map((post) => {
    const path = `/blog/${post.data.slug}`;
    return {
      title: post.data.title,
      slug: post.data.slug,
      url: new URL(path, site).toString(),
      category: post.data.category,
      tags: post.data.tags,
      keywords: post.data.keywords,
      summary: post.data.description,
      publishedDate: post.data.publishedDate.toISOString(),
      updatedDate: post.data.updatedDate
        ? post.data.updatedDate.toISOString()
        : null,
    };
  });

  const body = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: articles.length,
      articles,
    },
    null,
    2,
  );

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
