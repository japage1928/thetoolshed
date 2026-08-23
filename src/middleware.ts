import { defineMiddleware } from 'astro:middleware';

const ADMIN_COOKIE = 'ts_admin_access_token';
const SAAS_COOKIE = 'ts_saas_access_token';
const SAAS_REFRESH_COOKIE = 'ts_saas_refresh_token';

function getCookie(request: Request, name: string) {
  return request.headers.get('cookie')?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

function authConfig() {
  return {
    url: (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  };
}

function allowedAdminEmails() {
  return (process.env.TOOL_SHED_ADMIN_EMAILS || process.env.EVERGREEN_X_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function getSupabaseUser(token: string | undefined) {
  const { url, key } = authConfig();
  if (!token || !url || !key) return null;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${decodeURIComponent(token)}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id && user?.email ? user : null;
  } catch {
    return null;
  }
}

async function refreshSaasSession(request: Request) {
  const refreshToken = getCookie(request, SAAS_REFRESH_COOKIE);
  const { url, key } = authConfig();
  if (!refreshToken || !url || !key) return null;
  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: decodeURIComponent(refreshToken) }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) return null;
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token || decodeURIComponent(refreshToken)),
      expiresIn: Math.max(60, Number(data.expires_in || 3600)),
    };
  } catch {
    return null;
  }
}

function sessionCookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax; HttpOnly`;
}

function noStore(response: Response) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export const onRequest = defineMiddleware(async ({ request, redirect }, next) => {
  const url = new URL(request.url);
  const isAdmin = url.pathname.startsWith('/admin') && url.pathname !== '/admin/login';
  const isSaasApp = url.pathname.startsWith('/app/evergreen-x');

  if (!isAdmin && !isSaasApp) return next();

  if (isAdmin) {
    const user = await getSupabaseUser(getCookie(request, ADMIN_COOKIE));
    const allowed = allowedAdminEmails();
    if (!user || !allowed.length || !allowed.includes(String(user.email).toLowerCase())) return noStore(redirect('/admin/login', 302));
  }

  if (isSaasApp) {
    const user = await getSupabaseUser(getCookie(request, SAAS_COOKIE));
    if (!user) {
      const refreshed = await refreshSaasSession(request);
      if (!refreshed) return noStore(redirect(`/account?next=${encodeURIComponent(url.pathname)}`, 302));
      const response = noStore(await next());
      response.headers.append('Set-Cookie', sessionCookie(SAAS_COOKIE, refreshed.accessToken, refreshed.expiresIn));
      response.headers.append('Set-Cookie', sessionCookie(SAAS_REFRESH_COOKIE, refreshed.refreshToken, 60 * 60 * 24 * 30));
      return response;
    }
  }

  return noStore(await next());
});
