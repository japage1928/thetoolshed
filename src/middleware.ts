import { defineMiddleware } from 'astro:middleware';

const ADMIN_COOKIE = 'ts_admin_access_token';
const SAAS_COOKIE = 'ts_saas_access_token';

function getCookie(request: Request, name: string) {
  return request.headers.get('cookie')?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

async function validSupabaseToken(token: string | undefined) {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !supabaseKey) return false;
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${decodeURIComponent(token)}` },
    });
    if (!response.ok) return false;
    const user = await response.json();
    return Boolean(user?.id && user?.email);
  } catch {
    return false;
  }
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
    const valid = await validSupabaseToken(getCookie(request, ADMIN_COOKIE));
    if (!valid) return noStore(redirect('/admin/login', 302));
  }

  if (isSaasApp) {
    const valid = await validSupabaseToken(getCookie(request, SAAS_COOKIE));
    if (!valid) return noStore(redirect(`/account?next=${encodeURIComponent(url.pathname)}`, 302));
  }

  return noStore(await next());
});
