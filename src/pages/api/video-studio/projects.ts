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
    const { db } = await context(request);
    const [projectsResult, balanceResult] = await Promise.all([
      db
        .from('video_studio_projects')
        .select('id,title,source_type,source_url,status,objective,platform,aspect_ratio,duration_seconds,resolution,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(20),
      db.rpc('video_studio_credit_balance'),
    ]);
    if (projectsResult.error) throw projectsResult.error;
    if (balanceResult.error) throw balanceResult.error;
    return json({
      projects: projectsResult.data || [],
      credits: Number(balanceResult.data || 0),
      billingEnabled: billingEnabled(),
      generationEnabled: generationEnabled(),
      internalBeta: true,
    });
  } catch (error) {
    return safeError(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { user, db } = await context(request);
    const input = validateProjectInput(await request.json().catch(() => ({})));
    const { data, error } = await db
      .from('video_studio_projects')
      .insert({
        user_id: user.id,
        title: input.title,
        source_type: input.sourceType,
        source_url: input.sourceUrl,
        creative_brief: input.brief,
        status: 'draft',
        objective: input.objective,
        platform: input.platform,
        aspect_ratio: input.aspectRatio,
        duration_seconds: input.durationSeconds,
        resolution: input.resolution,
      })
      .select('id,title,source_type,source_url,status,objective,platform,aspect_ratio,duration_seconds,resolution,created_at,updated_at')
      .single();
    if (error) throw error;
    return json({ project: data }, 201);
  } catch (error) {
    return safeError(error);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { db } = await context(request);
    const body = await request.json().catch(() => ({}));
    const projectId = requireUuid(body.projectId, 'project');
    const { count: activeGenerationCount, error: generationError } = await db
      .from('video_studio_generations')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('status', ['reserved', 'queued', 'planning', 'generating', 'qa', 'repairing']);
    if (generationError) throw generationError;
    if (activeGenerationCount) {
      return json({
        error: 'Wait for the active generation to finish before deleting this project.',
        code: 'generation_in_progress',
      }, 409);
    }
    const { data, error } = await db
      .from('video_studio_projects')
      .delete()
      .eq('id', projectId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Project not found.' }, 404);
    return json({ ok: true, projectId });
  } catch (error) {
    return safeError(error);
  }
};
