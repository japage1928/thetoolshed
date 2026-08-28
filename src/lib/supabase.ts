export type DbTool = {
  id: string; name: string; slug: string; description: string; category: string; best_for: string; tags: string[]; website_url: string; affiliate_url: string | null; icon_url: string | null; is_affiliate: boolean; is_featured_eligible: boolean; is_active: boolean; sort_order: number;
  pricing_summary: string | null; pros: string[]; cons: string[]; use_cases: string[]; alternative_slugs: string[]; faq: Array<{ question: string; answer: string }>;
};
export type DbPost = { id: string; title: string; slug: string; excerpt: string; content: string; featured_image_url: string | null; category: string | null; tags: string[]; seo_title: string | null; seo_description: string | null; is_draft: boolean; published_at: string | null; created_at: string; updated_at: string; };
export type DbWorkflow = { id: string; name: string; slug: string; description: string; category: string; difficulty: string; price: number; image_url: string | null; included: string[]; apps_required: string[]; payhip_product_id: string | null; featured: boolean; is_free: boolean; is_published: boolean; seo_title: string | null; seo_description: string | null; };
export type DbPrompt = { id: string; name: string; slug: string; description: string; type: 'prompt' | 'loop'; category: string; prompt_text: string; compatible_tools: string[]; price: number; is_free: boolean; payhip_product_id: string | null; image_url: string | null; featured: boolean; is_published: boolean; };

const retiredVideoCopy = /video studio|pick the tool shed video studio/i;
const cleanText = (value: unknown) => typeof value === 'string' && retiredVideoCopy.test(value) ? '' : String(value ?? '');
const cleanList = (value: unknown) => Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
const cleanFaq = (value: unknown) => Array.isArray(value) ? value.map((item) => ({ question: cleanText(item?.question), answer: cleanText(item?.answer) })).filter((item) => item.question || item.answer) : [];
function sanitizeTool(tool: DbTool): DbTool {
  const safeUrl = (value: unknown) => { try { return new URL(String(value ?? '')).toString(); } catch { return 'https://example.com'; } };
  return { ...tool, website_url: safeUrl(tool.website_url), affiliate_url: tool.affiliate_url ? safeUrl(tool.affiliate_url) : null, description: cleanText(tool.description), best_for: cleanText(tool.best_for), pros: cleanList(tool.pros), cons: cleanList(tool.cons), use_cases: cleanList(tool.use_cases), faq: cleanFaq(tool.faq) } as DbTool;
}
export function toolDomain(value: string) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'example.com'; } }

const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function query<T>(table: string, params: string): Promise<T[]> {
  if (!url || !key) return [];
  const response = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  return response.json() as Promise<T[]>;
}
export async function getTools(){return (await query<DbTool>('ai_tools','is_active=eq.true&order=sort_order.asc,name.asc')).map(sanitizeTool);}
export async function getToolBySlug(slug:string){const x=await query<DbTool>('ai_tools',`slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`);return x[0]?sanitizeTool(x[0]):null;}
export async function getToolsByCategory(category:string){return (await query<DbTool>('ai_tools',`category=eq.${encodeURIComponent(category)}&is_active=eq.true&order=sort_order.asc,name.asc`)).map(sanitizeTool);}
export async function getToolCategories(){const x=await getTools();return [...new Set(x.map(t=>t.category))].sort();}
export async function getPublishedPosts(){return query<DbPost>('blog_posts','is_draft=eq.false&order=published_at.desc');}
export async function getPostBySlug(slug:string){const x=await query<DbPost>('blog_posts',`slug=eq.${encodeURIComponent(slug)}&is_draft=eq.false&limit=1`);return x[0]??null;}
export async function getWorkflows(){return query<DbWorkflow>('workflows','is_published=eq.true&order=featured.desc,created_at.desc');}
export async function getWorkflowBySlug(slug:string){const x=await query<DbWorkflow>('workflows',`slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`);return x[0]??null;}
export async function getPrompts(){return query<DbPrompt>('prompts','is_published=eq.true&order=featured.desc,created_at.desc');}
export async function getPromptBySlug(slug:string){const x=await query<DbPrompt>('prompts',`slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`);return x[0]??null;}
export function toolUrl(tool:DbTool){return tool.affiliate_url||tool.website_url;}
