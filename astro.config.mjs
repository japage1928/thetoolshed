// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

const site = process.env.PUBLIC_SITE_URL || 'https://thetoolshed.netlify.app';

export default defineConfig({
  site,
  output: 'server',
  adapter: netlify(),
  integrations: [
    sitemap({ filter: (page) => !page.includes('/api/') }),
    mdx(),
  ],
});
