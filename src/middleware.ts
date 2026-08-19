import { defineMiddleware } from 'astro:middleware';

const COOKIE = 'ts_admin_access_token';

export const onRequest = defineMiddleware(async ({ request, redirect }, next) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/admin') || url.pathname === '/admin/login') return next();

  const token = request.headers.get('cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!token || !supabaseUrl || !supabaseKey) return redirect('/admin/login', 302);

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return redirect('/admin/login', 302);
    const user = await response.json();
    if (!user?.id || !user?.email) return redirect('/admin/login', 302);
    return next();
  } catch {
    return redirect('/admin/login', 302);
  }
});
