import type { APIRoute } from 'astro';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  assertSameOrigin,
  billingConfigured,
  cookie,
  encryptSecret,
  ensureSaasUser,
  exchangeXCode,
  getAuthenticatedUser,
  getServerDb,
  json,
  looksLikeUrl,
  markXDisconnected,
  newTokenHandle,
  parseCookies,
  pkceChallenge,
  randomUrlSafe,
  requireUuid,
  safeError,
  stripePriceMap,
  stripeRequest,
  validTimezone,
  validatePostContent,
  xOAuthConfig,
} from '../../../lib/evergreen-x/server';

async function context(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const db = await ensureSaasUser(user);
  return { user, db };
}

async function currentSubscription(db: ReturnType<typeof getServerDb>, userId: string) {
  const { data, error } = await db.from('subscriptions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: plan, error: planError } = await db.from('plans').select('id,name,regular_post_limit,url_post_limit,price_cents,billing_interval,active').eq('id', data.plan_id).maybeSingle();
  if (planError) throw planError;
  return { ...data, plan };
}

async function usageSummary(db: ReturnType<typeof getServerDb>, userId: string, subscription: any) {
  if (!subscription?.period_start || !subscription?.period_end) {
    return { regular: { used: 0, limit: subscription?.plan?.regular_post_limit ?? null }, url: { used: 0, limit: subscription?.plan?.url_post_limit ?? null } };
  }
  const base = db.from('usage_events').select('usage_type').eq('user_id', userId).gte('created_at', subscription.period_start).lt('created_at', subscription.period_end);
  const { data, error } = await base;
  if (error) throw error;
  const regularUsed = (data || []).filter((row) => row.usage_type === 'regular').length;
  const urlUsed = (data || []).filter((row) => row.usage_type === 'url').length;
  return {
    regular: { used: regularUsed, limit: subscription?.plan?.regular_post_limit ?? null },
    url: { used: urlUsed, limit: subscription?.plan?.url_post_limit ?? null },
  };
}

async function dashboard(request: Request) {
  const { user, db } = await context(request);
  const [{ data: settings, error: settingsError }, { data: x, error: xError }, subscription] = await Promise.all([
    db.from('scheduler_settings').select('scheduler_enabled,minimum_interval_minutes,maximum_interval_minutes,daily_post_limit,timezone,next_post_at').eq('user_id', user.id).maybeSingle(),
    db.from('x_connections').select('x_user_id,x_username,connection_status,expires_at:token_expires_at,oauth_relay_ready,last_error').eq('user_id', user.id).maybeSingle(),
    currentSubscription(db, user.id),
  ]);
  if (settingsError) throw settingsError;
  if (xError) throw xError;
  const usage = await usageSummary(db, user.id, subscription);
  const { data: posts, error: postsError } = await db.from('posts').select('status').eq('user_id', user.id);
  if (postsError) throw postsError;
  const rows = posts || [];
  return json({
    user: { email: user.email },
    scheduler: settings || null,
    x: x || { connection_status: 'disconnected', oauth_relay_ready: false },
    subscription,
    billingConfigured: billingConfigured(),
    usage,
    counts: {
      ready: rows.filter((row) => row.status === 'READY').length,
      failed: rows.filter((row) => row.status === 'FAILED').length,
      published: rows.filter((row) => row.status === 'POSTED').length,
    },
  });
}

async function listPosts(request: Request) {
  const { user, db } = await context(request);
  const { data, error } = await db.from('posts')
    .select('id,content,contains_url,status,attempt_count,scheduled_at,posted_at,x_post_url,last_error,created_at,updated_at')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return json({ posts: data || [] });
}

async function createPost(request: Request) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  const body = await request.json().catch(() => ({}));
  const content = validatePostContent(body.content);
  const status = body.status === 'READY' ? 'READY' : 'DRAFT';
  const { data, error } = await db.from('posts').insert({ user_id: user.id, content, status }).select('id,content,contains_url,status,attempt_count,scheduled_at,posted_at,last_error,created_at,updated_at').single();
  if (error) throw error;
  return json({ post: data, previewCategory: looksLikeUrl(content) ? 'url' : 'regular' }, 201);
}

async function updatePost(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  const postId = requireUuid(id);
  const { data: existing, error: existingError } = await db.from('posts').select('id,status').eq('id', postId).eq('user_id', user.id).maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return json({ error: 'Post not found.' }, 404);
  if (existing.status === 'RESERVED' || existing.status === 'POSTED') return json({ error: 'Reserved or published posts cannot be edited.' }, 409);
  const body = await request.json().catch(() => ({}));
  const content = validatePostContent(body.content);
  const { data, error } = await db.from('posts').update({ content, updated_at: new Date().toISOString() }).eq('id', postId).eq('user_id', user.id).select('id,content,contains_url,status,attempt_count,scheduled_at,posted_at,last_error,created_at,updated_at').single();
  if (error) throw error;
  return json({ post: data });
}

async function deletePost(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  const postId = requireUuid(id);
  const { data: existing, error } = await db.from('posts').select('status').eq('id', postId).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!existing) return json({ error: 'Post not found.' }, 404);
  if (existing.status === 'RESERVED') return json({ error: 'A reserved post cannot be deleted while publishing.' }, 409);
  const { error: deleteError } = await db.from('posts').delete().eq('id', postId).eq('user_id', user.id);
  if (deleteError) throw deleteError;
  return json({ ok: true });
}

async function changePostState(request: Request, id: string, action: string) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  const postId = requireUuid(id);
  const { data: existing, error } = await db.from('posts').select('status').eq('id', postId).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!existing) return json({ error: 'Post not found.' }, 404);
  let update: Record<string, unknown>;
  if (action === 'ready') {
    if (!['DRAFT', 'PAUSED'].includes(existing.status)) return json({ error: 'Only draft or paused posts can be marked READY.' }, 409);
    update = { status: 'READY', last_error: null };
  } else if (action === 'draft') {
    if (!['READY', 'FAILED', 'PAUSED'].includes(existing.status)) return json({ error: 'This post cannot be moved to DRAFT.' }, 409);
    update = { status: 'DRAFT' };
  } else if (action === 'retry') {
    if (existing.status !== 'FAILED') return json({ error: 'Only failed posts can be retried.' }, 409);
    update = { status: 'READY', attempt_count: 0, last_error: null, reservation_token: null, reservation_expires_at: null };
  } else {
    return json({ error: 'Unknown post action.' }, 404);
  }
  const { data, error: updateError } = await db.from('posts').update({ ...update, updated_at: new Date().toISOString() }).eq('id', postId).eq('user_id', user.id).select('id,content,contains_url,status,attempt_count,scheduled_at,posted_at,last_error,created_at,updated_at').single();
  if (updateError) throw updateError;
  return json({ post: data });
}

async function getSettings(request: Request) {
  const { user, db } = await context(request);
  const { data, error } = await db.from('scheduler_settings').select('scheduler_enabled,minimum_interval_minutes,maximum_interval_minutes,daily_post_limit,timezone,next_post_at').eq('user_id', user.id).single();
  if (error) throw error;
  return json({ settings: data });
}

async function updateSettings(request: Request) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  const body = await request.json().catch(() => ({}));
  const minimum = Number(body.minimum_interval_minutes);
  const maximum = Number(body.maximum_interval_minutes);
  const daily = Number(body.daily_post_limit);
  if (!Number.isInteger(minimum) || minimum < 30) return json({ error: 'Minimum interval must be at least 30 minutes.' }, 400);
  if (!Number.isInteger(maximum) || maximum < minimum) return json({ error: 'Maximum interval must be greater than or equal to minimum interval.' }, 400);
  if (!Number.isInteger(daily) || daily < 1 || daily > 100) return json({ error: 'Daily post limit must be between 1 and 100.' }, 400);
  if (!validTimezone(body.timezone)) return json({ error: 'Enter a valid IANA timezone.' }, 400);
  const update = {
    scheduler_enabled: Boolean(body.scheduler_enabled),
    minimum_interval_minutes: minimum,
    maximum_interval_minutes: maximum,
    daily_post_limit: daily,
    timezone: body.timezone,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('scheduler_settings').update(update).eq('user_id', user.id).select('scheduler_enabled,minimum_interval_minutes,maximum_interval_minutes,daily_post_limit,timezone,next_post_at').single();
  if (error) throw error;
  return json({ settings: data });
}

async function plans(request: Request) {
  const { db } = await context(request);
  const { data, error } = await db.from('plans').select('id,name,regular_post_limit,url_post_limit,price_cents,billing_interval,active').eq('active', true).order('price_cents', { ascending: true });
  if (error) throw error;
  return json({ plans: data || [], billingConfigured: billingConfigured() });
}

async function xStatus(request: Request) {
  const { user, db } = await context(request);
  const { data, error } = await db.from('x_connections').select('x_user_id,x_username,connection_status,token_expires_at,oauth_relay_ready,last_error,connected_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return json({ connection: data || { connection_status: 'disconnected', oauth_relay_ready: false } });
}

async function xConnect(request: Request) {
  const { user } = await context(request);
  void user;
  const cfg = xOAuthConfig();
  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    scope: cfg.scopes,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  const headers = new Headers({ location: url.toString(), 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(OAUTH_STATE_COOKIE, state, { maxAge: 600, path: '/api/evergreen-x/x' }));
  headers.append('set-cookie', cookie(OAUTH_VERIFIER_COOKIE, verifier, { maxAge: 600, path: '/api/evergreen-x/x' }));
  return new Response(null, { status: 302, headers });
}

async function xCallback(request: Request) {
  const { user, db } = await context(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const cookies = parseCookies(request);
  if (errorParam) return new Response(null, { status: 302, headers: { location: `/app/evergreen-x?x_error=${encodeURIComponent(errorParam)}` } });
  if (!code || !state || !cookies[OAUTH_STATE_COOKIE] || state !== cookies[OAUTH_STATE_COOKIE] || !cookies[OAUTH_VERIFIER_COOKIE]) {
    return json({ error: 'Invalid or expired X OAuth callback.' }, 400);
  }
  const token = await exchangeXCode(code, cookies[OAUTH_VERIFIER_COOKIE]);
  const meResponse = await fetch('https://api.x.com/2/users/me', { headers: { authorization: `Bearer ${token.access_token}` } });
  const me = await meResponse.json().catch(() => ({}));
  if (!meResponse.ok || !me?.data?.id) return json({ error: 'Unable to verify the connected X account.' }, 502);
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 7200) * 1000).toISOString();
  const { error } = await db.from('x_connections').upsert({
    user_id: user.id,
    x_user_id: String(me.data.id),
    x_username: String(me.data.username || ''),
    access_token_ciphertext: encryptSecret(token.access_token),
    refresh_token_ciphertext: token.refresh_token ? encryptSecret(token.refresh_token) : null,
    token_expires_at: expiresAt,
    scopes: token.scope || null,
    connection_status: 'connected',
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    token_handle: newTokenHandle(),
    oauth_relay_ready: true,
  }, { onConflict: 'user_id' });
  if (error) throw error;
  const headers = new Headers({ location: '/app/evergreen-x?x_connected=1', 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, path: '/api/evergreen-x/x' }));
  headers.append('set-cookie', cookie(OAUTH_VERIFIER_COOKIE, '', { maxAge: 0, path: '/api/evergreen-x/x' }));
  return new Response(null, { status: 302, headers });
}

async function xDisconnect(request: Request) {
  assertSameOrigin(request);
  const { user } = await context(request);
  await markXDisconnected(user.id);
  return json({ ok: true });
}

async function billingCheckout(request: Request) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  if (!billingConfigured()) return json({ error: 'Billing is not configured yet.' }, 503);
  const body = await request.json().catch(() => ({}));
  const planId = typeof body.plan_id === 'string' ? body.plan_id : '';
  const { data: plan, error } = await db.from('plans').select('id,active').eq('id', planId).maybeSingle();
  if (error) throw error;
  if (!plan?.active) return json({ error: 'Plan is not available.' }, 400);
  const price = stripePriceMap()[planId];
  if (!price) return json({ error: 'Billing price is not configured for this plan.' }, 503);
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${origin}/app/evergreen-x?billing=success`,
    cancel_url: `${origin}/tools/evergreen-x-scheduler?billing=cancelled`,
    'metadata[user_id]': user.id,
    'metadata[plan_id]': planId,
    'subscription_data[metadata][user_id]': user.id,
    'subscription_data[metadata][plan_id]': planId,
  });
  const session = await stripeRequest('checkout/sessions', params);
  return json({ url: session.url });
}

async function billingPortal(request: Request) {
  assertSameOrigin(request);
  const { user, db } = await context(request);
  if (!billingConfigured()) return json({ error: 'Billing is not configured yet.' }, 503);
  const { data, error } = await db.from('subscriptions').select('provider_customer_id').eq('user_id', user.id).not('provider_customer_id', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.provider_customer_id) return json({ error: 'No billing customer is linked to this account.' }, 404);
  const origin = new URL(request.url).origin;
  const portal = await stripeRequest('billing_portal/sessions', new URLSearchParams({ customer: data.provider_customer_id, return_url: `${origin}/app/evergreen-x` }));
  return json({ url: portal.url });
}

async function route(request: Request, path: string, method: string) {
  if (path === 'dashboard' && method === 'GET') return dashboard(request);
  if (path === 'usage' && method === 'GET') return dashboard(request);
  if (path === 'plans' && method === 'GET') return plans(request);
  if (path === 'posts' && method === 'GET') return listPosts(request);
  if (path === 'posts' && method === 'POST') return createPost(request);
  if (path === 'settings' && method === 'GET') return getSettings(request);
  if (path === 'settings' && method === 'PATCH') return updateSettings(request);
  if (path === 'x/status' && method === 'GET') return xStatus(request);
  if (path === 'x/connect' && method === 'GET') return xConnect(request);
  if (path === 'x/callback' && method === 'GET') return xCallback(request);
  if (path === 'x/disconnect' && method === 'POST') return xDisconnect(request);
  if (path === 'billing/checkout' && method === 'POST') return billingCheckout(request);
  if (path === 'billing/portal' && method === 'POST') return billingPortal(request);
  const postMatch = path.match(/^posts\/([^/]+)(?:\/(ready|draft|retry))?$/);
  if (postMatch) {
    if (!postMatch[2] && method === 'PATCH') return updatePost(request, postMatch[1]);
    if (!postMatch[2] && method === 'DELETE') return deletePost(request, postMatch[1]);
    if (postMatch[2] && method === 'POST') return changePostState(request, postMatch[1], postMatch[2]);
  }
  return json({ error: 'Not found.' }, 404);
}

const handler: APIRoute = async ({ request, params }) => {
  try {
    return await route(request, params.path || '', request.method.toUpperCase());
  } catch (error) {
    return safeError(error);
  }
};

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
