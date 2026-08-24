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

const grants = { starter: 60, creator: 140, topup: 25 } as const;

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { stripe, prices } = getStripeClient();
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before opening checkout.' }, 401);
    const body = await request.json().catch(() => ({}));
    const intent = ['starter', 'creator', 'topup'].includes(body.intent) ? body.intent as keyof typeof grants : null;
    if (!intent) return json({ error: 'Invalid checkout option.' }, 400);

    const db = getServiceDb();
    const { data: subscriptionRows } = await db
      .from('video_studio_subscriptions')
      .select('stripe_customer_id,status')
      .eq('user_id', user.id)
      .limit(1);
    const existing = subscriptionRows?.[0];
    const siteUrl = publicSiteUrl();

    if (intent === 'topup') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: prices.topup, quantity: 1 }],
        client_reference_id: user.id,
        customer: existing?.stripe_customer_id || undefined,
        customer_email: existing?.stripe_customer_id ? undefined : user.email,
        metadata: { user_id: user.id, intent: 'credit_pack', credit_grant: String(grants.topup) },
        success_url: `${siteUrl}/app/video-studio?billing=success`,
        cancel_url: `${siteUrl}/app/video-studio?billing=canceled`,
      });
      return json({ url: session.url });
    }

    const trialEligible = !existing;
    const recurringPrice = intent === 'starter' ? prices.starter : prices.creator;
    const lineItems = [{ price: recurringPrice, quantity: 1 }];
    if (trialEligible) lineItems.push({ price: prices.trial, quantity: 1 });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      client_reference_id: user.id,
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      payment_method_collection: 'always',
      metadata: {
        user_id: user.id,
        intent: trialEligible ? 'paid_trial' : 'subscription',
        plan_id: intent,
        credit_grant: trialEligible ? '15' : '0',
      },
      subscription_data: {
        ...(trialEligible ? { trial_period_days: 3 } : {}),
        metadata: { user_id: user.id, plan_id: intent, monthly_credit_grant: String(grants[intent]) },
      },
      success_url: `${siteUrl}/app/video-studio?billing=success`,
      cancel_url: `${siteUrl}/app/video-studio?billing=canceled`,
    });
    return json({ url: session.url });
  } catch (error) {
    return safeError(error);
  }
};
