import type { APIRoute } from 'astro';

const COOKIE = 'ts_admin_access_token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Cross-origin request rejected.' }, 403);

    const { email, password } = await request.json();
    const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || !email || !password) return json({ error: 'Invalid sign-in request.' }, 400);

    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token || !data.user) return json({ error: 'Invalid email or password.' }, 401);

    const adminCheck = await fetch(`${url}/rest/v1/rpc/is_tool_shed_admin`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${data.access_token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!adminCheck.ok || (await adminCheck.json()) !== true) return json({ error: 'Admin access denied.' }, 403);

    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    headers.append('set-cookie', `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    headers.append('set-cookie', `${COOKIE}=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch {
    return json({ error: 'Unable to sign in.' }, 500);
  }
};
