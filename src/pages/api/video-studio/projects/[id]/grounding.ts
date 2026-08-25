import type { APIRoute } from 'astro';
import { assertSameOrigin, getAuthenticatedUser, getUserDb, json, requireCurrentLegalAcceptance, requireUuid, safeError } from '../../../../../lib/video-studio/server';
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
    const { count: referenceCount, error: countError } = await db.from('video_studio_reference_images').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (countError) throw countError;

    let extracted: Awaited<ReturnType<typeof extractProductIdentity>> = { identity: { name: '' }, confidence: 0 };
    if (project.source_type === 'url' && project.source_url) extracted = await extractProductIdentity(project.source_url);

    const hasConfirmation = ['productName','brand','model','variant','color','identityNotes'].some((key) => typeof body[key] === 'string' && String(body[key]).trim());
    const merged = hasConfirmation ? mergeUserConfirmation(extracted.identity, body, referenceCount || 0) : extracted;
    const source = hasConfirmation
      ? ((referenceCount || 0) > 0 ? 'url_plus_reference' : 'user_confirmed')
      : extracted.confidence >= 0.8 ? 'url_extraction' : 'unverified';
    const requiresReference = source !== 'url_extraction';

    const { data: verification, error: updateError } = await db.rpc('video_studio_verify_project_identity', {
      p_project_id: projectId,
      p_identity: merged.identity,
      p_confidence: merged.confidence,
      p_source: source,
      p_requires_reference: requiresReference,
    });
    if (updateError) throw updateError;
    const updated = Array.isArray(verification) ? verification[0] : verification;
    if (!updated) throw new Error('Product verification did not return the project state.');
    const verified = updated.product_identity_status === 'verified'
      && Number(updated.product_identity_confidence || 0) >= 0.8
      && updated.status === 'ready_to_generate';

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
