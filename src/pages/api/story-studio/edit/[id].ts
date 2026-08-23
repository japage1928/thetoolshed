import type { APIRoute } from 'astro';
import { assertSameOrigin, json, safeError, storyContext } from '../../../../lib/story-studio/server';

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request); const { user, db } = await storyContext(request); const id=String(params.id||''); const body=await request.json().catch(()=>({}));
    const { data:p,error }=await db.from('projects').select('*').eq('id',id).eq('user_id',user.id).maybeSingle(); if(error) throw error; if(!p) return json({error:'Project not found.'},404);
    const update: Record<string,unknown>={updated_at:new Date().toISOString(),export_status:'not_ready'};
    if(typeof body.title==='string' && body.title.trim()) update.title=body.title.trim().slice(0,180);
    if(Number.isFinite(Number(body.page_number)) && typeof body.content==='string') {
      const n=Number(body.page_number); const pages=Array.isArray(p.manuscript)?p.manuscript.map((x:any)=>Number(x.page_number)===n?{...x,content:body.content.slice(0,4000)}:x):[]; update.manuscript=pages;
    }
    const {data:saved,error:saveError}=await db.from('projects').update(update).eq('id',id).eq('user_id',user.id).select('*').single(); if(saveError) throw saveError; return json({project:saved});
  } catch(e){ return safeError(e); }
};
