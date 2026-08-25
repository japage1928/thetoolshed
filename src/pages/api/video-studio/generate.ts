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
    const credits = estimateCredits({ durationSeconds, resolution, premiumModel: Boolean(body.premiumModel) });
    const estimatedApiCost = estimateApiCost(credits);
    const dailySpendLimit = maxDailyVideoSpend();

    const userDb = getUserDb(user.token);
    await requireCurrentLegalAcceptance(userDb);

    const { data: profile, error: profileError } = await userDb
      .from('video_studio_profiles')
      .select('internal_beta,plan_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.internal_beta) {
      return json({ error: 'Video generation is currently limited to approved beta accounts.', code: 'beta_access_required' }, 403);
    }

    const { data: project, error: projectError } = await userDb
      .from('video_studio_projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return json({ error: 'Project not found.' }, 404);

    const serviceDb = getServiceDb();
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
      return json({
        error: 'Video generation is paused by the daily API spending circuit breaker.',
        code: row.reason,
      }, 503);
    }
    generationId = row?.generation_id || null;
    if (!generationId) throw new Error('Generation reservation did not return an id.');

    const workflow = await dispatchAuthorizedBetaWorkflow({
      generation_id: generationId,
      project_id: projectId,
      user_id: user.id,
      beta_access: true,
      billing_bypass: profile.plan_id === 'internal_beta',
      prompt: project.creative_brief || project.source_url || project.title,
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
      .update({ status: 'queued', workflow_payload: workflow, updated_at: new Date().toISOString() })
      .eq('id', generationId);
    return json({ generationId, status: 'queued', creditsReserved: credits, estimatedApiCost, betaAccess: true }, 202);
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
