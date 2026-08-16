// @ts-check
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

const site = process.env.PUBLIC_SITE_URL || 'https://example.netlify.app';

export default defineConfig({
  site,
  output: 'static',
  adapter: netlify(),
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/api/'),
    }),
    mdx(),
  ],
  env: {
    schema: {
      // Secret server-only vars, read via `astro:env/server`. Never
      // bundled into client/static output, resolved at request time
      // from the Netlify Function's process env — see .env.example.
      BLOG_PUBLISH_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_OWNER: envField.string({
        context: 'server',
        access: 'secret',
        default: 'japage1928',
      }),
      GITHUB_REPO: envField.string({
        context: 'server',
        access: 'secret',
        default: 'thetoolshed',
      }),
      GITHUB_BRANCH: envField.string({
        context: 'server',
        access: 'secret',
        default: 'main',
      }),
    },
  },
});
