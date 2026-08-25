import type { APIRoute } from 'astro';
import { assertSameOrigin, getAuthenticatedUser, getServiceDb, getStripeClient, json, publicSiteUrl, safeError } from '../../../../lib/video-studio/server';

async function portalConfiguration(stripe: ReturnType<typeof getStripeClient>['stripe']) {
  const configuredId = process.env.VIDEO_STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (configuredId) return configuredId;
  const siteUrl = publicSiteUrl();
  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const active = existing.data.find((configuration) => configuration.active && configuration.business_profile.privacy_policy_url === `${siteUrl}/privacy-policy` && configuration.business_profile.terms_of_service_url === `${siteUrl}/terms` && configuration.features.customer_update.enabled && configuration.features.invoice_history.enabled && configuration.features.payment_method_update.enabled && configuration.features.subscription_cancel.enabled && configuration.features.subscription_cancel.mode === 'at_period_end');
  if (active) return active.id;
  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your Video Studio subscription', privacy_policy_url: `${siteUrl}/privacy-policy`, terms_of_service_url: `${siteUrl}/terms` },
    default_return_url: `${siteUrl}/app/video-studio/billing`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['address','phone','tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive','missing_features','switched_service','unused','other'] } },
      subscription_update: { enabled: false },
    },
  });
  return configuration.id;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { stripe } = getStripeClient();
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before opening billing.' }, 401);
    const { data, error } = await getServiceDb().from('video_studio_subscriptions').select('stripe_customer_id').eq('user_id', user.id).not('stripe_customer_id','is',null).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.stripe_customer_id) return json({ error: 'No Stripe customer is attached to this account.' }, 404);
    const configuration = await portalConfiguration(stripe);
    const session = await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, configuration, return_url: `${publicSiteUrl()}/app/video-studio/billing` });
    return json({ url: session.url });
  } catch (error) { return safeError(error); }
};