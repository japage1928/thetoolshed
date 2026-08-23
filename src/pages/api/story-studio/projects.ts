import type { APIRoute } from 'astro';
import { assertSameOrigin, getPlanAndUsage, json, safeError, storyContext } from '../../../lib/story-studio/server';

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { user, db } = await storyContext(request);
    const body = await request.json().catch(() => ({}));
    const allowed = ['childrens_book','book','short_story','comic_book'];
    const projectType = allowed.includes(String(body.project_type || '')) ? String(body.project_type) : '';
    const idea = typeof body.idea === 'string' ? body.idea.trim().slice(0,12000) : '';
    if (!projectType || !idea) return json({ error:'Choose a project type and enter your idea.' },400);
    const { plan } = await getPlanAndUsage(user.id);
    if (projectType === 'comic_book' && plan.id === 'free') return json({ error:'Comic Book Beta is available on paid plans only.' },402);
    const { count, error:countError } = await db.from('projects').select('*',{count:'exact',head:true}).eq('user_id',user.id); if(countError) throw countError;
    if ((count || 0) >= plan.active_project_limit) return json({ error:`Your ${plan.name} plan allows ${plan.active_project_limit} active project${plan.active_project_limit===1?'':'s'}.` },402);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0,180) : 'Untitled Project';
    const { data,error } = await db.from('projects').insert({ user_id:user.id, project_type:projectType, idea, title, target_audience:String(body.target_audience||'').slice(0,180), tone:String(body.tone||'').slice(0,180), status:projectType==='comic_book'?'beta_idea':'idea' }).select('*').single(); if(error) throw error;
    return json({project:data},201);
  } catch(e){ return safeError(e); }
};
