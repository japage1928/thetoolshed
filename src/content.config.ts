import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every published article is a single Markdown (or MDX) file in
// src/content/blog/<slug>.md. The filename IS the slug. This schema is
// the contract the n8n publish endpoint (src/pages/api/blog/publish.ts)
// writes against — keep the two in sync if you add fields.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase-kebab-case'),
    publishedDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string().min(1),
    tags: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    author: z.string().default('TheToolShed Team'),

    // Media
    featuredImage: z.string().optional(),
    featuredImageAlt: z.string().optional(),

    // SEO overrides (fall back to title/description when absent)
    seoTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(300).optional(),

    // Source attribution — where the AI pipeline drew the article from
    sourceArticle: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    sources: z
      .array(
        z.object({
          title: z.string().optional(),
          url: z.string().url(),
        }),
      )
      .default([]),

    // Slugs of other posts in this collection this article links to.
    // Used to render an "internal links" block and to keep the AI
    // pipeline from ever inventing URLs — every entry here must match
    // a slug already present in the content index.
    internalLinks: z.array(z.string()).default([]),

    // Publishing status
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
