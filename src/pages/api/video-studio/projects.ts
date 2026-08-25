import type { APIRoute } from 'astro';
import {
  assertSameOrigin,
  billingEnabled,
  generationEnabled,
  getAuthenticatedUser,
  getUserDb,
  json,
  requireCurrentLegalAcceptance,
  requireUuid,
  safeError,
  validateProjectInput,
} from '../../../lib/video-studio/server';

async function context(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw Object.assign(new Error('Sign in to use Video Studio.'), { status: 401, code: 'authentication_required' });
  const db = getUserDb(user.token);
  await requireCurrentLegalAcceptance(db);
  const { error } = await db.rpc('video_studio_bootstrap_profile');
  if (error) throw Object.assign(new Error('Video Studio database setup is incomplete.'), { status: 503, code: 'video_database_unavailable' });
  return { user, db };
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { user, db } = await context(request);
    const [projectsResult, balanceResult, profileResult, subscriptionResult] = await Promise.all([
      db.from('video_studio_projects').select('id,title,source_type,source_url,status,objective,platform,aspect_ratio,duration_seconds,resolution,product_identity_status,product_identity_confidence,created_at,updated_at').order('updated_at', { ascending: false }),
      db.rpc('video_studio_credit_balance'),
      db.from('video_studio_profiles').select('internal_beta,plan_id').eq('user_id', user.id).maybeSingle(),
      db.from('video_studio_subscriptions').select('plan,status').eq('user_id', user.id).maybeSingle(),
    ]);
    for (const result of [projectsResult, balanceResult, profileResult, subscriptionResult]) if (result.error) throw result.error;
    const betaApproved = Boolean(profileResult.data?.internal_beta);
    const paidActive = subscriptionResult.data?.status === 'active';
    const canGenerate = generationEnabled() && (betaApproved || paidActive);
    return json({
      projects: projectsResult.data || [],
      credits: Number(balanceResult.data || 0),
      billingEnabled: billingEnabled(),
      generationEnabled: canGenerate,
      internalBeta: betaApproved,
      subscriptionActive: paidActive,
      plan: subscriptionResult.data?.plan || profileResult.data?.plan_id || null,
      billingBypass: profileResult.data?.plan_id === 'internal_beta',
    });
  } catch (error) { return safeError(error); }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { user, db } = await context(request);
    const input = validateProjectInput(await request.json().catch(() => ({})));
    const { data, error } = await db.from('video_studio_projects').insert({
      user_id: user.id,
      title: input.title,
      source_type: input.sourceType,
      source_url: input.sourceUrl,
      creative_brief: input.brief,
      status: 'identity_required',
      objective: input.objective,
      platform: input.platform,
      aspect_ratio: input.aspectRatio,
      duration_seconds: input.durationSeconds,
      resolution: input.resolution,
    }).select('id,title,source_type,source_url,status,objective,platform,aspect_ratio,duration_seconds,resolution,product_identity,product_identity_status,product_identity_confidence,product_identity_source,created_at,updated_at').single();
    if (error) throw error;
    return json({
      project: data,
      grounding: {
        canGenerate: false,
        message: 'Project saved with a clean identity state. Verify this project’s product before generating.',
      },
    }, 201);
  } catch (error) { return safeError(error); }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { db } = await context(request);
    const body = await request.json().catch(() => ({}));
    const projectId = requireUuid(body.projectId, 'project');
    const { count: activeGenerationCount, error: generationError } = await db.from('video_studio_generations').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['reserved','queued','planning','generating','qa','repairing']);
    if (generationError) throw generationError;
    if (activeGenerationCount) return json({ error: 'Wait for the active generation to finish before deleting this project.', code: 'generation_in_progress' }, 409);
    const { data, error } = await db.from('video_studio_projects').delete().eq('id', projectId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Project not found.' }, 404);
    return json({ ok: true, projectId });
  } catch (error) { return safeError(error); }
};
