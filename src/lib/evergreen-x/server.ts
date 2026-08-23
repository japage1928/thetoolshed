import { createClient } from '@supabase/supabase-js';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

export const SAAS_ACCESS_COOKIE = 'ts_saas_access_token';
export const SAAS_REFRESH_COOKIE = 'ts_saas_refresh_token';
export const OAUTH_STATE_COOKIE = 'ts_x_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'ts_x_oauth_verifier';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });
}

export function env(name: string, required = true): string | undefined {
  const value = process.env[name]?.trim();
  if (!value && required) throw new Error(`Missing required environment variable: ${name}`);
  return value || undefined;
}

function supabaseUrl() {
  return (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function supabasePublishableKey() {
  return process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
}

export function getServerDb() {
  const url = supabaseUrl();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SaaS database server credentials are not configured.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).schema('evergreen_saas');
}

export function parseCookies(request: Request) {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

export function cookie(name: string, value: string, options: { maxAge?: number; path?: string; sameSite?: 'Lax' | 'Strict'; httpOnly?: boolean } = {}) {
  const maxAge = options.maxAge ?? 3600;
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const httpOnly = options.httpOnly ?? true;
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; Secure; SameSite=${sameSite}${httpOnly ? '; HttpOnly' : ''}`;
}

export function clearCookie(name: string, path = '/') {
  return `${name}=; Path=${path}; Max-Age=0; Secure; SameSite=Lax; HttpOnly`;
}

export async function getAuthenticatedUser(request: Request) {
  const token = parseCookies(request)[SAAS_ACCESS_COOKIE];
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!token || !url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || !user?.email) return null;
  return { id: String(user.id), email: String(user.email) };
}

export async function ensureSaasUser(user: { id: string; email: string }) {
  const db = getServerDb();
  const { error } = await db.from('users').upsert({ id: user.id, email: user.email, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
  const { error: settingsError } = await db.from('scheduler_settings').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (settingsError) throw settingsError;
  return db;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403 });
}

export function validatePostContent(value: unknown) {
  if (typeof value !== 'string') throw Object.assign(new Error('Post content is required.'), { status: 400 });
  const content = value.trim();
  if (!content) throw Object.assign(new Error('Post content cannot be empty.'), { status: 400 });
  const length = Array.from(content).length;
  if (length > 280) throw Object.assign(new Error('Post content exceeds the practical 280-character X limit.'), { status: 400 });
  return content;
}

export function looksLikeUrl(content: string) {
  return /(^|[^\w])(https?:\/\/|www\.)\S+/i.test(content) || /(^|[^\w])[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/\S*)?/i.test(content);
}

export function validTimezone(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; }
}

export function requireUuid(value: string | undefined) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw Object.assign(new Error('Invalid resource id.'), { status: 400 });
  }
  return value;
}

function tokenKey() {
  const raw = env('EVERGREEN_X_TOKEN_ENCRYPTION_KEY')!;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('EVERGREEN_X_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted token payload.');
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function randomUrlSafe(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyInternalService(request: Request) {
  const expected = env('N8N_EVERGREEN_X_SERVICE_SECRET');
  const provided = request.headers.get('x-tool-shed-service-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!provided && !!expected && secureEqual(provided, expected);
}

export function xOAuthConfig() {
  return {
    clientId: env('X_OAUTH_CLIENT_ID')!,
    clientSecret: env('X_OAUTH_CLIENT_SECRET', false),
    callbackUrl: env('X_OAUTH_CALLBACK_URL')!,
    scopes: 'tweet.read tweet.write users.read offline.access',
  };
}

function xTokenAuthHeader(clientId: string, clientSecret?: string) {
  return clientSecret ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` : undefined;
}

export async function exchangeXCode(code: string, verifier: string) {
  const cfg = xOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.callbackUrl,
    code_verifier: verifier,
    client_id: cfg.clientId,
  });
  const authorization = xTokenAuthHeader(cfg.clientId, cfg.clientSecret);
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(authorization ? { authorization } : {}) },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.error || 'X OAuth token exchange failed.'), { status: 400 });
  return data;
}

async function refreshXToken(userId: string, connection: any) {
  if (!connection.refresh_token_ciphertext) throw Object.assign(new Error('X connection requires reconnect.'), { reconnect: true });
  const cfg = xOAuthConfig();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptSecret(connection.refresh_token_ciphertext), client_id: cfg.clientId });
  const authorization = xTokenAuthHeader(cfg.clientId, cfg.clientSecret);
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(authorization ? { authorization } : {}) },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.error || 'X token refresh failed.'), { reconnect: true });
  const db = getServerDb();
  const tokenExpiresAt = new Date(Date.now() + Number(data.expires_in || 7200) * 1000).toISOString();
  const update = {
    access_token_ciphertext: encryptSecret(data.access_token),
    refresh_token_ciphertext: encryptSecret(data.refresh_token || decryptSecret(connection.refresh_token_ciphertext)),
    token_expires_at: tokenExpiresAt,
    scopes: data.scope || connection.scopes,
    connection_status: 'connected',
    oauth_relay_ready: true,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('x_connections').update(update).eq('user_id', userId);
  if (error) throw error;
  return { ...connection, ...update };
}

export async function getUsableXConnection(userId: string) {
  const db = getServerDb();
  const { data, error } = await db.from('x_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.connection_status !== 'connected' || !data.oauth_relay_ready || !data.access_token_ciphertext) {
    throw Object.assign(new Error('X account is not connected.'), { reconnect: true });
  }
  const expires = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  if (expires && expires <= Date.now() + 60_000) return refreshXToken(userId, data);
  return data;
}

export async function publishToX(userId: string, content: string) {
  let connection: any;
  try {
    connection = await getUsableXConnection(userId);
  } catch (error) {
    return { ok: false, permanent: true, reconnect: true, code: 'x_reconnect_required', message: (error as Error).message };
  }
  const response = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { authorization: `Bearer ${decryptSecret(connection.access_token_ciphertext)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: content }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data?.data?.id) return { ok: true, x_post_id: String(data.data.id) };

  const message = data?.detail || data?.title || data?.errors?.[0]?.message || `X API returned HTTP ${response.status}.`;
  const reconnect = response.status === 401 || response.status === 403;
  const permanent = reconnect || response.status === 400 || response.status === 422;
  if (reconnect) {
    const db = getServerDb();
    await db.from('x_connections').update({ connection_status: 'reconnect_required', oauth_relay_ready: false, last_error: message, updated_at: new Date().toISOString() }).eq('user_id', userId);
  }
  return { ok: false, permanent, reconnect, code: `x_http_${response.status}`, message, http_status: response.status };
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
  const secret = env('STRIPE_WEBHOOK_SECRET')!;
  if (!signatureHeader) return false;
  const pieces = Object.fromEntries(signatureHeader.split(',').map((part) => part.split('=', 2) as [string, string]));
  const timestamp = pieces.t;
  const signature = pieces.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return secureEqual(expected, signature);
}

export function stripePriceMap(): Record<string, string> {
  const raw = env('STRIPE_PRICE_IDS_JSON', false);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('STRIPE_PRICE_IDS_JSON must be valid JSON.'); }
}

export async function stripeRequest(path: string, params: URLSearchParams) {
  const key = env('STRIPE_SECRET_KEY')!;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'Stripe request failed.'), { status: 502 });
  return data;
}

export function billingConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_IDS_JSON);
}

export function newTokenHandle() {
  return `xconn_${randomUUID()}`;
}

export async function markXDisconnected(userId: string) {
  const db = getServerDb();
  const { error } = await db.from('x_connections').upsert({
    user_id: userId,
    x_user_id: null,
    x_username: null,
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    token_expires_at: null,
    scopes: null,
    connection_status: 'disconnected',
    last_error: null,
    connected_at: null,
    token_handle: null,
    oauth_relay_ready: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export function safeError(error: unknown) {
  const err = error as Error & { status?: number };
  return json({ error: err?.message || 'Unexpected server error.' }, err?.status || 500);
}
