import { AI_TOOLS, getCatalogCategories } from './ai-tools';
import { getTools as getRemoteTools } from './supabase';
import type { DbTool } from './supabase';
import type { AITool, DirectoryTool } from './tool-schema';

/**
 * Live directory membership comes from Supabase `ai_tools` when that table
 * returns rows. The static catalog in `ai-tools.ts` is a seed/overlay only:
 * it fills verified workshop notes for known slugs, and is a local fallback
 * when Supabase is empty (dev/build without credentials).
 */
const GENERIC_CLAIM =
  /established option|widely used(?: ai)? tool|popular choice|versatile(?: ai)? platform|strong option for|good starting point|reliable choice|great for most users|powerful ai (?:tool|platform)|leading (?:ai )?solution/i;

export function isGenericClaim(value: string): boolean {
  return GENERIC_CLAIM.test(value);
}

function cleanList(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !isGenericClaim(item));
}

function fromCatalogFallback(tool: AITool): DirectoryTool {
  const verified = (tool.verification_confidence ?? 'unverified') !== 'unverified';
  return {
    name: tool.name,
    slug: tool.slug,
    description: tool.description,
    category: tool.category,
    best_for: tool.bestFor,
    tags: tool.tags,
    website_url: tool.url,
    affiliate_url: tool.affiliate ? tool.url : null,
    icon_url: null,
    is_affiliate: Boolean(tool.affiliate),
    company: tool.company ?? null,
    primary_use_cases: tool.primary_use_cases ?? [tool.bestFor],
    free_tier: tool.free_tier ?? null,
    pricing_summary: verified && tool.pricing_summary ? tool.pricing_summary : null,
    pricing_url: tool.pricing_url ?? tool.url,
    pricing_is_verified: Boolean(verified && tool.pricing_summary),
    api_available: tool.api_available ?? null,
    strengths: verified ? cleanList(tool.strengths) : [],
    weaknesses: verified ? cleanList(tool.weaknesses) : [],
    best_fit: verified ? cleanList(tool.best_fit) : [],
    poor_fit: verified ? cleanList(tool.poor_fit) : [],
    alternatives: tool.alternatives ?? [],
    limitations: verified ? cleanList(tool.limitations) : [],
    last_verified_at: tool.last_verified_at ?? null,
    verification_confidence: tool.verification_confidence ?? 'unverified',
    sources: tool.sources ?? [{ label: `${tool.name} website`, url: tool.url }],
    faq: [],
  };
}

function fromRemote(remote: DbTool, overlay?: AITool): DirectoryTool {
  const verified = overlay ? (overlay.verification_confidence ?? 'unverified') !== 'unverified' : false;
  const remotePricing = remote.pricing_summary?.trim() && !isGenericClaim(remote.pricing_summary) ? remote.pricing_summary.trim() : null;
  const remoteUseCases = cleanList(remote.use_cases);

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
    company: overlay?.company ?? null,
    primary_use_cases: verified && overlay?.primary_use_cases?.length ? overlay.primary_use_cases : remoteUseCases,
    free_tier: overlay?.free_tier ?? null,
    pricing_summary: verified && overlay?.pricing_summary ? overlay.pricing_summary : remotePricing,
    pricing_url: overlay?.pricing_url ?? remote.website_url,
    pricing_is_verified: Boolean(verified && overlay?.pricing_summary),
    api_available: overlay?.api_available ?? null,
    strengths: verified ? cleanList(overlay?.strengths) : [],
    weaknesses: verified ? cleanList(overlay?.weaknesses) : [],
    best_fit: verified ? cleanList(overlay?.best_fit) : [],
    poor_fit: verified ? cleanList(overlay?.poor_fit) : [],
    alternatives: (verified && overlay?.alternatives?.length ? overlay.alternatives : remote.alternative_slugs) ?? [],
    limitations: verified ? cleanList(overlay?.limitations) : [],
    last_verified_at: verified ? overlay?.last_verified_at ?? null : null,
    verification_confidence: overlay?.verification_confidence ?? 'unverified',
    sources: overlay?.sources ?? [{ label: `${remote.name} website`, url: remote.website_url }],
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

  if (remote.length > 0) {
    const overlayBySlug = new Map(AI_TOOLS.map((tool) => [tool.slug, tool]));
    return remote
      .map((tool) => fromRemote(tool, overlayBySlug.get(tool.slug)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return AI_TOOLS.map(fromCatalogFallback).sort((a, b) => a.name.localeCompare(b.name));
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
