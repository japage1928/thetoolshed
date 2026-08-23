import type { APIRoute } from 'astro';
import { getServerDb, json, parseCookies, safeError } from '../../../../lib/evergreen-x/server';

async function adminUser(request: Request) {
  const token = parseCookies(request).ts_admin_access_token;
  const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!token || !url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  const allowed = (process.env.EVERGREEN_X_ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !allowed.includes(String(user.email).toLowerCase())) return null;
  return user;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await adminUser(request)) return json({ error: 'Forbidden.' }, 403);
    const db = getServerDb();
    const now = new Date().toISOString();
    const [{ count: users }, { count: activeSubs }, { count: connected }, { count: published }, { count: failed }, { count: reconnect }] = await Promise.all([
      db.from('users').select('*', { head: true, count: 'exact' }),
      db.from('subscriptions').select('*', { head: true, count: 'exact' }).in('status', ['active', 'trialing']),
      db.from('x_connections').select('*', { head: true, count: 'exact' }).eq('connection_status', 'connected').eq('oauth_relay_ready', true),
      db.from('posts').select('*', { head: true, count: 'exact' }).eq('status', 'POSTED'),
      db.from('posts').select('*', { head: true, count: 'exact' }).eq('status', 'FAILED'),
      db.from('x_connections').select('*', { head: true, count: 'exact' }).or('connection_status.eq.reconnect_required,oauth_relay_ready.eq.false'),
    ]);

    const { data: subscriptions, error: subError } = await db.from('subscriptions').select('user_id,plan_id,period_start,period_end,status').in('status', ['active', 'trialing']).lte('period_start', now).gt('period_end', now);
    if (subError) throw subError;
    const { data: plans, error: planError } = await db.from('plans').select('id,regular_post_limit,url_post_limit');
    if (planError) throw planError;
    const planMap = Object.fromEntries((plans || []).map((p) => [p.id, p]));
    const nearQuota: any[] = [];
    for (const sub of subscriptions || []) {
      const { data: usage } = await db.from('usage_events').select('usage_type').eq('user_id', sub.user_id).gte('created_at', sub.period_start).lt('created_at', sub.period_end);
      const plan = planMap[sub.plan_id];
      const regular = (usage || []).filter((u) => u.usage_type === 'regular').length;
      const url = (usage || []).filter((u) => u.usage_type === 'url').length;
      const regularLimit = plan?.regular_post_limit ?? null;
      const urlLimit = plan?.url_post_limit ?? null;
      if ((regularLimit && regular / regularLimit >= .8) || (urlLimit && url / urlLimit >= .8)) nearQuota.push({ user_id: sub.user_id, plan_id: sub.plan_id, regular, regular_limit: regularLimit, url, url_limit: urlLimit });
    }
    return json({ totals: { users: users || 0, active_subscriptions: activeSubs || 0, connected_x_accounts: connected || 0, published_posts: published || 0, failed_posts: failed || 0, reconnect_needed: reconnect || 0 }, near_quota: nearQuota });
  } catch (error) {
    return safeError(error);
  }
};
