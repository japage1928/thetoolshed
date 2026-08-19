export type DbTool = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  best_for: string;
  tags: string[];
  website_url: string;
  affiliate_url: string | null;
  icon_url: string | null;
  is_affiliate: boolean;
  is_featured_eligible: boolean;
  is_active: boolean;
  sort_order: number;
};

export type DbPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image_url: string | null;
  category: string | null;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  is_draft: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbWorkflow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  difficulty: string;
  price: number;
  image_url: string | null;
  included: string[];
  apps_required: string[];
  payhip_product_id: string | null;
  featured: boolean;
  is_free: boolean;
  is_published: boolean;
  seo_title: string | null;
  seo_description: string | null;
};

// Netlify provides these values at runtime/build time. The publishable key is safe
// for the public client and is also used by these server-rendered read queries.
const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function query<T>(table: string, params: string): Promise<T[]> {
  if (!url || !key) return [];
  const response = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  return response.json() as Promise<T[]>;
}

export async function getTools() {
  return query<DbTool>('ai_tools', 'is_active=eq.true&order=sort_order.asc,name.asc');
}

export async function getToolBySlug(slug: string) {
  const tools = await query<DbTool>('ai_tools', `slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`);
  return tools[0] ?? null;
}

export async function getToolsByCategory(category: string) {
  return query<DbTool>('ai_tools', `category=eq.${encodeURIComponent(category)}&is_active=eq.true&order=sort_order.asc,name.asc`);
}

export async function getToolCategories() {
  const tools = await getTools();
  return [...new Set(tools.map((tool) => tool.category))].sort();
}

export async function getPublishedPosts() {
  return query<DbPost>('blog_posts', 'is_draft=eq.false&order=published_at.desc');
}

export async function getPostBySlug(slug: string) {
  const posts = await query<DbPost>('blog_posts', `slug=eq.${encodeURIComponent(slug)}&is_draft=eq.false&limit=1`);
  return posts[0] ?? null;
}

export async function getWorkflows() {
  return query<DbWorkflow>('workflows', 'is_published=eq.true&order=featured.desc,created_at.desc');
}

export async function getWorkflowBySlug(slug: string) {
  const workflows = await query<DbWorkflow>('workflows', `slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`);
  return workflows[0] ?? null;
}

export function toolUrl(tool: DbTool) {
  return tool.affiliate_url || tool.website_url;
}
