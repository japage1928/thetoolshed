import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookieSetOptions, AstroCookies } from 'astro';

export function createAstroSupabaseClient(request: Request, cookies: AstroCookies) {
  const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) throw Object.assign(new Error('Authentication is not configured.'), { status: 503 });

  const responseHeaders = new Headers({
    'cache-control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    'netlify-cdn-cache-control': 'no-store',
  });
  const secure = new URL(request.url).protocol === 'https:';
  const supabase = createServerClient(url, key, {
    auth: { flowType: 'pkce' },
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') || '');
      },
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, {
            ...options,
            path: options.path || '/',
            secure,
            sameSite: options.sameSite || 'lax',
            httpOnly: true,
          } as AstroCookieSetOptions);
        }
        for (const [name, value] of Object.entries(cacheHeaders)) responseHeaders.set(name, value);
      },
    },
  });
  return { supabase, responseHeaders };
}
