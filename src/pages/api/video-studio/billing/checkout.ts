import type Stripe from 'stripe';
import type { APIRoute } from 'astro';
import {
  assertSameOrigin,
  getAuthenticatedUser,
  getStripeClient,
  getUserDb,
  json,
  safeError,
} from '../../../../lib/video-studio/server';

const MONTHLY_CREDIT_GRANT = 60;
const INTRO_CREDIT_GRANT = 15;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { stripe, prices } = getStripeClient();
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before opening checkout.' }, 401);

    const { data: subscriptionRows, error: subscriptionError } = await getUserDb(user.token)
      .from('video_studio_subscriptions')
      .select('stripe_customer_id,stripe_subscription_id,status,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (subscriptionError) throw subscriptionError;

    const existing = subscriptionRows?.[0];
    if (existing?.status && ACTIVE_SUBSCRIPTION_STATUSES.has(existing.status)) {
      return json({ error: 'A Video Studio subscription already exists. Use Manage billing instead.' }, 409);
    }

    const introEligible = !existing;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: prices.starter, quantity: 1 },
      ...(introEligible ? [{ price: prices.trial, quantity: 1 }] : []),
    ];
    const siteUrl = new URL(request.url).origin;
    const rawIdempotencyKey = request.headers.get('idempotency-key')?.trim() || '';
    const idempotencyKey = /^[0-9a-f-]{36}$/i.test(rawIdempotencyKey)
      ? `video-studio-checkout:${user.id}:${rawIdempotencyKey}`
      : null;
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      integration_identifier: 'video_studio_subscription_qjrmxkpa',
      line_items: lineItems,
      client_reference_id: user.id,
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      payment_method_collection: 'always',
      automatic_tax: { enabled: false },
      metadata: {
        user_id: user.id,
        intent: introEligible ? 'paid_trial' : 'subscription',
        plan_id: 'starter',
        credit_grant: introEligible ? String(INTRO_CREDIT_GRANT) : '0',
      },
      subscription_data: {
        ...(introEligible ? { trial_period_days: 3 } : {}),
        metadata: {
          user_id: user.id,
          plan_id: 'starter',
          monthly_credit_grant: String(MONTHLY_CREDIT_GRANT),
        },
      },
      success_url: `${siteUrl}/app/video-studio?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app/video-studio?billing=canceled`,
    };
    const session = idempotencyKey
      ? await stripe.checkout.sessions.create(sessionParams, { idempotencyKey })
      : await stripe.checkout.sessions.create(sessionParams);
    if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
    return json({ url: session.url });
  } catch (error) {
    return safeError(error);
  }
};
