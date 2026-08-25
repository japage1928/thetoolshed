import type { APIRoute } from 'astro';
import { getAuthenticatedUser, getServiceDb, getUserDb, json, requireCurrentLegalAcceptance, requireUuid, safeError } from '../../../../lib/video-studio/server';
import { signedReferenceUrls } from '../../../../lib/video-studio/grounding';

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Authentication required.' }, 401);
    const db = getUserDb(user.token);
    await requireCurrentLegalAcceptance(db);
    const projectId = requireUuid(params.id, 'project');
    const { data: project, error: projectError } = await db.from('video_studio_projects').select('*').eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return json({ error: 'Project not found.' }, 404);
    const [{ data: generations, error: generationsError }, { data: referenceRows, error: referenceError }] = await Promise.all([
      db.from('video_studio_generations')
        .select('id,status,provider,model,duration_seconds,resolution,credits_reserved,credits_used,estimated_api_cost,actual_api_cost,output_payload,workflow_payload,error,created_at,updated_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      db.from('video_studio_reference_images')
        .select('id,storage_path,inline_data_uri,original_name,mime_type,size_bytes,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
    ]);
    if (generationsError) throw generationsError;
    if (referenceError) throw referenceError;
    const urls = await signedReferenceUrls(getServiceDb(), referenceRows || [], 900);
    const referenceImages = (referenceRows || []).map((row:any, index:number) => ({
      id: row.id,
      name: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      previewUrl: urls[index] || null,
    }));
    return json({
      project,
      referenceImages,
      generations: (generations || []).map((g:any) => ({
        ...g,
        videoPath: g.status === 'ready' && g.output_payload?.video_url ? `/api/video-studio/generations/${g.id}/video` : null,
      })),
    });
  } catch (error) { return safeError(error); }
};