import type { APIRoute } from 'astro';
import {
  assertSameOrigin,
  getAuthenticatedUser,
  getServiceDb,
  getStripeClient,
  json,
  publicSiteUrl,
  safeError,
} from '../../../../lib/video-studio/server';

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { stripe } = getStripeClient();
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before opening billing.' }, 401);
    const { data, error } = await getServiceDb()
      .from('video_studio_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.stripe_customer_id) return json({ error: 'No Stripe customer is attached to this account.' }, 404);
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${publicSiteUrl()}/app/video-studio`,
    });
    return json({ url: session.url });
  } catch (error) {
    return safeError(error);
  }
};
