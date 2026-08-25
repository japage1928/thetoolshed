import type { APIRoute } from 'astro';
import { buildProductIdentityLock, signedReferenceUrls, type ProductIdentity } from '../../../../lib/video-studio/grounding';
import { estimateApiCost, estimateCredits, getServiceDb, json, maxDailyVideoSpend, safeError } from '../../../../lib/video-studio/server';

const ADMIN_USER_ID = '33df9255-b97d-4899-9a53-080e92d01df7';
const ADMIN_PROJECT_ID = '00e66279-e807-4be3-9134-9b9ce7681f2b';

function authorized(request: Request) {
  const expected = process.env.VIDEO_REGRESSION_TOKEN?.trim();
  const provided = request.headers.get('x-video-regression-token')?.trim();
  return Boolean(expected && provided && expected.length >= 32 && provided === expected);
}

async function dispatch(payload: Record<string, unknown>) {
  const webhookUrl = process.env.VIDEO_N8N_WEBHOOK_URL?.trim();
  const secret = process.env.VIDEO_N8N_SERVICE_SECRET?.trim();
  if (!webhookUrl || !secret) throw Object.assign(new Error('Video workflow is not configured.'), { status: 503 });
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      'x-tool-shed-source': 'video-studio-regression',
    },
    body: JSON.stringify({ ...payload, source: 'video_studio', live_generation_authorized: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error || `Video workflow returned HTTP ${response.status}.`), { status: 502 });
  return data;
}

export const POST: APIRoute = async ({ request }) => {
  let generationId: string | null = null;
  try {
    if (!authorized(request)) return json({ error: 'Not found.' }, 404);
    const body = await request.json().catch(() => ({}));
    if (body?.projectId !== ADMIN_PROJECT_ID) return json({ error: 'Regression project rejected.' }, 400);

    const db = getServiceDb();
    const [{ data: project, error: projectError }, { data: subscription, error: subscriptionError }] = await Promise.all([
      db.from('video_studio_projects').select('*').eq('id', ADMIN_PROJECT_ID).eq('user_id', ADMIN_USER_ID).maybeSingle(),
      db.from('video_studio_subscriptions').select('status,plan').eq('user_id', ADMIN_USER_ID).eq('status', 'active').maybeSingle(),
    ]);
    if (projectError) throw projectError;
    if (subscriptionError) throw subscriptionError;
    if (!project) return json({ error: 'Regression project not found.' }, 404);
    if (subscription?.status !== 'active') return json({ error: 'Admin test subscription is not active.' }, 403);

    const identity = (project.product_identity || {}) as ProductIdentity;
    const identityConfidence = Number(project.product_identity_confidence || 0);
    if (project.product_identity_status !== 'verified' || identityConfidence < 0.8 || !identity.name) {
      return json({ error: 'Product identity gate failed.', identityConfidence }, 409);
    }

    const { data: referenceRows, error: referenceError } = await db
      .from('video_studio_reference_images')
      .select('storage_path,inline_data_uri')
      .eq('project_id', ADMIN_PROJECT_ID)
      .eq('user_id', ADMIN_USER_ID)
      .order('created_at', { ascending: true })
      .limit(6);
    if (referenceError) throw referenceError;
    const privateRefs = await signedReferenceUrls(db, referenceRows || []);
    const referenceImageUrls = [identity.primaryImageUrl, ...privateRefs].filter((value): value is string => Boolean(value)).slice(0, 7);
    if (!referenceImageUrls.length) return json({ error: 'Regression requires a visual product reference.' }, 409);

    const durationSeconds = 15;
    const resolution = '480p' as const;
    const identityLock = buildProductIdentityLock(identity, referenceImageUrls);
    const finalPrompt = `${identityLock}\n\nCREATIVE DIRECTION — SECONDARY TO PRODUCT ACCURACY\nCreate a polished 15-second vertical product video that creates product interest with realistic trucking/workday context. Show the exact verified LEVN headset. Avoid text-heavy frames and never replace or redesign the product.`;
    const credits = estimateCredits({ durationSeconds, resolution });
    const estimatedApiCost = estimateApiCost(credits);
    const requestKey = `product-lock-regression-${Date.now()}`;

    const { data: reservation, error: reservationError } = await db.rpc('video_studio_reserve_generation', {
      p_user_id: ADMIN_USER_ID,
      p_project_id: ADMIN_PROJECT_ID,
      p_request_key: requestKey,
      p_estimated_credits: credits,
      p_duration_seconds: durationSeconds,
      p_resolution: resolution,
      p_estimated_api_cost: estimatedApiCost,
      p_max_daily_spend: maxDailyVideoSpend(),
    });
    if (reservationError) throw Object.assign(new Error(reservationError.message), { status: 409 });
    const row = Array.isArray(reservation) ? reservation[0] : reservation;
    if (row?.reason !== 'reserved' && !row?.generation_id) return json({ error: `Generation blocked: ${row?.reason || 'reservation failed'}.` }, 409);
    generationId = row.generation_id;

    const workflow = await dispatch({
      generation_id: generationId,
      project_id: ADMIN_PROJECT_ID,
      user_id: ADMIN_USER_ID,
      beta_access: true,
      billing_bypass: false,
      prompt: finalPrompt,
      scene_prompt_prefix: identityLock,
      product_identity_lock: identityLock,
      product_identity: identity,
      product_identity_confidence: identityConfidence,
      product_identity_source: project.product_identity_source,
      product_identity_qa_passed: true,
      prompt_policy_version: 'product-lock-v1',
      negative_constraints: ['no generic lookalikes','no alternate models','no competitor products','no changed logo','no changed colorway','no changed proportions','no extra controls','no invented accessories','no product form-factor substitution'],
      reference_to_video_required: true,
      reference_images: referenceImageUrls.map((url) => ({ url })),
      reference_image_urls: referenceImageUrls,
      preferred_video_model: 'grok-imagine-video-1.5',
      source_url: project.source_url,
      objective: project.objective,
      platform: project.platform,
      aspect_ratio: '9:16',
      duration_seconds: durationSeconds,
      total_duration_seconds: durationSeconds,
      resolution,
      estimated_credits: credits,
      estimated_api_cost: estimatedApiCost,
    });

    await db.from('video_studio_generations').update({
      status: 'queued',
      workflow_payload: { ...workflow, regression: true, product_identity: identity, identity_confidence: identityConfidence, reference_count: referenceImageUrls.length, prompt_policy_version: 'product-lock-v1' },
      updated_at: new Date().toISOString(),
    }).eq('id', generationId);

    return json({ ok: true, generationId, creditsReserved: credits, estimatedApiCost, identityConfidence, referenceCount: referenceImageUrls.length }, 202);
  } catch (error) {
    if (generationId) {
      try { await getServiceDb().rpc('video_studio_fail_generation', { p_generation_id: generationId, p_reason: error instanceof Error ? error.message.slice(0, 500) : 'Regression dispatch failed.' }); } catch {}
    }
    return safeError(error);
  }
};