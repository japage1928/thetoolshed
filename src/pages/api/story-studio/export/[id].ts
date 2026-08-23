import type { APIRoute } from 'astro';
import { generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext } from '../../../../lib/story-studio/server';
import { buildPublisherPackage } from '../../../../lib/story-studio/export';

type Obj = Record<string, any>;
const parse = (text:string) => { const v=parseJsonText(text); if(!v || typeof v!=='object' || Array.isArray(v)) throw Object.assign(new Error('Final QA returned invalid JSON.'),{status:502}); return v as Obj; };
const passed = (qa:Obj) => qa.passed===true && Number(qa.score||0)>=90 && !(Array.isArray(qa.issues)?qa.issues:[]).some((x:any)=>['critical','major'].includes(String(x?.severity||'').toLowerCase()));

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { user, db } = await storyContext(request);
    const limits = await getPlanAndUsage(user.id);
    if (limits.plan.id === 'free') return json({ error: 'KDP / publisher export is available on paid plans.' }, 402);
    const id = String(params.id || '');
    const { data: project, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!project) return json({ error: 'Project not found.' }, 404);

    const pages = Array.isArray(project.manuscript) ? project.manuscript : [];
    const illustrations = Array.isArray(project.illustrations) ? project.illustrations.filter((x:any)=>x?.url && x?.qa?.passed===true) : [];
    if (pages.length !== 24) return json({ error: `Final QA requires exactly 24 interior pages. This project has ${pages.length}.` }, 422);
    if (illustrations.length !== 12) return json({ error: `Final QA requires all 12 planned illustrations to pass visual QA. This project has ${illustrations.length} passed illustrations.` }, 422);
    if (!project.cover_image_url) return json({ error: 'Final QA requires a completed cover image.' }, 422);

    // Assemble first. Final QA is intentionally after layout/package construction.
    const bundle = await buildPublisherPackage(project);
    const manifest = {
      title: project.title,
      project_type: project.project_type,
      page_count: bundle.pageCount,
      illustration_count: bundle.illustrationCount,
      trim_size: bundle.metadata?.trim_size,
      bleed: bundle.metadata?.bleed,
      metadata: bundle.metadata,
      manuscript: pages.map((p:any)=>({page_number:p.page_number,title:p.title,content:p.content,illustrate:p.illustrate})),
      illustration_qa: illustrations.map((x:any)=>({page_number:x.page_number,score:x.qa?.score,passed:x.qa?.passed,issues:x.qa?.issues||[]})),
      cover_present: Boolean(project.cover_image_url),
      package_files: ['interior PDF','cover PDF','manuscript','metadata sheet','upload checklist'],
    };

    const qa = parse(await generateText(`ROLE: FINAL ASSEMBLED CHILDREN'S BOOK QA GATE. This is the last gate after manuscript editing, illustration visual QA, layout, and publisher-package assembly. Audit the complete assembled-book manifest below as one product. Be strict. Check 24-page completeness, story continuity and pacing across the whole book, age appropriateness, text/illustration balance, exactly 12 visually approved illustrations, metadata completeness, cover presence, trim/bleed expectations, and whether the package is coherent enough to hand to a publisher. Do not guarantee Amazon/KDP approval. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires score >= 90 and no critical or major issue.\n\nASSEMBLED BOOK MANIFEST:${JSON.stringify(manifest)}`));
    if (!passed(qa)) {
      const qaRecord = { action:'final_book', stage:'assembled_package_qa', score:Number(qa.score||0), passed:false, issues:qa.issues||[], checked_at:new Date().toISOString() };
      const history = [...(Array.isArray(project.qa_history)?project.qa_history:[]), qaRecord].slice(-100);
      await db.from('projects').update({ export_status:'qa_failed', status:'final_qa_failed', last_qa:qaRecord, qa_history:history, updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',user.id);
      return json({ error:`Final assembled-book QA rejected export (score ${Number(qa.score||0)}/100). Fix the listed issues before KDP export.`, qa },422);
    }

    const qaRecord = { action:'final_book', stage:'assembled_package_qa', score:Number(qa.score||0), passed:true, issues:qa.issues||[], checked_at:new Date().toISOString() };
    const history = [...(Array.isArray(project.qa_history)?project.qa_history:[]), qaRecord].slice(-100);
    await db.from('projects').update({ export_status:'exported', export_last_created_at:new Date().toISOString(), status:'finished', last_qa:qaRecord, qa_history:history, updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',user.id);
    return new Response(bundle.archive as BodyInit, { status:200, headers:{ 'content-type':'application/zip', 'content-disposition':`attachment; filename="${bundle.filename}"`, 'cache-control':'no-store', 'x-story-studio-pages':String(bundle.pageCount), 'x-story-studio-illustrations':String(bundle.illustrationCount), 'x-story-studio-final-qa':String(qa.score||0) } });
  } catch (e) { return safeError(e); }
};
