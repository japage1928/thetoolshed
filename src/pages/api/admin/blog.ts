import type { APIRoute } from 'astro';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function cfg() {
  return {
    url: (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  };
}

function adminToken(request: Request) {
  return request.headers.get('cookie')?.match(/ts_admin_access_token=([^;]+)/)?.[1];
}

async function rpc(request: Request, name: string, body: Record<string, unknown>) {
  const { url, key } = cfg();
  const token = adminToken(request);
  if (!url || !key || !token) return { ok: false, status: 401, data: { error: 'Unauthorized.' } };
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${decodeURIComponent(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export const GET: APIRoute = async ({ request }) => {
  const result = await rpc(request, 'admin_list_blog_posts', { p_limit: 500 });
  if (!result.ok) return json({ error: 'Unable to load blog posts.' }, result.status === 401 ? 401 : 403);
  return json({ items: result.data });
};

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const body = await request.json().catch(() => ({}));
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((x: unknown) => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean).slice(0, 20)
    : [];
  const payload = {
    p_id: typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null,
    p_title: typeof body.title === 'string' ? body.title.trim().slice(0, 240) : '',
    p_slug: typeof body.slug === 'string' ? body.slug.trim().slice(0, 240) : '',
    p_excerpt: typeof body.excerpt === 'string' ? body.excerpt.trim().slice(0, 1000) : '',
    p_content: typeof body.content === 'string' ? body.content : '',
    p_featured_image_url: typeof body.featured_image_url === 'string' ? body.featured_image_url.trim().slice(0, 2000) : null,
    p_category: typeof body.category === 'string' ? body.category.trim().slice(0, 120) : null,
    p_tags: tags,
    p_seo_title: typeof body.seo_title === 'string' ? body.seo_title.trim().slice(0, 240) : null,
    p_seo_description: typeof body.seo_description === 'string' ? body.seo_description.trim().slice(0, 500) : null,
    p_is_draft: body.is_draft !== false,
  };
  if (payload.p_title.length < 3 || payload.p_slug.length < 1) return json({ error: 'Title and slug are required.' }, 400);
  const result = await rpc(request, 'admin_upsert_blog_post', payload);
  if (!result.ok) return json({ error: 'Unable to save blog post.', detail: result.data?.message }, result.status === 401 ? 401 : 400);
  return json({ item: result.data });
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid post id.' }, 400);
  const result = await rpc(request, 'admin_delete_blog_post', { p_id: id });
  if (!result.ok) return json({ error: 'Unable to delete blog post.', detail: result.data?.message }, result.status === 401 ? 401 : 400);
  return json(result.data);
};
