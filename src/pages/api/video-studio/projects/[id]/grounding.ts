import type { APIRoute } from 'astro';
import { assertSameOrigin, getAuthenticatedUser, getServiceDb, getUserDb, json, requireCurrentLegalAcceptance, requireUuid, safeError } from '../../../../../lib/video-studio/server';
import { extractProductIdentity, mergeUserConfirmation } from '../../../../../lib/video-studio/grounding';

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Authentication required.' }, 401);
    const db = getUserDb(user.token);
    await requireCurrentLegalAcceptance(db);
    const projectId = requireUuid(params.id, 'project');
    const { data: project, error: projectError } = await db.from('video_studio_projects').select('*').eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return json({ error: 'Project not found.' }, 404);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const service = getServiceDb();
    const { count: referenceCount, error: countError } = await service.from('video_studio_reference_images').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    if (countError) throw countError;

    let extracted = { identity: { name: '' }, confidence: 0, error: undefined as string | undefined };
    if (project.source_type === 'url' && project.source_url) extracted = await extractProductIdentity(project.source_url);

    const hasConfirmation = ['productName','brand','model','variant','color','identityNotes'].some((key) => typeof body[key] === 'string' && String(body[key]).trim());
    const merged = hasConfirmation ? mergeUserConfirmation(extracted.identity, body, referenceCount || 0) : extracted;
    const verified = merged.confidence >= 0.8 && Boolean(merged.identity.name);
    const status = verified ? 'verified' : 'needs_reference';
    const source = hasConfirmation
      ? ((referenceCount || 0) > 0 ? 'url_plus_reference' : 'user_confirmed')
      : extracted.confidence >= 0.8 ? 'url_extraction' : 'unverified';

    const { data: updated, error: updateError } = await service.from('video_studio_projects').update({
      product_identity: merged.identity,
      product_identity_confidence: merged.confidence,
      product_identity_status: status,
      product_identity_source: source,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId).eq('user_id', user.id).select('id,product_identity,product_identity_confidence,product_identity_status,product_identity_source').single();
    if (updateError) throw updateError;

    return json({
      grounding: updated,
      referenceCount: referenceCount || 0,
      extractionError: extracted.error || null,
      canGenerate: verified,
      message: verified
        ? 'Product identity verified. Generation may proceed.'
        : 'Product identity is not reliable enough to generate. Confirm the exact product and add reference images.',
    });
  } catch (error) { return safeError(error); }
};