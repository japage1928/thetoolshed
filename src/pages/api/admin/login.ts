import type { APIRoute } from 'astro';

const COOKIE = 'ts_admin_access_token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, password } = await request.json();
    const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || !email || !password) return json({ error: 'Invalid sign-in request.' }, 400);

    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token || !data.user) return json({ error: 'Invalid email or password.' }, 401);

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${encodeURIComponent(data.access_token)}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
      },
    });
  } catch {
    return json({ error: 'Unable to sign in.' }, 500);
  }
};
