import type { APIRoute } from 'astro';
import { assertSameOrigin, getAuthenticatedUser, getServiceDb, getUserDb, json, requireCurrentLegalAcceptance, requireUuid, safeError } from '../../../../../lib/video-studio/server';

const MAX_IMAGES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg','image/png','image/webp']);

async function context(request: Request, projectIdValue: unknown) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401, code: 'authentication_required' });
  const db = getUserDb(user.token);
  await requireCurrentLegalAcceptance(db);
  const projectId = requireUuid(projectIdValue, 'project');
  const { data: project, error } = await db.from('video_studio_projects').select('id').eq('id', projectId).maybeSingle();
  if (error) throw error;
  if (!project) throw Object.assign(new Error('Project not found.'), { status: 404, code: 'project_not_found' });
  return { user, db, projectId };
}

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    const { user, projectId } = await context(request, params.id);
    const form = await request.formData();
    const files = form.getAll('images').filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return json({ error: 'Choose at least one product reference image.' }, 400);
    const service = getServiceDb();
    const { count, error: countError } = await service.from('video_studio_reference_images').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    if (countError) throw countError;
    if ((count || 0) + files.length > MAX_IMAGES) return json({ error: `A project can have up to ${MAX_IMAGES} reference images.` }, 400);
    const created: any[] = [];
    for (const file of files) {
      if (!TYPES.has(file.type)) return json({ error: 'Reference images must be JPEG, PNG, or WebP.' }, 400);
      if (file.size > MAX_BYTES) return json({ error: 'Each reference image must be 10 MB or smaller.' }, 400);
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const storagePath = `${user.id}/${projectId}/${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await service.storage.from('video-studio-references').upload(storagePath, bytes, { contentType: file.type, upsert: false, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: row, error: insertError } = await service.from('video_studio_reference_images').insert({ user_id: user.id, project_id: projectId, storage_path: storagePath, original_name: file.name.slice(0, 255), mime_type: file.type, size_bytes: file.size }).select('id,original_name,mime_type,size_bytes,created_at').single();
      if (insertError) {
        await service.storage.from('video-studio-references').remove([storagePath]);
        throw insertError;
      }
      created.push(row);
    }
    return json({ images: created }, 201);
  } catch (error) { return safeError(error); }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    const { user, db, projectId } = await context(request, params.id);
    const body = await request.json().catch(() => ({}));
    const imageId = requireUuid(body.imageId, 'reference image');
    const { data: row, error } = await db.from('video_studio_reference_images').select('id,storage_path').eq('id', imageId).eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    if (!row) return json({ error: 'Reference image not found.' }, 404);
    const service = getServiceDb();
    if (row.storage_path) await service.storage.from('video-studio-references').remove([row.storage_path]);
    const { error: deleteError } = await service.from('video_studio_reference_images').delete().eq('id', imageId).eq('user_id', user.id);
    if (deleteError) throw deleteError;
    return json({ ok: true });
  } catch (error) { return safeError(error); }
};