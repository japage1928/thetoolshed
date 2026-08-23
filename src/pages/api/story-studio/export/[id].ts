import type { APIRoute } from 'astro';
import { getPlanAndUsage, json, safeError, storyContext } from '../../../../lib/story-studio/server';
import { buildPublisherPackage } from '../../../../lib/story-studio/export';

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { user, db } = await storyContext(request);
    const limits = await getPlanAndUsage(user.id);
    if (limits.plan.id === 'free') return json({ error: 'KDP / publisher export is available on paid plans.' }, 402);
    const id = String(params.id || '');
    const { data: project, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!project) return json({ error: 'Project not found.' }, 404);
    const illustrations = Array.isArray(project.illustrations) ? project.illustrations.filter((x:any)=>x?.url) : [];
    if (illustrations.length < 10) return json({ error: `Publisher export requires at least 10 completed illustrations. This project has ${illustrations.length}.` }, 422);
    const bundle = await buildPublisherPackage(project);
    await db.from('projects').update({ export_status:'exported', export_last_created_at:new Date().toISOString(), status:'finished', updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',user.id);
    return new Response(bundle.archive as BodyInit, { status:200, headers:{ 'content-type':'application/zip', 'content-disposition':`attachment; filename="${bundle.filename}"`, 'cache-control':'no-store', 'x-story-studio-pages':String(bundle.pageCount), 'x-story-studio-illustrations':String(bundle.illustrationCount) } });
  } catch (e) { return safeError(e); }
};
