import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_NAME, SITE_DESCRIPTION } from '../lib/site';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime(),
  );

  return rss({
    title: `${SITE_NAME} Blog`,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedDate,
      link: `/blog/${post.data.slug}/`,
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: '<language>en-us</language>',
  });
}
