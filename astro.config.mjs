// @ts-check
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

const site = process.env.PUBLIC_SITE_URL || 'https://thetoolshed.netlify.app';

export default defineConfig({
  site,
  output: 'server',
  adapter: netlify(),
  env: {
    schema: {
      BLOG_PUBLISH_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_OWNER: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_REPO: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_BRANCH: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  integrations: [
    sitemap({ filter: (page) => !page.includes('/api/') }),
    mdx(),
  ],
});
