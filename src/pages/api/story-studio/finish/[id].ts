import type { APIRoute } from 'astro';
import { analyzeGeneratedImage, assertSameOrigin, generateImage, generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext, uploadGeneratedImage, wordCount } from '../../../../lib/story-studio/server';

type Obj = Record<string, any>;
const asObj = (value: unknown, label: string) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${label} returned invalid JSON.`), { status: 502 }); return value as Obj; };
const parse = (text: string, label: string) => asObj(parseJsonText(text), label);
const canon = (p: Obj) => `TITLE: ${p.title}\nIDEA: ${p.idea}\nAUDIENCE: ${p.target_audience || 'Ages 4–8'}\nTONE: ${p.tone || 'warm, engaging'}\nSTORY BIBLE: ${JSON.stringify(p.story_bible || {})}\nVISUAL BIBLE: ${JSON.stringify(p.visual_bible || {})}\nOUTLINE: ${JSON.stringify(p.outline || {})}`;
const imageEstimate = () => Number(process.env.STORY_STUDIO_PAID_IMAGE_ESTIMATE_USD || '0.05');
const visionQaEstimate = () => Number(process.env.STORY_STUDIO_VISION_QA_ESTIMATE_USD || '0.01');
const fullTextEstimate = () => Number(process.env.STORY_STUDIO_FULL_BOOK_TEXT_ESTIMATE_USD || '0.20');

function passed(qa: Obj, threshold = 90) {
  const issues = Array.isArray(qa.issues) ? qa.issues : [];
  return qa.passed === true && Number(qa.score || 0) >= threshold && !issues.some((x:any) => ['critical','major'].includes(String(x?.severity || '').toLowerCase()));
}

async function manuscript(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request); const limits = await getPlanAndUsage(user.id);
  if (limits.plan.id === 'free') return json({ error: 'Full-book finishing and KDP export are paid features.' }, 402);
  const { data: p, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(); if (error) throw error; if (!p) return json({ error: 'Project not found.' }, 404);
  if (p.project_type !== 'childrens_book') return json({ error: 'Publisher-ready finishing currently supports children’s books first.' }, 422);

  const artDirection = parse(await generateText(`${canon(p)}\n\nROLE: SENIOR CHILDREN'S BOOK ART DIRECTOR. Create the locked visual bible and character bible for a real illustrated picture book. The target must look hand-drawn or traditionally illustrated, not like generic app art. Define medium, linework, texture, palette, lighting, recurring character model sheets, exact clothing/fur/hair/face/proportions, environment rules, prop rules, composition rules, and prohibited styles. Unless the project explicitly asks otherwise, prohibit photorealism, 3D render, vector clip art, flat corporate illustration, glossy game art, UI iconography, text, logos, watermarks, and inconsistent character redesigns. Return JSON only with keys medium, style_description, linework, texture, palette, lighting, character_sheets, environment_rules, prop_rules, composition_rules, prohibited_styles.`), 'Art director');

  const prompt = `${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR CHILDREN'S BOOK AUTHOR AND BOOK ARCHITECT. Produce a complete 24-page, 8.5 x 8.5 inch children's picture-book manuscript ready for illustration and page layout. The story must have a clear beginning, escalation, emotional turn, climax, satisfying resolution, and age-appropriate language. Preserve exact recurring character facts. Select exactly 12 pages for full-page illustrations, distributed across the story. Every page must contain page_number, title, content, summary, continuity_updates, illustration_prompt, and illustrate. Each illustration_prompt must describe a specific visual storytelling moment and defer style/identity to the locked visual bible. Also create publication metadata.\n\nReturn valid JSON only with exactly this schema: {"pages":[{"page_number":1,"title":"","content":"","summary":"","continuity_updates":[],"illustration_prompt":"","illustrate":true}],"metadata":{"subtitle":"","author":"","description":"","keywords":[],"categories":[],"language":"English","back_cover_copy":""},"production_notes":{"reading_level":"","illustration_count":12,"trim_size":"8.5 x 8.5","page_count":24}}. pages must contain exactly 24 items and exactly 12 must have illustrate=true.`;
  let draft = parse(await generateText(prompt), 'Writer');
  draft = parse(await generateText(`${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR CHILDREN'S BOOK EDITOR. Edit this complete picture book as one manuscript. Fix pacing, repetition, weak page turns, continuity, age fit, awkward prose, emotional arc, and illustration/text balance. Preserve exactly 24 pages and exactly 12 illustration slots. Return the same JSON schema only.\n\nCANDIDATE:${JSON.stringify(draft)}`), 'Editor');

  const qaPrompt = (candidate: Obj) => `${canon({ ...p, visual_bible: artDirection })}\n\nROLE: INDEPENDENT PUBLISHING QA. Audit this proposed 24-page children's picture book for continuity, plot logic, age fit, repetition, page-turn quality, ending strength, unsafe content, page count, illustration distribution, visual-storytelling opportunities, and consistency with the locked character/visual bible. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires exactly 24 pages, exactly 12 illustration pages, score >= 90, and no critical or major issue.\n\nCANDIDATE:${JSON.stringify(candidate)}`;
  let qa = parse(await generateText(qaPrompt(draft)), 'QA');
  if (!passed(qa)) {
    draft = parse(await generateText(`${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR REVISION EDITOR. Repair every QA issue in the rejected complete manuscript. Preserve exactly 24 pages and exactly 12 illustration slots. Return the same manuscript JSON schema only.\n\nREJECTED:${JSON.stringify(draft)}\nQA:${JSON.stringify(qa)}`), 'Revision editor');
    qa = parse(await generateText(qaPrompt(draft)), 'Final QA');
  }

  const pages = Array.isArray(draft.pages) ? draft.pages : []; const illustrated = pages.filter((x:any) => x?.illustrate === true).length; const score = Number(qa.score || 0);
  if (pages.length !== 24 || illustrated !== 12 || !passed(qa)) return json({ error: `Publishing QA rejected the full book (score ${score}/100, ${pages.length} pages, ${illustrated} illustration slots). Nothing was saved.`, qa }, 422);
  const words = pages.reduce((n:number, x:any) => n + wordCount(String(x?.content || '')), 0);
  if (limits.usage.words + words > limits.plan.monthly_word_limit) return json({ error: 'This full book would exceed the monthly writing limit for the current plan.' }, 402);

  const estimatedRunCostUsd = fullTextEstimate();
  const metadata = { ...(draft.metadata || {}), cost_tracking: { manuscript_pipeline_estimated_usd: estimatedRunCostUsd, estimate_only: true } };
  const qaRecord = { action:'full_book', stage:'manuscript_final_qa', score, passed:true, issues:qa.issues || [], checked_at:new Date().toISOString() };
  const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), qaRecord].slice(-100);
  const { data: saved, error: saveError } = await db.from('projects').update({ manuscript: pages, metadata, visual_bible: artDirection, illustrations: [], status: 'illustrating', export_status: 'not_ready', updated_at: new Date().toISOString(), last_qa: qaRecord, qa_history: history }).eq('id', id).eq('user_id', user.id).select('*').single(); if (saveError) throw saveError;
  await db.from('usage_events').insert({ user_id:user.id, project_id:id, usage_type:'words', units:Math.max(1, words) });
  return json({ project:saved, qa, art_direction:artDirection, illustration_pages:pages.filter((x:any)=>x.illustrate).map((x:any)=>x.page_number), estimated_run_cost_usd: estimatedRunCostUsd });
}

async function illustration(request: Request, id: string) {
  assertSameOrigin(request); const body = await request.json().catch(()=>({})); const pageNumber = Number(body.page_number);
  const { user, db } = await storyContext(request); const limits = await getPlanAndUsage(user.id); if (limits.plan.id === 'free') return json({ error:'Illustrated full-book finishing is a paid feature.' },402);
  const { data:p, error } = await db.from('projects').select('*').eq('id',id).eq('user_id',user.id).maybeSingle(); if(error) throw error; if(!p) return json({error:'Project not found.'},404);
  const page = (Array.isArray(p.manuscript)?p.manuscript:[]).find((x:any)=>Number(x.page_number)===pageNumber); if(!page || page.illustrate!==true) return json({error:'That page is not an illustration slot.'},422);
  const existing = Array.isArray(p.illustrations)?p.illustrations:[]; if(existing.some((x:any)=>Number(x.page_number)===pageNumber && x.url && x.qa?.passed===true)) return json({ project:p, skipped:true });

  const spec = parse(await generateText(`${canon(p)}\nPAGE:${JSON.stringify(page)}\n\nROLE: CHILDREN'S PICTURE-BOOK ILLUSTRATION DIRECTOR. Create one precise production specification for this page. It must look like a professionally drawn children's-book illustration using the locked medium and style. Preserve every recurring character model-sheet detail exactly. Describe pose, expression, storytelling action, environment, props, framing, foreground/midground/background, lighting, and emotional focal point. Explicitly forbid photorealism, 3D render, vector clip art, flat corporate art, glossy game art, text, letters, logos, signatures, watermarks, malformed anatomy, duplicate limbs, floating objects, and character redesigns. Return JSON only: {"prompt":"","character_lock":"","style_lock":"","composition":"","negative":""}.`), 'Illustration director');

  let finalPrompt = `${spec.prompt}\nCharacter lock: ${spec.character_lock}\nStyle lock: ${spec.style_lock}\nComposition: ${spec.composition}\nAvoid: ${spec.negative}\nPRODUCTION REQUIREMENT: a finished, expressive, hand-drawn/traditionally illustrated children's picture-book page. No photorealism, 3D render, vector clip art, corporate flat illustration, UI art, readable text, logos, watermarks, signatures, malformed anatomy, duplicate limbs, or inconsistent character design.`;
  let lastQa: Obj = {}; let passedUrl = ''; let attempts = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (limits.usage.images + attempts >= limits.plan.monthly_image_limit) return json({ error:'Monthly image limit reached during illustration QA retries.', qa:lastQa },402);
    const image = await generateImage(finalPrompt, 'paid');
    const url = await uploadGeneratedImage(user.id,id,image);
    attempts++;
    await db.from('usage_events').insert({user_id:user.id,project_id:id,usage_type:'image',units:1});

    const qaText = await analyzeGeneratedImage(url, `${canon(p)}\nPAGE:${JSON.stringify(page)}\nIMAGE SPEC:${JSON.stringify(spec)}\n\nInspect the actual generated illustration. Return JSON only with exactly: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Reject if the image is not recognizably professional children's picture-book artwork, if the scene does not match the page, if character identity drifts from the visual bible, if anatomy/objects are visibly malformed, if text/logos/watermarks appear, if composition is confusing, or if it looks photorealistic, 3D, vector clip art, corporate flat art, or generic unrelated AI imagery. Passing requires score >= 90 and no critical or major issue.`);
    lastQa = parse(qaText, `Illustration visual QA attempt ${attempt}`);
    if (passed(lastQa)) { passedUrl = url; break; }
    if (attempt < 3) {
      const repair = parse(await generateText(`${canon(p)}\nPAGE:${JSON.stringify(page)}\nCURRENT PROMPT:${JSON.stringify(finalPrompt)}\nVISUAL QA FAILURES:${JSON.stringify(lastQa)}\n\nROLE: SENIOR ILLUSTRATION PROMPT REPAIR EDITOR. Rewrite the production prompt to directly correct every visual QA failure while preserving the locked character and style bible. Return JSON only: {"prompt":""}.`), 'Illustration prompt repair');
      finalPrompt = String(repair.prompt || finalPrompt);
    }
  }

  const estimatedRunCostUsd = Number((attempts * (imageEstimate() + visionQaEstimate())).toFixed(2));
  if (!passedUrl) return json({ error:`Illustration QA rejected page ${pageNumber} after ${attempts} attempts. The failed images were not attached to the book.`, qa:lastQa, attempts, estimated_run_cost_usd:estimatedRunCostUsd },422);

  const qaRecord = { action:'illustration', stage:'actual_image_visual_qa', page_number:pageNumber, score:Number(lastQa.score || 0), passed:true, issues:lastQa.issues || [], attempts, checked_at:new Date().toISOString() };
  const illustrations = [...existing.filter((x:any)=>Number(x.page_number)!==pageNumber), { page_number:pageNumber, url:passedUrl, prompt:finalPrompt, spec, qa:qaRecord, attempts, estimated_run_cost_usd:estimatedRunCostUsd, created_at:new Date().toISOString() }].sort((a:any,b:any)=>a.page_number-b.page_number);
  const requiredPages = (Array.isArray(p.manuscript)?p.manuscript:[]).filter((x:any)=>x?.illustrate===true).length;
  const passedIllustrations = illustrations.filter((x:any)=>x?.url && x?.qa?.passed===true).length;
  const ready = requiredPages === 12 && passedIllustrations === 12;
  const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), qaRecord].slice(-100);
  const { data:saved, error:saveError } = await db.from('projects').update({ illustrations, status:ready?'layout_qa_pending':'illustrating', export_status:'not_ready', last_qa:qaRecord, qa_history:history, updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',user.id).select('*').single(); if(saveError) throw saveError;
  return json({project:saved,url:passedUrl,page_number:pageNumber,qa:lastQa,attempts,ready_for_final_qa:ready,estimated_run_cost_usd:estimatedRunCostUsd});
}

const handler: APIRoute = async ({request,params}) => { try { const id=String(params.id||''); const body = request.method==='POST' ? await request.clone().json().catch(()=>({})) : {}; if(body.step==='manuscript') return manuscript(request,id); if(body.step==='illustration') return illustration(request,id); return json({error:'Unknown finishing step.'},400); } catch(e){ return safeError(e); } };
export const POST = handler;
