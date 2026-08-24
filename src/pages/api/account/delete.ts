import type { APIRoute } from 'astro';
import {
  SAAS_ACCESS_COOKIE,
  SAAS_REFRESH_COOKIE,
  clearCookie,
  getServerDb as getEvergreenDb,
} from '../../../lib/evergreen-x/server';
import {
  assertSameOrigin,
  getAuthenticatedUser,
  getServiceDb,
  json,
  safeError,
} from '../../../lib/video-studio/server';

const activeStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before deleting your account.' }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== 'DELETE') {
      return json({ error: 'Type DELETE to confirm account deletion.' }, 400);
    }

    const db = getServiceDb();
    const { count: videoCount, error: videoError } = await db
      .from('video_studio_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', activeStatuses);
    if (videoError) throw videoError;

    const { count: evergreenCount, error: evergreenError } = await getEvergreenDb()
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', activeStatuses);
    if (evergreenError) throw evergreenError;

    if ((videoCount || 0) + (evergreenCount || 0) > 0) {
      return json({
        error: 'Cancel active Tool Shed subscriptions before deleting the account. Contact support if you need an immediate privacy deletion.',
        code: 'active_subscription',
      }, 409);
    }

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;

    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      'netlify-cdn-cache-control': 'no-store',
    });
    headers.append('set-cookie', clearCookie(SAAS_ACCESS_COOKIE));
    headers.append('set-cookie', clearCookie(SAAS_REFRESH_COOKIE));
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (error) {
    return safeError(error);
  }
};
