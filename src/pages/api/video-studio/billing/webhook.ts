import type Stripe from 'stripe';
import type { APIRoute } from 'astro';
import { getServiceDb, getStripeClient, json, safeError } from '../../../../lib/video-studio/server';

function unixToIso(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice) {
  const value = invoice as any;
  const subscription = value.subscription || value.parent?.subscription_details?.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id || null;
}

async function grantCredits(userId: string, amount: number, type: string, idempotencyKey: string, paymentId: string) {
  if (!Number.isInteger(amount) || amount <= 0) return;
  const { error } = await getServiceDb().from('video_studio_credit_ledger').insert({
    user_id: userId,
    amount,
    transaction_type: type,
    payment_id: paymentId,
    idempotency_key: idempotencyKey,
    metadata: { source: 'stripe_verified_webhook' },
  });
  if (error && error.code !== '23505') throw error;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata || {};
  const userId = metadata.user_id;
  const planId = metadata.plan_id;
  if (!userId || !planId) return;

  const value = subscription as any;
  const db = getServiceDb();
  const updatedAt = new Date().toISOString();
  const { error } = await db.from('video_studio_subscriptions').upsert({
    user_id: userId,
    plan: planId,
    status: subscription.status,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    renewal_date: unixToIso(value.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: updatedAt,
  }, { onConflict: 'stripe_subscription_id' });
  if (error) throw error;

  const paidAccess = ['trialing', 'active', 'past_due'].includes(subscription.status);
  const { error: profileError } = await db
    .from('video_studio_profiles')
    .update({
      plan_id: paidAccess ? planId : 'internal_beta',
      internal_beta: !paidAccess,
      updated_at: updatedAt,
    })
    .eq('user_id', userId);
  if (profileError) throw profileError;
}

export const POST: APIRoute = async ({ request }) => {
  let eventId: string | null = null;
  try {
    const { stripe, webhookSecret, mode } = getStripeClient();
    if (!webhookSecret) return json({ error: 'Stripe webhook verification is not configured.' }, 503);

    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    if (!signature) return json({ error: 'Missing Stripe signature.' }, 400);

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const expectedLiveMode = mode === 'live';
    if (event.livemode !== expectedLiveMode) {
      return json({ error: `Stripe event mode does not match VIDEO_STRIPE_MODE=${mode}.` }, 400);
    }

    eventId = event.id;
    const db = getServiceDb();
    const { data: claimed, error: claimError } = await db.rpc('video_studio_claim_stripe_event', {
      p_event_id: event.id,
      p_event_type: event.type,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ received: true, duplicate: true });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const userId = metadata.user_id || session.client_reference_id;
      const amount = Number(metadata.credit_grant || 0);
      if (userId && session.payment_status === 'paid' && amount > 0) {
        await grantCredits(
          userId,
          amount,
          'paid_trial',
          `stripe_checkout:${session.id}`,
          typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
        );
      }
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
      if (subscriptionId) await upsertSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    } else if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
      || event.type === 'customer.subscription.trial_will_end'
    ) {
      await upsertSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (event.type === 'invoice.paid') {
          const value = invoice as any;
          const isIntroInvoice = value.billing_reason === 'subscription_create' && Boolean(subscription.trial_start);
          const userId = subscription.metadata?.user_id;
          const amount = Number(subscription.metadata?.monthly_credit_grant || 0);
          if (!isIntroInvoice && userId && amount > 0) {
            await grantCredits(userId, amount, 'subscription_renewal', `stripe_invoice:${invoice.id}`, invoice.id);
          }
        }
        await upsertSubscription(subscription);
      }
    }

    const { error: completeError } = await db
      .from('video_studio_stripe_events')
      .update({ status: 'completed', processed_at: new Date().toISOString(), error: null })
      .eq('event_id', event.id);
    if (completeError) throw completeError;
    return json({ received: true });
  } catch (error) {
    if (eventId) {
      try {
        await getServiceDb()
          .from('video_studio_stripe_events')
          .update({
            status: 'failed',
            error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown webhook error.',
          })
          .eq('event_id', eventId);
      } catch {
        // Stripe retries the original event; do not mask the primary failure.
      }
    }
    return safeError(error);
  }
};

