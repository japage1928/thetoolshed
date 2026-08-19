import { defineMiddleware } from 'astro:middleware';

const COOKIE = 'ts_admin_access_token';

export const onRequest = defineMiddleware(async ({ request, redirect }, next) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/admin') || url.pathname === '/admin/login') return next();

  const token = request.headers.get('cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!token || !supabaseUrl || !supabaseKey) {
    const response = redirect('/admin/login', 302);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
    return response;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const redirectResponse = redirect('/admin/login', 302);
      redirectResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      redirectResponse.headers.set('Netlify-CDN-Cache-Control', 'no-store');
      return redirectResponse;
    }
    const user = await response.json();
    if (!user?.id || !user?.email) {
      const redirectResponse = redirect('/admin/login', 302);
      redirectResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      redirectResponse.headers.set('Netlify-CDN-Cache-Control', 'no-store');
      return redirectResponse;
    }

    const page = await next();
    page.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    page.headers.set('Netlify-CDN-Cache-Control', 'no-store');
    page.headers.set('Pragma', 'no-cache');
    return page;
  } catch {
    const response = redirect('/admin/login', 302);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
    return response;
  }
});
