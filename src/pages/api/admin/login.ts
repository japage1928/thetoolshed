import type { APIRoute } from 'astro';

const COOKIE = 'ts_admin_access_token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function allowedAdminEmails() {
  return (process.env.TOOL_SHED_ADMIN_EMAILS || process.env.EVERGREEN_X_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Cross-origin request rejected.' }, 403);

    const { email, password } = await request.json();
    const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    const allowed = allowedAdminEmails();
    if (!allowed.length) return json({ error: 'Admin access is not configured.' }, 503);
    if (!url || !key || !email || !password) return json({ error: 'Invalid sign-in request.' }, 400);

    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token || !data.user) return json({ error: 'Invalid email or password.' }, 401);
    if (!allowed.includes(String(data.user.email || '').toLowerCase())) return json({ error: 'Admin access denied.' }, 403);

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${encodeURIComponent(data.access_token)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
      },
    });
  } catch {
    return json({ error: 'Unable to sign in.' }, 500);
  }
};
