import type { APIRoute } from 'astro';
import { LEGAL_VERSIONS, recordLegalAcceptance } from '../../../lib/legal';
import { dispatchVideoEmailSafely } from '../../../lib/video-studio/email';
import { getUserDb, safeRelativePath } from '../../../lib/video-studio/server';
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

type AuthUserData = {
  user?: {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

async function sendVideoStudioWelcome(data: AuthUserData, next: string) {
  if (!next.startsWith('/app/video-studio')) return;
  const user = data.user;
  if (!user?.id || !user.email) return;
  const metadata = user.user_metadata || {};
  const name = typeof metadata.full_name === 'string'
    ? metadata.full_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : null;
  await dispatchVideoEmailSafely({
    event_id: `video_welcome:${user.id}`,
    event_type: 'welcome',
    user_id: user.id,
    email: user.email,
    name,
  });
}

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
      const accessToken = parseCookies(request)[SAAS_ACCESS_COOKIE];
      if (accessToken) {
        await fetch(`${url}/auth/v1/logout?scope=local`, {
          method: 'POST',
          headers: { apikey: key, authorization: `Bearer ${accessToken}` },
        }).catch(() => null);
      }
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
    const next = safeRelativePath(typeof payload.next === 'string' ? payload.next : null, '/account');

    if (action === 'session') {
      const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : '';
      const refreshToken = typeof payload.refreshToken === 'string' ? payload.refreshToken : undefined;
      if (!accessToken) return json({ error: 'The confirmation link is invalid or expired.' }, 400);
      const verification = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, authorization: `Bearer ${accessToken}` },
      });
      const verifiedUser = await verification.json();
      if (!verification.ok || !verifiedUser?.id || !verifiedUser?.email) {
        return json({ error: 'The confirmation link is invalid or expired.' }, 401);
      }
      await sendVideoStudioWelcome({ user: verifiedUser }, next);
      return withSession({ ok: true }, accessToken, refreshToken, Math.max(60, Number(payload.expiresIn || 3600)));
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (action === 'recover') {
      if (!validEmail) return json({ error: 'Enter a valid email address.' }, 400);
      const siteUrl = (env('PUBLIC_SITE_URL', false) || new URL(request.url).origin).replace(/\/$/, '');
      const redirectTo = `${siteUrl}/account/reset-password`;
      const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok && response.status === 429) return json({ error: 'Too many reset attempts. Please wait and try again.' }, 429);
      return json({ ok: true });
    }

    if (action === 'update-password') {
      const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : '';
      if (!accessToken || password.length < 10) return json({ error: 'Use a password of at least 10 characters.' }, 400);
      const response = await fetch(`${url}/auth/v1/user`, {
        method: 'PUT',
        headers: { apikey: key, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) return json({ error: data.msg || data.message || 'The reset link is invalid or expired.' }, 400);
      return json({ ok: true });
    }

    if (!validEmail || !password || password.length < 10) return json({ error: 'Enter a valid email and a password of at least 10 characters.' }, 400);

    if (action === 'login') {
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) return json({ error: 'Invalid email or password.' }, 401);
      await sendVideoStudioWelcome(data, next);
      return withSession({ ok: true }, data.access_token, data.refresh_token, Number(data.expires_in || 3600));
    }

    if (action === 'register') {
      if (payload.acceptedTerms !== true) {
        return json({ error: 'Accept the Terms, Acceptable Use Policy, and Privacy Policy to create an account.' }, 400);
      }
      const siteUrl = (env('PUBLIC_SITE_URL', false) || new URL(request.url).origin).replace(/\/$/, '');
      const redirectTo = `${siteUrl}/account?confirmed=1&next=${encodeURIComponent(next)}`;
      const acceptedAt = new Date().toISOString();
      const response = await fetch(`${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          data: {
            terms_accepted_at: acceptedAt,
            terms_version: LEGAL_VERSIONS.terms,
            privacy_version: LEGAL_VERSIONS.privacy,
            acceptable_use_version: LEGAL_VERSIONS.acceptableUse,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) return json({ error: data.msg || data.message || 'Unable to create account.' }, 400);
      const signupIdentities = data.user?.identities;
      if (data.user?.id && data.access_token && (!Array.isArray(signupIdentities) || signupIdentities.length > 0)) {
        await recordLegalAcceptance(getUserDb(data.access_token), String(data.user.id), 'email_signup');
      }
      if (data.access_token) {
        await sendVideoStudioWelcome(data, next);
        return withSession({ ok: true, confirmationRequired: false }, data.access_token, data.refresh_token, Number(data.expires_in || 3600));
      }
      return json({ ok: true, confirmationRequired: true }, 202);
    }

    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    return safeError(error);
  }
};
