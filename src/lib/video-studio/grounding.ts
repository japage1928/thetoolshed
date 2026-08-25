import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductIdentity = {
  name: string;
  brand?: string;
  model?: string;
  variant?: string;
  color?: string;
  description?: string;
  sku?: string;
  primaryImageUrl?: string;
  canonicalUrl?: string;
  userNotes?: string;
  evidence?: string[];
};

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function isUnsafeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] === 169 && parts[1] === 254 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168;
  }
  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}

function safeHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || isUnsafeHost(url.hostname)) throw new Error('Unsafe product URL.');
  return url;
}

async function fetchProductHtml(sourceUrl: string) {
  let current = safeHttpUrl(sourceUrl);
  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; VideoStudioProductVerifier/1.0; +https://thetoolshed.work)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Product URL redirect is incomplete.');
      current = safeHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Product page returned HTTP ${response.status}.`);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('Product URL did not return an HTML page.');
    const html = (await response.text()).slice(0, 2_000_000);
    return { html, finalUrl: current.toString() };
  }
  throw new Error('Product URL redirected too many times.');
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return clean(match[1], 1000);
  }
  return '';
}

function titleTag(html: string) {
  return clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' '), 300);
}

function productJsonLd(html: string): Record<string, any> | null {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const flatten = (value: any): any[] => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? [value, ...flatten(value['@graph'] || [])] : [];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const product = flatten(parsed).find((item) => {
        const type = item?.['@type'];
        return type === 'Product' || Array.isArray(type) && type.includes('Product');
      });
      if (product) return product;
    } catch {
      // Invalid merchant JSON-LD is ignored; other evidence may still ground the product.
    }
  }
  return null;
}

export async function extractProductIdentity(sourceUrl: string): Promise<{ identity: ProductIdentity; confidence: number; error?: string }> {
  try {
    const { html, finalUrl } = await fetchProductHtml(sourceUrl);
    const product = productJsonLd(html);
    const brandValue = typeof product?.brand === 'string' ? product.brand : clean(product?.brand?.name, 120);
    const imageValue = Array.isArray(product?.image) ? product.image[0] : typeof product?.image === 'string' ? product.image : clean(product?.image?.url, 2000);
    const name = clean(product?.name, 300) || meta(html, 'og:title') || titleTag(html);
    const description = clean(product?.description, 1000) || meta(html, 'og:description') || meta(html, 'description');
    const primaryImageUrl = clean(imageValue, 2000) || meta(html, 'og:image');
    const sku = clean(product?.sku || product?.mpn || product?.productID, 120);
    const model = clean(product?.model, 160);
    const identity: ProductIdentity = {
      name,
      ...(brandValue ? { brand: brandValue } : {}),
      ...(model ? { model } : {}),
      ...(description ? { description } : {}),
      ...(sku ? { sku } : {}),
      ...(primaryImageUrl ? { primaryImageUrl } : {}),
      canonicalUrl: finalUrl,
      evidence: [],
    };
    let confidence = 0;
    if (product) { confidence += 0.35; identity.evidence!.push('structured_product_data'); }
    if (name) { confidence += 0.20; identity.evidence!.push('product_name'); }
    if (brandValue) { confidence += 0.10; identity.evidence!.push('brand'); }
    if (primaryImageUrl) { confidence += 0.20; identity.evidence!.push('primary_image'); }
    if (sku || model) { confidence += 0.15; identity.evidence!.push('model_or_sku'); }
    return { identity, confidence: Math.min(1, Number(confidence.toFixed(3))) };
  } catch (error) {
    return { identity: { name: '' }, confidence: 0, error: error instanceof Error ? error.message : 'Product extraction failed.' };
  }
}

export function mergeUserConfirmation(extracted: ProductIdentity, input: Record<string, unknown>, referenceCount: number) {
  const name = clean(input.productName, 300) || extracted.name;
  const identity: ProductIdentity = {
    ...extracted,
    name,
    brand: clean(input.brand, 120) || extracted.brand,
    model: clean(input.model, 160) || extracted.model,
    variant: clean(input.variant, 160) || extracted.variant,
    color: clean(input.color, 120) || extracted.color,
    userNotes: clean(input.identityNotes, 1000) || extracted.userNotes,
    evidence: [...new Set([...(extracted.evidence || []), 'user_confirmation', ...(referenceCount ? ['user_reference_images'] : [])])],
  };
  const hasSpecificIdentity = Boolean(identity.name && (identity.brand || identity.model || identity.variant || identity.userNotes));
  const confidence = hasSpecificIdentity && referenceCount > 0 ? 0.98 : hasSpecificIdentity ? 0.82 : 0;
  return { identity, confidence };
}

export async function signedReferenceUrls(serviceDb: SupabaseClient, rows: Array<{ storage_path: string }>, expiresIn = 3600) {
  const urls: string[] = [];
  for (const row of rows) {
    const { data, error } = await serviceDb.storage.from('video-studio-references').createSignedUrl(row.storage_path, expiresIn);
    if (!error && data?.signedUrl) urls.push(data.signedUrl);
  }
  return urls;
}

export function buildProductIdentityLock(identity: ProductIdentity, referenceUrls: string[]) {
  const exact = [
    `Product name: ${identity.name}`,
    identity.brand ? `Brand: ${identity.brand}` : '',
    identity.model ? `Model: ${identity.model}` : '',
    identity.variant ? `Variant: ${identity.variant}` : '',
    identity.color ? `Color: ${identity.color}` : '',
    identity.sku ? `SKU/MPN: ${identity.sku}` : '',
    identity.description ? `Verified description: ${identity.description}` : '',
    identity.userNotes ? `User-confirmed identity notes: ${identity.userNotes}` : '',
  ].filter(Boolean).join('\n');
  const refs = referenceUrls.length ? referenceUrls.map((url, i) => `Reference ${i + 1}: ${url}`).join('\n') : 'No separate user reference image supplied.';
  return `STRICT PRODUCT IDENTITY LOCK — HIGHEST PRIORITY\n${exact}\n\nVISUAL REFERENCES — THESE DEFINE THE PRODUCT\n${refs}\n\nMANDATORY RULES:\n- Preserve the exact submitted product identity in every frame where the product appears.\n- Match silhouette, proportions, materials, controls, logos/markings, ear-cup/headband geometry, color, finish, and accessory layout to the verified identity and references.\n- Do not redesign, beautify, simplify, substitute, or hallucinate the product.\n- Do not convert the product into a generic product from the same category.\n- Do not add features, buttons, microphones, stems, displays, lights, ports, packaging, branding, or accessories that are not visible or verified.\n- If a requested shot cannot preserve the product exactly, use a safer angle or product-free contextual shot instead of inventing details.\n\nNEGATIVE PRODUCT CONSTRAINTS:\nNo generic lookalikes. No alternate models. No competitor products. No changed logo. No changed colorway. No changed proportions. No extra controls. No invented accessories. No category substitution. No headset/headphone/earbud form-factor substitution.\n\nThe product identity lock overrides cinematic style, creativity, composition, and motion. Accuracy is more important than spectacle.`;
}
