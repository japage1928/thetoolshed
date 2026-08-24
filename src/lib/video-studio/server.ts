import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { LEGAL_VERSIONS } from '../legal-versions';

export const VIDEO_ACCESS_COOKIE = 'ts_saas_access_token';
export const VIDEO_REFRESH_COOKIE = 'ts_saas_refresh_token';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  'netlify-cdn-cache-control': 'no-store',
};

export type VideoProjectInput = {
  title: string;
  sourceType: 'url' | 'brief';
  sourceUrl: string | null;
  brief: string | null;
  objective: string;
  platform: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  durationSeconds: number;
  resolution: '480p' | '720p' | '1080p';
};

export type VideoGenerationRequest = {
  projectId: string;
  durationSeconds: number;
  resolution: '480p' | '720p' | '1080p';
  premiumModel?: boolean;
};

type Environment = Record<string, string | undefined>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });
}

export function safeError(error: unknown) {
  const value = error as Error & { status?: number; code?: string };
  return json(
    { error: value?.message || 'Unexpected server error.', ...(value?.code ? { code: value.code } : {}) },
    value?.status || 500,
  );
}

export function parseCookies(request: Request) {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403, code: 'origin_rejected' });
  }
}

export function safeRelativePath(value: string | null | undefined, fallback = '/app/video-studio') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

function supabaseUrl(env: Environment = process.env) {
  return (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
}

function supabasePublishableKey(env: Environment = process.env) {
  return env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
}

export function publicSiteUrl(env: Environment = process.env) {
  return (env.PUBLIC_SITE_URL || 'https://thetoolshed.work').replace(/\/$/, '');
}

export async function getAuthenticatedUser(request: Request) {
  const token = parseCookies(request)[VIDEO_ACCESS_COOKIE];
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!token || !url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || !user?.email) return null;
  return { id: String(user.id), email: String(user.email), token };
}

export function getUserDb(accessToken: string): SupabaseClient {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw Object.assign(new Error('Supabase is not configured.'), { status: 503, code: 'database_unconfigured' });
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  });
}

export function getServiceDb(): SupabaseClient {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw Object.assign(new Error('The server-side database credential is not configured.'), {
      status: 503,
      code: 'service_database_unconfigured',
    });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireCurrentLegalAcceptance(db: SupabaseClient) {
  const { data, error } = await db
    .from('tool_shed_legal_acceptances')
    .select('id')
    .eq('terms_version', LEGAL_VERSIONS.terms)
    .eq('privacy_version', LEGAL_VERSIONS.privacy)
    .eq('acceptable_use_version', LEGAL_VERSIONS.acceptableUse)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error('Accept the current Tool Shed policies from your Account page before using Video Studio.'), {
      status: 403,
      code: 'legal_acceptance_required',
    });
  }
}

export function billingEnabled(env: Environment = process.env) {
  return env.VIDEO_BILLING_ENABLED === 'true';
}

export function generationEnabled(env: Environment = process.env) {
  return env.VIDEO_GENERATION_ENABLED === 'true'
    && Boolean(env.VIDEO_N8N_WEBHOOK_URL)
    && Boolean(env.VIDEO_N8N_SERVICE_SECRET);
}

export type VideoStripePrices = {
  trial: string;
  starter: string;
  creator: string;
  topup: string;
};

export function getStripeTestConfig(env: Environment = process.env) {
  if (!billingEnabled(env)) {
    throw Object.assign(new Error('Video Studio billing is disabled.'), { status: 503, code: 'billing_disabled' });
  }
  if (env.VIDEO_STRIPE_MODE !== 'test') {
    throw Object.assign(new Error('Video Studio billing is restricted to Stripe test mode.'), { status: 503, code: 'test_mode_required' });
  }
  const secretKey = env.VIDEO_STRIPE_SECRET_KEY?.trim() || '';
  const webhookSecret = env.VIDEO_STRIPE_WEBHOOK_SECRET?.trim() || '';
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('rk_test_')) {
    throw Object.assign(new Error('A Stripe test secret or restricted key is required.'), { status: 503, code: 'stripe_test_key_required' });
  }
  if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
    throw Object.assign(new Error('The Stripe webhook secret is invalid.'), { status: 503, code: 'stripe_webhook_invalid' });
  }
  let prices: VideoStripePrices;
  try {
    prices = JSON.parse(env.VIDEO_STRIPE_PRICE_IDS_JSON || '{}') as VideoStripePrices;
  } catch {
    throw Object.assign(new Error('VIDEO_STRIPE_PRICE_IDS_JSON must be valid JSON.'), { status: 503, code: 'stripe_prices_invalid' });
  }
  for (const name of ['trial', 'starter', 'creator', 'topup'] as const) {
    if (!prices[name]?.startsWith('price_')) {
      throw Object.assign(new Error(`Missing Stripe test Price ID: ${name}.`), { status: 503, code: 'stripe_price_missing' });
    }
  }
  return { secretKey, webhookSecret, prices };
}

export function getStripeClient(env: Environment = process.env) {
  const config = getStripeTestConfig(env);
  return { stripe: new Stripe(config.secretKey), ...config };
}

export function estimateCredits(request: Pick<VideoGenerationRequest, 'durationSeconds' | 'resolution' | 'premiumModel'>) {
  const duration = Math.max(6, Math.min(120, Math.round(Number(request.durationSeconds) || 15)));
  const durationUnits = Math.ceil(duration / 15);
  const resolutionMultiplier = request.resolution === '1080p' ? 2.5 : request.resolution === '720p' ? 1.5 : 1;
  const modelMultiplier = request.premiumModel ? 1.5 : 1;
  return Math.max(1, Math.ceil(5 * durationUnits * resolutionMultiplier * modelMultiplier));
}

export function estimateApiCost(credits: number) {
  const safeCredits = Math.max(0, Math.ceil(Number(credits) || 0));
  return Number(Math.max(0.25, safeCredits * 0.12).toFixed(4));
}

export function maxDailyVideoSpend(env: Environment = process.env) {
  const configured = Number(env.VIDEO_MAX_DAILY_SPEND_USD);
  return Number.isFinite(configured) && configured > 0 ? Number(configured.toFixed(2)) : 5;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

export function validateProjectInput(value: unknown): VideoProjectInput {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const sourceType = input.sourceType === 'url' ? 'url' : input.sourceType === 'brief' ? 'brief' : null;
  if (!sourceType) throw Object.assign(new Error('Choose a product URL or creative brief.'), { status: 400, code: 'source_type_invalid' });

  const rawUrl = cleanText(input.sourceUrl, 2048);
  let sourceUrl: string | null = null;
  if (sourceType === 'url') {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('unsafe');
      sourceUrl = parsed.toString();
    } catch {
      throw Object.assign(new Error('Enter a valid HTTPS product or business URL.'), { status: 400, code: 'source_url_invalid' });
    }
  }

  const brief = sourceType === 'brief' ? cleanText(input.brief, 4000) : null;
  if (sourceType === 'brief' && (!brief || brief.length < 12)) {
    throw Object.assign(new Error('Describe the video in at least 12 characters.'), { status: 400, code: 'brief_too_short' });
  }

  const durationSeconds = [15, 30, 45, 60].includes(Number(input.durationSeconds)) ? Number(input.durationSeconds) : 30;
  const resolution = ['480p', '720p', '1080p'].includes(String(input.resolution))
    ? input.resolution as VideoProjectInput['resolution']
    : '480p';
  const aspectRatio = ['9:16', '1:1', '16:9'].includes(String(input.aspectRatio))
    ? input.aspectRatio as VideoProjectInput['aspectRatio']
    : '9:16';

  const title = cleanText(input.title, 120)
    || (sourceType === 'url' ? new URL(sourceUrl!).hostname.replace(/^www\./, '') : brief!.slice(0, 72));

  return {
    title,
    sourceType,
    sourceUrl,
    brief,
    objective: cleanText(input.objective, 180) || 'Create qualified product interest',
    platform: cleanText(input.platform, 60) || 'TikTok / Reels / Shorts',
    aspectRatio,
    durationSeconds,
    resolution,
  };
}

export function requireUuid(value: unknown, label = 'resource') {
  const text = typeof value === 'string' ? value : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw Object.assign(new Error(`Invalid ${label} id.`), { status: 400, code: 'invalid_id' });
  }
  return text;
}

export async function dispatchVideoWorkflow(payload: Record<string, unknown>) {
  if (!generationEnabled()) {
    throw Object.assign(new Error('Video generation is paused for the internal beta.'), { status: 503, code: 'generation_paused' });
  }
  const webhookUrl = process.env.VIDEO_N8N_WEBHOOK_URL!;
  const secret = process.env.VIDEO_N8N_SERVICE_SECRET!;
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      'x-tool-shed-source': 'video-studio',
    },
    body: JSON.stringify({ ...payload, source: 'video_studio', live_generation_authorized: false }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || `The video workflow returned HTTP ${response.status}.`), {
      status: 502,
      code: 'workflow_dispatch_failed',
    });
  }
  return data;
}
