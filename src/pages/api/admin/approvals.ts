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

export const GET: APIRoute = async ({ request }) => {
  const result = await rpc(request, 'admin_list_approval_queue', { p_limit: 300 });
  if (!result.ok) return json({ error: 'Unable to load approval queue.' }, result.status === 401 ? 401 : 403);
  return json({ items: result.data });
};

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Cross-origin request rejected.' }, 403);
  const body = await request.json().catch(() => ({}));
  const queueId = typeof body.queue_id === 'string' ? body.queue_id : '';
  const decision = body.decision === 'approve' || body.decision === 'deny' ? body.decision : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(queueId) || !decision) return json({ error: 'Invalid approval request.' }, 400);
  const result = await rpc(request, 'admin_resolve_approval', { p_queue_id: queueId, p_decision: decision, p_reason: reason || null });
  if (!result.ok) return json({ error: 'Unable to resolve approval item.', detail: result.data?.message }, result.status === 401 ? 401 : 409);
  return json(result.data);
};
