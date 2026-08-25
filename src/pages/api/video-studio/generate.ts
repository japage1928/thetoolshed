import type { APIRoute } from 'astro';
import {
  assertSameOrigin,
  estimateApiCost,
  estimateCredits,
  generationEnabled,
  getAuthenticatedUser,
  getServiceDb,
  getUserDb,
  json,
  maxDailyVideoSpend,
  requireCurrentLegalAcceptance,
  requireUuid,
  safeError,
} from '../../../lib/video-studio/server';
import { buildProductIdentityLock, signedReferenceUrls, type ProductIdentity } from '../../../lib/video-studio/grounding';

async function dispatchAuthorizedBetaWorkflow(payload: Record<string, unknown>) {
  if (!generationEnabled()) {
    throw Object.assign(new Error('Video generation is globally paused.'), { status: 503, code: 'generation_paused' });
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
    body: JSON.stringify({ ...payload, source: 'video_studio', live_generation_authorized: true }),
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

export const POST: APIRoute = async ({ request }) => {
  let generationId: string | null = null;
  try {
    assertSameOrigin(request);
    if (!generationEnabled()) return json({ error: 'Video generation is globally paused.', code: 'generation_paused' }, 503);
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in to generate a video.', code: 'authentication_required' }, 401);

    const body = await request.json().catch(() => ({}));
    const projectId = requireUuid(body.projectId, 'project');
    const requestKey = request.headers.get('idempotency-key')?.trim() || '';
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(requestKey)) return json({ error: 'A valid idempotency key is required.' }, 400);
    const durationSeconds = [15, 30, 45, 60].includes(Number(body.durationSeconds)) ? Number(body.durationSeconds) : 30;
    const resolution = ['480p', '720p', '1080p'].includes(String(body.resolution)) ? body.resolution : '480p';

    const userDb = getUserDb(user.token);
    await requireCurrentLegalAcceptance(userDb);

    const { data: profile, error: profileError } = await userDb
      .from('video_studio_profiles')
      .select('internal_beta,plan_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: subscription, error: subscriptionError } = await userDb
      .from('video_studio_subscriptions')
      .select('plan,status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    const hasGenerationAccess = Boolean(profile?.internal_beta || subscription?.status === 'active');
    if (!hasGenerationAccess) {
      return json({ error: 'An active Video Studio subscription is required to generate videos.', code: 'paid_access_required' }, 403);
    }

    const { data: project, error: projectError } = await userDb
      .from('video_studio_projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return json({ error: 'Project not found.' }, 404);

    const identity = (project.product_identity || {}) as ProductIdentity;
    const identityConfidence = Number(project.product_identity_confidence || 0);
    if (project.product_identity_status !== 'verified' || identityConfidence < 0.8 || !identity?.name) {
      return json({
        error: 'Product identity is not verified strongly enough to generate. Confirm the exact product and add clear reference images first.',
        code: 'product_identity_unverified',
        groundingRequired: true,
        identityConfidence,
      }, 409);
    }

    const serviceDb = getServiceDb();
    const { data: referenceRows, error: referenceError } = await serviceDb
      .from('video_studio_reference_images')
      .select('storage_path,inline_data_uri')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(6);
    if (referenceError) throw referenceError;
    const uploadedReferenceUrls = await signedReferenceUrls(serviceDb, referenceRows || []);
    const referenceImageUrls = [identity.primaryImageUrl, ...uploadedReferenceUrls].filter((value): value is string => Boolean(value)).slice(0, 7);

    if (project.product_identity_source !== 'url_extraction' && referenceImageUrls.length === 0) {
      return json({
        error: 'A user-confirmed product requires at least one reference image before generation.',
        code: 'product_reference_required',
        groundingRequired: true,
      }, 409);
    }

    const identityLock = buildProductIdentityLock(identity, referenceImageUrls);
    const creativeDirection = project.creative_brief || `Create a ${durationSeconds}-second ${project.objective || 'product-focused'} video for ${project.platform || 'social media'}.`;
    const finalPrompt = `${identityLock}\n\nCREATIVE DIRECTION — SECONDARY TO PRODUCT ACCURACY\n${creativeDirection}`;

    // Identity QA happens before this point. Only now can paid credits and spend be reserved.
    const credits = estimateCredits({ durationSeconds, resolution, premiumModel: Boolean(body.premiumModel) });
    const estimatedApiCost = estimateApiCost(credits);
    const dailySpendLimit = maxDailyVideoSpend();
    const { data: reservation, error: reservationError } = await serviceDb.rpc('video_studio_reserve_generation', {
      p_user_id: user.id,
      p_project_id: projectId,
      p_request_key: requestKey,
      p_estimated_credits: credits,
      p_duration_seconds: durationSeconds,
      p_resolution: resolution,
      p_estimated_api_cost: estimatedApiCost,
      p_max_daily_spend: dailySpendLimit,
    });
    if (reservationError) throw Object.assign(new Error(reservationError.message), { status: 409, code: 'credit_reservation_failed' });
    const row = Array.isArray(reservation) ? reservation[0] : reservation;
    if (row?.reason === 'daily_spend_paused' || row?.reason === 'daily_spend_limit') {
      return json({ error: 'Video generation is paused by the daily API spending circuit breaker.', code: row.reason }, 503);
    }
    generationId = row?.generation_id || null;
    if (!generationId) throw new Error('Generation reservation did not return an id.');

    const workflow = await dispatchAuthorizedBetaWorkflow({
      generation_id: generationId,
      project_id: projectId,
      user_id: user.id,
      beta_access: true,
      billing_bypass: profile?.plan_id === 'internal_beta',
      prompt: finalPrompt,
      scene_prompt_prefix: identityLock,
      product_identity_lock: identityLock,
      product_identity: identity,
      product_identity_confidence: identityConfidence,
      product_identity_source: project.product_identity_source,
      product_identity_qa_passed: true,
      prompt_policy_version: 'product-lock-v1',
      negative_constraints: [
        'no generic lookalikes', 'no alternate models', 'no competitor products', 'no changed logo',
        'no changed colorway', 'no changed proportions', 'no extra controls', 'no invented accessories',
        'no product form-factor substitution',
      ],
      reference_to_video_required: referenceImageUrls.length > 0,
      reference_images: referenceImageUrls.map((url) => ({ url })),
      reference_image_urls: referenceImageUrls,
      preferred_video_model: referenceImageUrls.length > 0 ? 'grok-imagine-video-1.5' : 'grok-imagine-video',
      source_url: project.source_url,
      objective: project.objective,
      platform: project.platform,
      aspect_ratio: project.aspect_ratio,
      duration_seconds: durationSeconds,
      total_duration_seconds: durationSeconds,
      resolution,
      estimated_credits: credits,
      estimated_api_cost: estimatedApiCost,
    });
    await serviceDb
      .from('video_studio_generations')
      .update({ status: 'queued', workflow_payload: { ...workflow, product_identity: identity, identity_confidence: identityConfidence, reference_count: referenceImageUrls.length, prompt_policy_version: 'product-lock-v1' }, updated_at: new Date().toISOString() })
      .eq('id', generationId);
    return json({ generationId, status: 'queued', creditsReserved: credits, estimatedApiCost, identityConfidence, referenceCount: referenceImageUrls.length }, 202);
  } catch (error) {
    if (generationId) {
      try {
        await getServiceDb().rpc('video_studio_fail_generation', {
          p_generation_id: generationId,
          p_reason: error instanceof Error ? error.message.slice(0, 500) : 'Workflow dispatch failed.',
        });
      } catch {
        // The original error is returned; reconciliation can recover a stranded reservation.
      }
    }
    return safeError(error);
  }
};