import { AI_TOOLS, getCatalogCategories } from './ai-tools';
import { getTools as getRemoteTools } from './supabase';
import type { DbTool } from './supabase';
import type { AITool, DirectoryTool } from './tool-schema';

const GENERIC_CLAIM =
  /established option|widely used(?: ai)? tool|popular choice|versatile(?: ai)? platform|strong option for|good starting point|reliable choice|great for most users|powerful ai (?:tool|platform)|leading (?:ai )?solution/i;

export function isGenericClaim(value: string): boolean {
  return GENERIC_CLAIM.test(value);
}

function cleanList(values: string[] | undefined, { allowUnverified }: { allowUnverified: boolean }): string[] {
  if (!values?.length) return [];
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => allowUnverified || !isGenericClaim(item));
}

function fromCatalog(tool: AITool, remote?: DbTool): DirectoryTool {
  const verified = (tool.verification_confidence ?? 'unverified') !== 'unverified';
  const strengths = verified ? cleanList(tool.strengths, { allowUnverified: false }) : [];
  const weaknesses = verified ? cleanList(tool.weaknesses, { allowUnverified: false }) : [];
  const remoteUseCases = cleanList(remote?.use_cases, { allowUnverified: false });
  const remoteFaq = (remote?.faq ?? []).filter((item) => item.question && item.answer && !isGenericClaim(item.answer));

  return {
    name: tool.name,
    slug: tool.slug,
    description: remote?.description || tool.description,
    category: remote?.category || tool.category,
    best_for: remote?.best_for || tool.bestFor,
    tags: remote?.tags?.length ? remote.tags : tool.tags,
    website_url: tool.url,
    affiliate_url: remote?.affiliate_url ?? (tool.affiliate ? tool.url : null),
    icon_url: remote?.icon_url ?? null,
    is_affiliate: Boolean(tool.affiliate || remote?.is_affiliate),
    company: tool.company ?? null,
    primary_use_cases: tool.primary_use_cases?.length ? tool.primary_use_cases : remoteUseCases,
    free_tier: tool.free_tier ?? null,
    pricing_summary: verified && tool.pricing_summary ? tool.pricing_summary : null,
    pricing_url: tool.pricing_url ?? tool.url,
    pricing_is_verified: Boolean(verified && tool.pricing_summary),
    api_available: tool.api_available ?? null,
    strengths,
    weaknesses,
    best_fit: verified ? cleanList(tool.best_fit, { allowUnverified: true }) : [],
    poor_fit: verified ? cleanList(tool.poor_fit, { allowUnverified: true }) : [],
    alternatives: tool.alternatives?.length ? tool.alternatives : (remote?.alternative_slugs ?? []),
    limitations: verified ? cleanList(tool.limitations, { allowUnverified: true }) : [],
    last_verified_at: tool.last_verified_at ?? null,
    verification_confidence: tool.verification_confidence ?? 'unverified',
    sources: tool.sources ?? [],
    faq: remoteFaq,
  };
}

function fromRemoteOnly(remote: DbTool): DirectoryTool {
  const remoteUseCases = cleanList(remote.use_cases, { allowUnverified: false });
  return {
    name: remote.name,
    slug: remote.slug,
    description: remote.description,
    category: remote.category,
    best_for: remote.best_for,
    tags: remote.tags,
    website_url: remote.website_url,
    affiliate_url: remote.affiliate_url,
    icon_url: remote.icon_url,
    is_affiliate: remote.is_affiliate,
    company: null,
    primary_use_cases: remoteUseCases,
    free_tier: null,
    pricing_summary: null,
    pricing_url: remote.website_url,
    pricing_is_verified: false,
    api_available: null,
    strengths: [],
    weaknesses: [],
    best_fit: [],
    poor_fit: [],
    alternatives: remote.alternative_slugs ?? [],
    limitations: [],
    last_verified_at: null,
    verification_confidence: 'unverified',
    sources: [{ label: `${remote.name} website`, url: remote.website_url }],
    faq: (remote.faq ?? []).filter((item) => item.question && item.answer && !isGenericClaim(item.answer)),
  };
}

export async function getDirectoryTools(): Promise<DirectoryTool[]> {
  let remote: DbTool[] = [];
  try {
    remote = await getRemoteTools();
  } catch {
    remote = [];
  }

  const remoteBySlug = new Map(remote.map((tool) => [tool.slug, tool]));
  const merged = AI_TOOLS.map((tool) => fromCatalog(tool, remoteBySlug.get(tool.slug)));
  const seen = new Set(merged.map((tool) => tool.slug));

  for (const extra of remote) {
    if (seen.has(extra.slug)) continue;
    merged.push(fromRemoteOnly(extra));
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDirectoryToolBySlug(slug: string): Promise<DirectoryTool | null> {
  const tools = await getDirectoryTools();
  return tools.find((tool) => tool.slug === slug) ?? null;
}

export async function getDirectoryToolsByCategory(category: string): Promise<DirectoryTool[]> {
  const tools = await getDirectoryTools();
  return tools.filter((tool) => tool.category === category);
}

export async function getDirectoryCategories(): Promise<string[]> {
  const tools = await getDirectoryTools();
  const fromTools = [...new Set(tools.map((tool) => tool.category))];
  const preferred = getCatalogCategories().filter((category) => fromTools.includes(category));
  const extras = fromTools.filter((category) => !preferred.includes(category)).sort();
  return [...preferred, ...extras];
}

export function toolUrl(tool: DirectoryTool): string {
  return tool.affiliate_url || tool.website_url;
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function formatVerifiedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
