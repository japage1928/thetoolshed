import type { APIRoute } from 'astro';
import { billingEnabled, generationEnabled, getAuthenticatedUser, getUserDb, json, requireCurrentLegalAcceptance, safeError } from '../../../lib/video-studio/server';

export const GET: APIRoute = async ({ request }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Authentication required.' }, 401);
    const db = getUserDb(user.token);
    await requireCurrentLegalAcceptance(db);
    const [profile, subscription, balance, usage, projects] = await Promise.all([
      db.from('video_studio_profiles').select('display_name,plan_id,internal_beta').eq('user_id', user.id).maybeSingle(),
      db.from('video_studio_subscriptions').select('plan,status,renewal_date,cancel_at_period_end,stripe_customer_id').eq('user_id', user.id).maybeSingle(),
      db.rpc('video_studio_credit_balance'),
      db.rpc('video_studio_account_usage'),
      db.from('video_studio_projects').select('id', { count: 'exact', head: true }),
    ]);
    for (const result of [profile, subscription, balance, usage, projects]) if (result.error) throw result.error;
    const activeSubscription = subscription.data?.status === 'active';
    return json({
      email: user.email,
      displayName: profile.data?.display_name || null,
      plan: subscription.data?.plan || profile.data?.plan_id || 'internal_beta',
      subscriptionStatus: subscription.data?.status || 'inactive',
      renewalDate: subscription.data?.renewal_date || null,
      cancelAtPeriodEnd: Boolean(subscription.data?.cancel_at_period_end),
      manageSubscriptionAvailable: Boolean(subscription.data?.stripe_customer_id) && billingEnabled(),
      credits: Number(balance.data || 0),
      usage: usage.data || {},
      projectCount: projects.count || 0,
      generationEnabled: generationEnabled() && (Boolean(profile.data?.internal_beta) || activeSubscription),
      billingEnabled: billingEnabled(),
    });
  } catch (error) { return safeError(error); }
};