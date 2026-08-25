import type { APIRoute } from 'astro';
import { LEGAL_VERSIONS, recordLegalAcceptance } from '../../../lib/legal';
import { createAstroSupabaseClient } from '../../../lib/supabase-ssr';
import { dispatchVideoEmailSafely } from '../../../lib/video-studio/email';
import {
  safeRelativePath,
  VIDEO_ACCESS_COOKIE,
  VIDEO_REFRESH_COOKIE,
} from '../../../lib/video-studio/server';

export const GET: APIRoute = async ({ request, cookies }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeRelativePath(requestUrl.searchParams.get('next'));
  if (!code) return Response.redirect(new URL('/account?oauth_error=missing_code', request.url), 302);

  try {
    const { supabase, responseHeaders } = createAstroSupabaseClient(request, cookies);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session?.access_token) throw error || new Error('No session returned.');

    const existingMetadata = data.user.user_metadata || {};
    if (!existingMetadata.terms_accepted_at) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          ...existingMetadata,
          terms_accepted_at: new Date().toISOString(),
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
          acceptable_use_version: LEGAL_VERSIONS.acceptableUse,
        },
      });
      if (metadataError) throw metadataError;
    }

    await recordLegalAcceptance(supabase, data.user.id, 'google_oauth');

    if (next.startsWith('/app/video-studio') && data.user?.id && data.user.email) {
      const metadata = data.user.user_metadata || {};
      const name = typeof metadata.full_name === 'string'
        ? metadata.full_name
        : typeof metadata.name === 'string'
          ? metadata.name
          : null;
      await dispatchVideoEmailSafely({
        event_id: `video_welcome:${data.user.id}`,
        event_type: 'welcome',
        user_id: data.user.id,
        email: data.user.email,
        name,
      });
    }

    const secure = requestUrl.protocol === 'https:';
    cookies.set(VIDEO_ACCESS_COOKIE, data.session.access_token, {
      path: '/',
      maxAge: Math.max(60, Number(data.session.expires_in || 3600)),
      secure,
      sameSite: 'lax',
      httpOnly: true,
    });
    if (data.session.refresh_token) {
      cookies.set(VIDEO_REFRESH_COOKIE, data.session.refresh_token, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        secure,
        sameSite: 'lax',
        httpOnly: true,
      });
    }
    responseHeaders.set('location', next);
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return Response.redirect(new URL('/account?oauth_error=exchange_failed', request.url), 302);
  }
};
