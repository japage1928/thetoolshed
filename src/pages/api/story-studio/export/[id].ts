import type { APIRoute } from 'astro';
import { generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext } from '../../../../lib/story-studio/server';
import { buildPublisherPackage } from '../../../../lib/story-studio/export';

type Obj = Record<string, any>;
const parse = (text: string) => {
  const v = parseJsonText(text);
  if (!v || typeof v !== 'object' || Array.isArray(v) || (Object.keys(v as Obj).length === 1 && typeof (v as Obj).raw === 'string')) {
    throw Object.assign(new Error('Final QA returned invalid JSON.'), { status: 502 });
  }
  return v as Obj;
};
const passed = (qa: Obj) => qa.passed === true && Number(qa.score || 0) >= 90 && !(Array.isArray(qa.issues) ? qa.issues : []).some((x: any) => ['critical', 'major'].includes(String(x?.severity || '').toLowerCase()));

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
    const illustrations = Array.isArray(project.illustrations) ? project.illustrations.filter((x: any) => x?.url && x?.qa?.passed === true) : [];
    const coverQa = project.cover_qa || {};
    const pageNumbersValid = pages.length === 24 && pages.every((p: any, i: number) => Number(p?.page_number) === i + 1);
    const titlePageValid = pages.filter((p: any) => p?.page_type === 'title').length === 1 && pages[0]?.page_type === 'title';
    const copyrightPageValid = pages.filter((p: any) => p?.page_type === 'copyright').length === 1 && pages[1]?.page_type === 'copyright';
    const illustrationSlots = pages.filter((p: any) => p?.illustrate === true).length;

    if (!pageNumbersValid) return json({ error: 'Final QA requires exactly 24 sequential interior pages.' }, 422);
    if (!titlePageValid || !copyrightPageValid) return json({ error: 'Final QA requires a title page at page 1 and copyright page at page 2.' }, 422);
    if (illustrationSlots !== 12) return json({ error: `Final QA requires exactly 12 planned illustration slots. This project has ${illustrationSlots}.` }, 422);
    if (illustrations.length !== 12) return json({ error: `Final QA requires all 12 planned illustrations to pass actual-image visual QA. This project has ${illustrations.length} passed illustrations.` }, 422);
    if (!project.cover_image_url || coverQa.passed !== true || Number(coverQa.score || 0) < 90) return json({ error: 'Final QA requires a cover image that passed actual-cover visual QA at 90/100 or better.' }, 422);

    await db.from('projects').update({ status: 'assembling_package', export_status: 'qa_pending', pipeline_state: { stage: 'layout_and_prepress', status: 'running', updated_at: new Date().toISOString() } }).eq('id', id).eq('user_id', user.id);

    // Assemble the real PDFs/ZIP first. Structural prepress validation occurs during assembly.
    const bundle = await buildPublisherPackage(project);
    if (!bundle.prepressValidation?.passed) {
      const qaRecord = { action: 'prepress', stage: 'layout_prepress_qa', score: 0, passed: false, issues: bundle.prepressValidation?.checks || [], checked_at: new Date().toISOString() };
      const history = [...(Array.isArray(project.qa_history) ? project.qa_history : []), qaRecord].slice(-100);
      await db.from('projects').update({ export_status: 'qa_failed', status: 'layout_qa_failed', last_qa: qaRecord, qa_history: history, pipeline_state: { stage: 'layout_and_prepress', status: 'failed', failure_reason: 'Structural prepress validation failed.', retry_count: 0, updated_at: new Date().toISOString() } }).eq('id', id).eq('user_id', user.id);
      return json({ error: 'Layout/prepress QA rejected the assembled package.', prepress: bundle.prepressValidation }, 422);
    }

    const manifest = {
      title: project.title,
      project_type: project.project_type,
      page_count: bundle.pageCount,
      illustration_count: bundle.illustrationCount,
      cover_qa: coverQa,
      trim_size: bundle.metadata?.trim_size,
      bleed: bundle.metadata?.bleed,
      interior_color: bundle.metadata?.interior_color,
      paper: bundle.metadata?.paper,
      spine_width_in: bundle.metadata?.spine_width_in,
      interior_pdf_size_in: bundle.metadata?.interior_pdf_size_in,
      cover_pdf_size_in: bundle.metadata?.cover_pdf_size_in,
      prepress_validation: bundle.prepressValidation,
      metadata: bundle.metadata,
      manuscript: pages.map((p: any) => ({ page_number: p.page_number, page_type: p.page_type, title: p.title, content: p.content, illustrate: p.illustrate })),
      illustration_qa: illustrations.map((x: any) => ({ page_number: x.page_number, score: x.qa?.score, passed: x.qa?.passed, issues: x.qa?.issues || [], attempts: x.attempts || 1 })),
      package_files: bundle.projectManifest?.files || [],
    };

    const qa = parse(await generateText(`ROLE: FINAL ASSEMBLED CHILDREN'S BOOK QA GATE. This is the final gate AFTER story editing, manuscript QA, actual cover visual QA, actual illustration visual QA, PDF layout, and structural prepress/package assembly. Audit the assembled-book manifest as one finished commercial product. Be strict. Check: exactly 24 sequential pages; title/copyright front matter; coherent story continuity and pacing; target-age suitability; exactly 12 approved illustrations matching their pages; cover visual approval; metadata completeness; 8.5 x 8.5 trim; proper bleed dimensions; Premium Color suitability for a 24-page color book; correct Premium Color spine calculation; package completeness; no missing assets; and whether the package is coherent enough to hand to a publisher. Do not guarantee Amazon/KDP approval. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires score >= 90 and no critical or major issue.\n\nASSEMBLED BOOK MANIFEST:${JSON.stringify(manifest)}`));

    if (!passed(qa)) {
      const qaRecord = { action: 'final_book', stage: 'assembled_package_qa', score: Number(qa.score || 0), passed: false, issues: qa.issues || [], checked_at: new Date().toISOString() };
      const history = [...(Array.isArray(project.qa_history) ? project.qa_history : []), qaRecord].slice(-100);
      await db.from('projects').update({ export_status: 'qa_failed', status: 'final_qa_failed', last_qa: qaRecord, qa_history: history, pipeline_state: { stage: 'final_assembled_book_qa', status: 'failed', failure_reason: `Final assembled-book QA score ${Number(qa.score || 0)}/100.`, retry_count: 0, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
      return json({ error: `Final assembled-book QA rejected export (score ${Number(qa.score || 0)}/100). Fix the listed issues before KDP export.`, qa }, 422);
    }

    const qaRecord = { action: 'final_book', stage: 'assembled_package_qa', score: Number(qa.score || 0), passed: true, issues: qa.issues || [], checked_at: new Date().toISOString() };
    const history = [...(Array.isArray(project.qa_history) ? project.qa_history : []), qaRecord].slice(-100);
    await db.from('projects').update({ export_status: 'exported', export_last_created_at: new Date().toISOString(), status: 'finished', last_qa: qaRecord, qa_history: history, pipeline_state: { stage: 'kdp_export', status: 'passed', updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);

    return new Response(bundle.archive as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${bundle.filename}"`,
        'cache-control': 'no-store',
        'x-story-studio-pages': String(bundle.pageCount),
        'x-story-studio-illustrations': String(bundle.illustrationCount),
        'x-story-studio-final-qa': String(qa.score || 0),
        'x-story-studio-prepress': 'passed',
      },
    });
  } catch (e) {
    return safeError(e);
  }
};
