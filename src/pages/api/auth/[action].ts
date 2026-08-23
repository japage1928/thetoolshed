import type { APIRoute } from 'astro';
import {
  SAAS_ACCESS_COOKIE,
  SAAS_REFRESH_COOKIE,
  assertSameOrigin,
  clearCookie,
  cookie,
  env,
  json,
  parseCookies,
  safeError,
} from '../../../lib/evergreen-x/server';

const supabaseUrl = () => (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = () => process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function withSession(body: unknown, accessToken: string, refreshToken?: string, expiresIn = 3600) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(SAAS_ACCESS_COOKIE, accessToken, { maxAge: Math.max(60, expiresIn) }));
  if (refreshToken) headers.append('set-cookie', cookie(SAAS_REFRESH_COOKIE, refreshToken, { maxAge: 60 * 60 * 24 * 30 }));
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    const action = params.action;
    const url = supabaseUrl();
    const key = publishableKey();
    if (!url || !key) return json({ error: 'Authentication is not configured.' }, 503);

    if (action === 'logout') {
      const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      headers.append('set-cookie', clearCookie(SAAS_ACCESS_COOKIE));
      headers.append('set-cookie', clearCookie(SAAS_REFRESH_COOKIE));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (action === 'refresh') {
      const refreshToken = parseCookies(request)[SAAS_REFRESH_COOKIE];
      if (!refreshToken) return json({ error: 'Session expired.' }, 401);
      const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) return json({ error: 'Session expired.' }, 401);
      return withSession({ ok: true }, data.access_token, data.refresh_token || refreshToken, Number(data.expires_in || 3600));
    }

    const payload = await request.json().catch(() => ({}));
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!email || !password || password.length < 8) return json({ error: 'Enter a valid email and a password of at least 8 characters.' }, 400);

    if (action === 'login') {
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) return json({ error: 'Invalid email or password.' }, 401);
      return withSession({ ok: true }, data.access_token, data.refresh_token, Number(data.expires_in || 3600));
    }

    if (action === 'register') {
      const siteUrl = (env('PUBLIC_SITE_URL', false) || new URL(request.url).origin).replace(/\/$/, '');
      const redirectTo = `${siteUrl}/account?confirmed=1`;
      const response = await fetch(`${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) return json({ error: data.msg || data.message || 'Unable to create account.' }, 400);
      if (data.access_token) return withSession({ ok: true, confirmationRequired: false }, data.access_token, data.refresh_token, Number(data.expires_in || 3600));
      return json({ ok: true, confirmationRequired: true }, 202);
    }

    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    return safeError(error);
  }
};
