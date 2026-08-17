import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'astro:content';
import { dump as dumpYaml } from 'js-yaml';
import {
  BLOG_PUBLISH_API_KEY,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
} from 'astro:env/server';
import { createFile, fileExists, GitHubContentError, verifyRepository } from '../../../lib/github';
import { normalizeSlug } from '../../../lib/site';
import { sanitizeArticleContent, sanitizePlainText } from '../../../lib/sanitize';

export const prerender = false;

const SourceSchema = z.union([
  z.string().url(),
  z.object({ title: z.string().optional(), url: z.string().url() }),
]);

const PublishRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  slug: z.string().min(1).max(120),
  content: z.string().min(1).max(200_000),
  publishedDate: z.coerce.date().optional(),
  updatedDate: z.coerce.date().optional(),
  category: z.string().min(1).max(80),
  tags: z.array(z.string().max(60)).max(20).optional(),
  keywords: z.array(z.string().max(60)).max(30).optional(),
  author: z.string().max(120).optional(),
  seoTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(300).optional(),
  featuredImage: z.string().max(2000).optional(),
  featuredImageAlt: z.string().max(300).optional(),
  sourceArticle: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sources: z.array(SourceSchema).max(20).optional(),
  internalLinks: z.array(z.string()).max(20).optional(),
  draft: z.boolean().optional(),
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(request: Request): boolean {
  if (!BLOG_PUBLISH_API_KEY) return false;

  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader && safeCompare(apiKeyHeader, BLOG_PUBLISH_API_KEY)) return true;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (safeCompare(token, BLOG_PUBLISH_API_KEY)) return true;
  }

  return false;
}

function diagnosticMessage(err: unknown): string {
  if (err instanceof GitHubContentError) {
    return err.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  }
  if (err instanceof Error) return err.message.slice(0, 300);
  return 'Unexpected server error.';
}

export const POST: APIRoute = async ({ request, site }) => {
  try {
    if (!isAuthorized(request)) {
      return jsonResponse(401, {
        success: false,
        error: 'unauthorized',
        message: 'Missing or invalid API key.',
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonResponse(400, {
        success: false,
        error: 'invalid_json',
        message: 'Request body must be valid JSON.',
      });
    }

    const parsed = PublishRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(400, {
        success: false,
        error: 'validation_failed',
        message: 'Request body failed validation.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const input = parsed.data;
    const slug = normalizeSlug(input.slug);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return jsonResponse(400, {
        success: false,
        error: 'invalid_slug',
        message: 'slug must reduce to lowercase letters, numbers, and hyphens.',
      });
    }

    if (!GITHUB_TOKEN) {
      return jsonResponse(500, {
        success: false,
        error: 'server_misconfigured',
        message: 'GITHUB_TOKEN is missing from the production function environment.',
      });
    }

    const githubConfig = {
      owner: GITHUB_OWNER || 'japage1928',
      repo: GITHUB_REPO || 'thetoolshed',
      branch: GITHUB_BRANCH || 'claude/astro-blog-publishing-3yd0ix',
      token: GITHUB_TOKEN,
    };
    const contentPath = `src/content/blog/${slug}.md`;
    const baseUrl = site?.toString() || 'https://thetoolshed.netlify.app';
    const canonicalUrl = new URL(`/blog/${slug}`, baseUrl).toString();

    try {
      await verifyRepository(githubConfig);

      const alreadyExists = await fileExists(githubConfig, contentPath);
      if (alreadyExists) {
        return jsonResponse(409, {
          success: false,
          error: 'duplicate_slug',
          message: `An article with slug "${slug}" already exists.`,
          slug,
          url: canonicalUrl,
        });
      }

      const normalizedSources = (input.sources ?? []).map((source) =>
        typeof source === 'string' ? { url: source } : source,
      );

      const frontmatter: Record<string, unknown> = {
        title: sanitizePlainText(input.title),
        description: sanitizePlainText(input.description),
        slug,
        publishedDate: input.publishedDate ?? new Date(),
        category: sanitizePlainText(input.category),
        tags: (input.tags ?? []).map(sanitizePlainText),
        keywords: (input.keywords ?? []).map(sanitizePlainText),
        author: sanitizePlainText(input.author ?? 'TheToolShed Team'),
        draft: input.draft ?? false,
      };

      if (input.updatedDate) frontmatter.updatedDate = input.updatedDate;
      if (input.featuredImage) frontmatter.featuredImage = input.featuredImage;
      if (input.featuredImageAlt) frontmatter.featuredImageAlt = sanitizePlainText(input.featuredImageAlt);
      if (input.seoTitle) frontmatter.seoTitle = sanitizePlainText(input.seoTitle);
      if (input.metaDescription) frontmatter.metaDescription = sanitizePlainText(input.metaDescription);
      if (input.sourceArticle) frontmatter.sourceArticle = sanitizePlainText(input.sourceArticle);
      if (input.sourceUrl) frontmatter.sourceUrl = input.sourceUrl;
      if (normalizedSources.length > 0) frontmatter.sources = normalizedSources;
      if (input.internalLinks && input.internalLinks.length > 0) {
        frontmatter.internalLinks = input.internalLinks.map(normalizeSlug);
      }

      const frontmatterYaml = dumpYaml(frontmatter, { lineWidth: 100, noRefs: true });
      const sanitizedContent = sanitizeArticleContent(input.content);
      const fileContent = `---\n${frontmatterYaml}---\n\n${sanitizedContent.trim()}\n`;
      const commitMessage = `chore(blog): publish "${frontmatter.title}" (${slug})`;
      const { htmlUrl, commitSha } = await createFile(
        githubConfig,
        contentPath,
        fileContent,
        commitMessage,
      );

      return jsonResponse(200, {
        success: true,
        slug,
        url: canonicalUrl,
        status: frontmatter.draft ? 'draft' : 'published',
        title: frontmatter.title,
        contentIndexUpdated: true,
        commitUrl: htmlUrl || undefined,
        commitSha,
        note: 'Committed to GitHub; Netlify will build and deploy automatically. The live page and /api/content-index.json typically update within a couple of minutes.',
      });
    } catch (err) {
      const status = err instanceof GitHubContentError && err.status && err.status >= 400 && err.status < 500 ? 502 : 502;
      console.error('[blog-publish] GitHub operation failed', {
        error: diagnosticMessage(err),
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        branch: githubConfig.branch,
        operationErrorType: err instanceof GitHubContentError ? err.code : 'unexpected_error',
      });

      return jsonResponse(status, {
        success: false,
        error: err instanceof GitHubContentError ? err.code ?? 'github_error' : 'github_error',
        message: diagnosticMessage(err),
        repository: `${githubConfig.owner}/${githubConfig.repo}`,
        branch: githubConfig.branch,
      });
    }
  } catch (err) {
    console.error('[blog-publish] Unhandled request failure', diagnosticMessage(err));
    return jsonResponse(500, {
      success: false,
      error: 'internal_error',
      message: diagnosticMessage(err),
    });
  }
};
