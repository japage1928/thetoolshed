import type { APIRoute } from 'astro';
import { getServerDb, json, safeError, verifyStripeSignature } from '../../../../lib/evergreen-x/server';

function isoFromUnix(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

async function upsertSubscription(object: any, eventType: string) {
  const metadata = object?.metadata || {};
  const userId = metadata.user_id || object?.client_reference_id;
  const planId = metadata.plan_id;
  const subscriptionId = typeof object?.subscription === 'string' ? object.subscription : object?.id;
  const customerId = typeof object?.customer === 'string' ? object.customer : null;
  if (!userId || !planId || !subscriptionId) return;

  const db = getServerDb();
  const status = eventType === 'customer.subscription.deleted' ? 'canceled' : (object.status || 'active');
  const row = {
    user_id: userId,
    plan_id: planId,
    provider: 'stripe',
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    status,
    period_start: isoFromUnix(object.current_period_start) || new Date().toISOString(),
    period_end: isoFromUnix(object.current_period_end) || new Date(Date.now() + 30 * 86400_000).toISOString(),
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'provider_subscription_id' });
  if (error) throw error;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.text();
    if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'))) return json({ error: 'Invalid webhook signature.' }, 400);
    const event = JSON.parse(raw);
    const object = event?.data?.object;
    if (event?.type === 'checkout.session.completed') {
      const metadata = object?.metadata || {};
      const userId = metadata.user_id || object?.client_reference_id;
      const planId = metadata.plan_id;
      const subscriptionId = typeof object?.subscription === 'string' ? object.subscription : null;
      if (userId && planId && subscriptionId) {
        const db = getServerDb();
        const { error } = await db.from('subscriptions').upsert({
          user_id: userId,
          plan_id: planId,
          provider: 'stripe',
          provider_customer_id: typeof object.customer === 'string' ? object.customer : null,
          provider_subscription_id: subscriptionId,
          status: 'active',
          period_start: new Date().toISOString(),
          period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider_subscription_id' });
        if (error) throw error;
      }
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event?.type)) {
      await upsertSubscription(object, event.type);
    }
    return json({ received: true });
  } catch (error) {
    return safeError(error);
  }
};
