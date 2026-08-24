import type Stripe from 'stripe';
import type { APIRoute } from 'astro';
import { dispatchVideoEmailSafely } from '../../../../lib/video-studio/email';
import { getServiceDb, getStripeClient, json, safeError } from '../../../../lib/video-studio/server';

function unixToIso(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const value = invoice as any;
  const candidate = typeof value.subscription === 'string'
    ? value.subscription
    : value.subscription?.id || value.parent?.subscription_details?.subscription;
  return typeof candidate === 'string' ? candidate : null;
}

async function userEmail(userId: string, fallback?: string | null) {
  if (fallback) return fallback;
  const { data, error } = await getServiceDb().auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email || null;
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
  const { error } = await getServiceDb().from('video_studio_subscriptions').upsert({
    user_id: userId,
    plan: planId,
    status: subscription.status,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    renewal_date: unixToIso(value.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' });
  if (error) throw error;
}

export const POST: APIRoute = async ({ request }) => {
  let eventId: string | null = null;
  try {
    const { stripe, webhookSecret } = getStripeClient();
    if (!webhookSecret) return json({ error: 'Stripe webhook verification is not configured.' }, 503);
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    if (!signature) return json({ error: 'Missing Stripe signature.' }, 400);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    if (event.livemode) return json({ error: 'Live-mode Stripe events are rejected by the internal beta.' }, 400);
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
      const credits = Number(metadata.credit_grant || 0);
      const recipient = userId
        ? await userEmail(userId, session.customer_details?.email || session.customer_email)
        : null;

      if (userId && session.payment_status === 'paid') {
        if (credits > 0) {
          await grantCredits(
            userId,
            credits,
            metadata.intent === 'credit_pack' ? 'credit_pack' : 'paid_trial',
            `stripe_checkout:${session.id}`,
            typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
          );
        }

        if (recipient && metadata.intent === 'credit_pack') {
          await dispatchVideoEmailSafely({
            event_id: `video_email:${event.id}:credit_pack`,
            event_type: 'credit_pack_purchased',
            user_id: userId,
            email: recipient,
            amount_cents: session.amount_total || 0,
            credits,
          });
        } else if (recipient && metadata.intent === 'paid_trial') {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
          let trialEndsAt: string | null = null;
          let renewalAmountCents = 1999;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await upsertSubscription(subscription);
            const value = subscription as any;
            trialEndsAt = unixToIso(value.trial_end);
            const recurringItem = subscription.items.data.find((item) => Boolean(item.price.recurring));
            renewalAmountCents = recurringItem?.price.unit_amount || renewalAmountCents;
          }
          await dispatchVideoEmailSafely({
            event_id: `video_email:${event.id}:trial_started`,
            event_type: 'trial_started',
            user_id: userId,
            email: recipient,
            amount_cents: session.amount_total || 0,
            renewal_amount_cents: renewalAmountCents,
            credits,
            trial_ends_at: trialEndsAt,
          });
        }
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscription(subscription);
      const userId = subscription.metadata?.user_id;
      if (userId) {
        const recipient = await userEmail(userId);
        const value = subscription as any;
        const accessEndsAt = unixToIso(value.current_period_end);
        const previous = event.data.previous_attributes as Record<string, unknown> | undefined;
        if (
          recipient
          && event.type === 'customer.subscription.updated'
          && subscription.cancel_at_period_end
          && previous?.cancel_at_period_end === false
        ) {
          await dispatchVideoEmailSafely({
            event_id: `video_email:${event.id}:subscription_canceling`,
            event_type: 'subscription_canceling',
            user_id: userId,
            email: recipient,
            access_ends_at: accessEndsAt,
          });
        } else if (recipient && event.type === 'customer.subscription.deleted') {
          await dispatchVideoEmailSafely({
            event_id: `video_email:${event.id}:subscription_ended`,
            event_type: 'subscription_ended',
            user_id: userId,
            email: recipient,
            access_ends_at: accessEndsAt,
          });
        }
      }
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const value = invoice as any;
      if (value.billing_reason !== 'subscription_create') {
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.user_id;
          const credits = Number(subscription.metadata?.monthly_credit_grant || 0);
          if (userId && credits > 0) {
            await grantCredits(userId, credits, 'subscription_renewal', `stripe_invoice:${invoice.id}`, invoice.id);
          }
          await upsertSubscription(subscription);
          const recipient = userId ? await userEmail(userId, invoice.customer_email) : null;
          if (userId && recipient) {
            await dispatchVideoEmailSafely({
              event_id: `video_email:${event.id}:payment_succeeded`,
              event_type: 'payment_succeeded',
              user_id: userId,
              email: recipient,
              amount_cents: invoice.amount_paid || 0,
              credits,
            });
          }
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(subscription);
        const userId = subscription.metadata?.user_id;
        const recipient = userId ? await userEmail(userId, invoice.customer_email) : null;
        if (userId && recipient) {
          await dispatchVideoEmailSafely({
            event_id: `video_email:${event.id}:payment_failed`,
            event_type: 'payment_failed',
            user_id: userId,
            email: recipient,
            amount_cents: invoice.amount_due || 0,
          });
        }
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
          .update({ status: 'failed', error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown webhook error.' })
          .eq('event_id', eventId);
      } catch {
        // Stripe will retry the original event; do not mask the primary failure.
      }
    }
    return safeError(error);
  }
};
