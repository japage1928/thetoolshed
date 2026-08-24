import type { APIRoute } from 'astro';
import { createAstroSupabaseClient } from '../../../lib/supabase-ssr';
import { publicSiteUrl, safeRelativePath } from '../../../lib/video-studio/server';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const requestUrl = new URL(request.url);
    const next = safeRelativePath(requestUrl.searchParams.get('next'));
    const callbackBase = import.meta.env.DEV ? requestUrl.origin : publicSiteUrl();
    const callback = new URL('/api/auth/callback', callbackBase);
    callback.searchParams.set('next', next);
    const { supabase, responseHeaders } = createAstroSupabaseClient(request, cookies);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) throw Object.assign(new Error(error?.message || 'Google sign-in is unavailable.'), { status: 503 });
    responseHeaders.set('location', data.url);
    return new Response(null, { status: 302, headers: responseHeaders });
  } catch {
    return Response.redirect(new URL('/account?oauth_error=google_unavailable', request.url), 302);
  }
};
