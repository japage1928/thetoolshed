import type { APIRoute } from 'astro';
import { getServerDb as getEvergreenDb } from '../../../lib/evergreen-x/server';
import { LEGAL_VERSIONS } from '../../../lib/legal-versions';
import {
  billingEnabled,
  getAuthenticatedUser,
  getUserDb,
  json,
  safeError,
} from '../../../lib/video-studio/server';

const activeStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

export const GET: APIRoute = async ({ request }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in to view your account.' }, 401);
    const db = getUserDb(user.token);
    const { error: bootstrapError } = await db.rpc('video_studio_bootstrap_profile');
    if (bootstrapError) throw bootstrapError;

    const [profileResult, subscriptionResult, ledgerResult, usageResult, legalResult] = await Promise.all([
      db.from('video_studio_profiles').select('display_name,plan_id,created_at').maybeSingle(),
      db
        .from('video_studio_subscriptions')
        .select('plan,status,renewal_date,cancel_at_period_end,stripe_customer_id,updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('video_studio_credit_ledger')
        .select('amount,transaction_type,created_at')
        .order('created_at', { ascending: false })
        .limit(12),
      db.rpc('video_studio_account_usage'),
      db
        .from('tool_shed_legal_acceptances')
        .select('accepted_at')
        .eq('terms_version', LEGAL_VERSIONS.terms)
        .eq('privacy_version', LEGAL_VERSIONS.privacy)
        .eq('acceptable_use_version', LEGAL_VERSIONS.acceptableUse)
        .limit(1)
        .maybeSingle(),
    ]);

    for (const result of [profileResult, subscriptionResult, ledgerResult, usageResult, legalResult]) {
      if (result.error) throw result.error;
    }

    const subscription = subscriptionResult.data;
    const ledger = ledgerResult.data || [];
    const usage = (usageResult.data || {}) as Record<string, unknown>;
    let otherActiveSubscriptions = 0;
    try {
      const { count, error } = await getEvergreenDb()
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', [...activeStatuses]);
      if (!error) otherActiveSubscriptions = count || 0;
    } catch {
      // Evergreen X is not launched for every account. Its absence must not hide Video Studio account data.
    }

    const videoSubscriptionActive = Boolean(subscription && activeStatuses.has(subscription.status));
    return json({
      account: {
        email: user.email,
        displayName: profileResult.data?.display_name || null,
        createdAt: profileResult.data?.created_at || null,
      },
      usage: {
        availableCredits: Number(usage.available_credits || 0),
        creditsGranted: Number(usage.credits_granted || 0),
        creditsUsed: Number(usage.credits_used || 0),
        projectCount: Number(usage.project_count || 0),
        generationCount: Number(usage.generation_count || 0),
        completedGenerations: Number(usage.completed_generations || 0),
      },
      creditActivity: ledger,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        renewalDate: subscription.renewal_date,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        canManageBilling: Boolean(subscription.stripe_customer_id) && billingEnabled(),
      } : null,
      billingEnabled: billingEnabled(),
      privacy: {
        canDeleteAccount: !videoSubscriptionActive && otherActiveSubscriptions === 0,
        activeSubscriptionCount: Number(videoSubscriptionActive) + otherActiveSubscriptions,
      },
      legal: {
        currentAccepted: Boolean(legalResult.data),
        acceptedAt: legalResult.data?.accepted_at || null,
        versions: LEGAL_VERSIONS,
      },
    });
  } catch (error) {
    return safeError(error);
  }
};
