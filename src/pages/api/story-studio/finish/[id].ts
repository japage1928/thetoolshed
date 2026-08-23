import type { APIRoute } from 'astro';
import { analyzeGeneratedImage, assertSameOrigin, generateImage, generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext, uploadGeneratedImage, wordCount } from '../../../../lib/story-studio/server';

type Obj = Record<string, any>;
const MAX_RETRIES = 3;
const REQUIRED_PAGES = 24;
const REQUIRED_ILLUSTRATIONS = 12;
const asObj = (value: unknown, label: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.keys(value as Obj).length === 1 && typeof (value as Obj).raw === 'string')) {
    throw Object.assign(new Error(`${label} returned invalid JSON.`), { status: 502 });
  }
  return value as Obj;
};
const parse = (text: string, label: string) => asObj(parseJsonText(text), label);
const canon = (p: Obj) => `TITLE: ${p.title}\nIDEA: ${p.idea}\nAUDIENCE: ${p.target_audience || 'Ages 4–8'}\nTONE: ${p.tone || 'warm, engaging'}\nSTORY BIBLE: ${JSON.stringify(p.story_bible || {})}\nVISUAL BIBLE: ${JSON.stringify(p.visual_bible || {})}\nOUTLINE: ${JSON.stringify(p.outline || {})}`;
const imageEstimate = () => Number(process.env.STORY_STUDIO_PAID_IMAGE_ESTIMATE_USD || '0.05');
const visionQaEstimate = () => Number(process.env.STORY_STUDIO_VISION_QA_ESTIMATE_USD || '0.01');
const fullTextEstimate = () => Number(process.env.STORY_STUDIO_FULL_BOOK_TEXT_ESTIMATE_USD || '0.20');

function passed(qa: Obj, threshold = 90) {
  const issues = Array.isArray(qa.issues) ? qa.issues : [];
  return qa.passed === true && Number(qa.score || 0) >= threshold && !issues.some((x: any) => ['critical', 'major'].includes(String(x?.severity || '').toLowerCase()));
}
function pipelineStatus(stage: string, status: 'pending'|'running'|'passed'|'failed'|'retrying'|'blocked', extra: Obj = {}) {
  return { stage, status, updated_at: new Date().toISOString(), ...extra };
}
function manuscriptShape(candidate: Obj) {
  const pages = Array.isArray(candidate.pages) ? candidate.pages : [];
  const illustrated = pages.filter((x: any) => x?.illustrate === true).length;
  const titlePages = pages.filter((x: any) => x?.page_type === 'title').length;
  const copyrightPages = pages.filter((x: any) => x?.page_type === 'copyright').length;
  const sequential = pages.every((x: any, i: number) => Number(x?.page_number) === i + 1);
  return { pages, illustrated, titlePages, copyrightPages, sequential };
}

async function generateQaApprovedCover(user: Obj, db: any, project: Obj, limits: Obj, visualBible: Obj) {
  const coverSpec = parse(await generateText(`${canon({ ...project, visual_bible: visualBible })}\n\nROLE: SENIOR CHILDREN'S BOOK COVER ART DIRECTOR. Create a production cover-art specification for this exact book. Preserve the locked character bible and art direction. The generated artwork itself must contain NO title, author text, letters, logos, watermarks, signatures, or barcode; Story Studio adds typography during layout. Return JSON only: {"prompt":"","character_lock":"","style_lock":"","composition":"","negative":""}.`), 'Cover art director');

  let prompt = `${coverSpec.prompt}\nCharacter lock: ${coverSpec.character_lock}\nStyle lock: ${coverSpec.style_lock}\nComposition: ${coverSpec.composition}\nAvoid: ${coverSpec.negative}\nNo readable text, letters, logos, signatures, watermarks, or typography.`;
  let lastQa: Obj = {};
  let attempts = 0;
  let passedUrl = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (limits.usage.images + attempts >= limits.plan.monthly_image_limit) throw Object.assign(new Error('Monthly image limit reached during cover QA retries.'), { status: 402 });
    const image = await generateImage(prompt, 'paid');
    const url = await uploadGeneratedImage(user.id, project.id, image);
    attempts++;
    await db.from('usage_events').insert({ user_id: user.id, project_id: project.id, usage_type: 'image', units: 1 });

    lastQa = parse(await analyzeGeneratedImage(url, `${canon({ ...project, visual_bible: visualBible })}\nCOVER SPEC:${JSON.stringify(coverSpec)}\n\nROLE: ACTUAL COVER ART QA. Inspect the generated cover artwork itself. Reject character drift, wrong species/age/clothing, malformed anatomy, extra limbs, unreadable composition, unrelated scenery, accidental text/logos/watermarks/signatures, photorealism, 3D render, vector/corporate clip art, generic UI art, unsafe material, or artwork that is not professional children's-book quality. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires score >= 90 and no critical or major issue.`), `Cover visual QA attempt ${attempt}`);
    if (passed(lastQa)) { passedUrl = url; break; }

    if (attempt < MAX_RETRIES) {
      const repair = parse(await generateText(`${canon({ ...project, visual_bible: visualBible })}\nCURRENT COVER PROMPT:${JSON.stringify(prompt)}\nVISUAL QA FAILURES:${JSON.stringify(lastQa)}\n\nROLE: COVER PROMPT REPAIR EDITOR. Rewrite the cover prompt to directly correct every QA failure without changing canon or the locked art style. Return JSON only: {"prompt":""}.`), 'Cover prompt repair');
      prompt = String(repair.prompt || prompt);
    }
  }

  if (!passedUrl) throw Object.assign(new Error(`Cover visual QA rejected the artwork after ${attempts} attempts.`), { status: 422, qa: lastQa });
  return { url: passedUrl, qa: lastQa, attempts, spec: coverSpec, estimated_run_cost_usd: Number((attempts * (imageEstimate() + visionQaEstimate())).toFixed(2)) };
}

async function manuscript(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request);
  const limits = await getPlanAndUsage(user.id);
  if (limits.plan.id === 'free') return json({ error: 'Full-book finishing and KDP export are paid features.' }, 402);

  const { data: p, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!p) return json({ error: 'Project not found.' }, 404);
  if (p.project_type !== 'childrens_book') return json({ error: 'Publisher-ready finishing currently supports children’s books first.' }, 422);

  await db.from('projects').update({ status: 'finishing_manuscript', export_status: 'not_ready', pipeline_state: pipelineStatus('story_and_editorial', 'running') }).eq('id', id).eq('user_id', user.id);

  const artDirection = parse(await generateText(`${canon(p)}\n\nROLE: SENIOR CHILDREN'S BOOK ART DIRECTOR. Create the locked Illustration Bible AND Character Bible for a real illustrated picture book. Define medium, style description, linework, texture, palette, lighting, character sheets with exact recurring identity anchors, environment rules, prop rules, composition rules, camera/framing tendencies, mood rules, and prohibited styles/variations. Unless explicitly requested otherwise, prohibit photorealism, 3D render, vector clip art, flat corporate illustration, glossy game art, UI iconography, text, logos, watermarks, and inconsistent character redesigns. Return JSON only with keys medium, style_description, linework, texture, palette, lighting, character_sheets, environment_rules, prop_rules, composition_rules, camera_rules, mood_rules, prohibited_styles, forbidden_character_variations.`), 'Art director');

  const schema = `{"pages":[{"page_number":1,"page_type":"title|copyright|story|endmatter","title":"","content":"","summary":"","continuity_updates":[],"illustration_prompt":"","illustrate":false}],"metadata":{"subtitle":"","author":"","description":"","keywords":[],"categories":[],"language":"English","back_cover_copy":""},"production_notes":{"reading_level":"","illustration_count":12,"trim_size":"8.5 x 8.5","page_count":24,"interior_color":"Premium Color","paper":"White"}}`;
  const prompt = `${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR CHILDREN'S BOOK AUTHOR AND BOOK ARCHITECT. Produce a COMPLETE 24-page, 8.5 x 8.5 inch children's picture-book interior. Page 1 must be page_type=title. Page 2 must be page_type=copyright with concise placeholder copyright/publication text that contains no fabricated ISBN. Pages 3-23 carry the story and/or appropriate end matter. Page 24 must intentionally close the book and may be endmatter or a deliberate blank-style closing page, but it must still contain a page record. Exactly 12 pages total must have illustrate=true, distributed across the story rather than concentrated at one end. Keep recurring characters visually and narratively consistent with the locked bibles. Story pages must have a clear beginning, escalation, emotional turn, climax, and satisfying resolution for the target age. Avoid filler and generic AI prose. Each page must have page_number, page_type, title, content, summary, continuity_updates, illustration_prompt, illustrate. Illustration prompts describe the visual moment only and defer identity/style to the locked bibles. Metadata must be realistic but may leave author blank if not supplied.\n\nReturn valid JSON only using exactly this schema shape: ${schema}`;

  let candidate = parse(await generateText(prompt), 'Writer');
  candidate = parse(await generateText(`${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR CHILDREN'S BOOK DEVELOPMENTAL + COPY EDITOR. Edit the complete candidate as one book. Fix pacing, repetition, weak page turns, continuity, reading-level mismatch, awkward prose, emotional arc, front matter, ending strength, illustration/text balance, and schema defects. Preserve exactly 24 sequential pages, page 1 title, page 2 copyright, and exactly 12 illustration slots. Return the same JSON schema only.\n\nCANDIDATE:${JSON.stringify(candidate)}`), 'Editor');

  const qaPrompt = (book: Obj) => `${canon({ ...p, visual_bible: artDirection })}\n\nROLE: INDEPENDENT STORY + PUBLISHING QA GATE. Audit this proposed children's picture book as a complete product. Check: exactly 24 sequential pages; title page at 1; copyright page at 2; exactly 12 illustration slots; age-appropriate vocabulary and sentence length; coherent plot and emotional arc; beginning/middle/end; page-turn rhythm; repetition; grammar; continuity; character consistency; safe content; no copyrighted/franchise characters; no fabricated ISBN; useful illustration moments; trim/interior notes requiring 8.5 x 8.5 Premium Color. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires score >= 90 and no critical or major issue.\n\nCANDIDATE:${JSON.stringify(book)}`;

  let qa: Obj = {};
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt;
    qa = parse(await generateText(qaPrompt(candidate)), `Manuscript QA attempt ${attempt}`);
    const shape = manuscriptShape(candidate);
    const structurallyValid = shape.pages.length === REQUIRED_PAGES && shape.illustrated === REQUIRED_ILLUSTRATIONS && shape.titlePages === 1 && shape.copyrightPages === 1 && shape.sequential;
    if (passed(qa) && structurallyValid) break;
    if (attempt < MAX_RETRIES) {
      candidate = parse(await generateText(`${canon({ ...p, visual_bible: artDirection })}\n\nROLE: SENIOR REVISION EDITOR. The manuscript failed publication QA. Repair every listed issue and every structural defect. Preserve exactly 24 sequential pages, page 1 title, page 2 copyright, exactly 12 illustration slots, and the locked canon. Return the same manuscript schema only.\n\nREJECTED:${JSON.stringify(candidate)}\nQA:${JSON.stringify(qa)}`), `Revision editor attempt ${attempt}`);
    }
  }

  const shape = manuscriptShape(candidate);
  const structurallyValid = shape.pages.length === REQUIRED_PAGES && shape.illustrated === REQUIRED_ILLUSTRATIONS && shape.titlePages === 1 && shape.copyrightPages === 1 && shape.sequential;
  if (!passed(qa) || !structurallyValid) {
    const failed = { action: 'full_book', stage: 'manuscript_final_qa', score: Number(qa.score || 0), passed: false, issues: qa.issues || [], attempts, checked_at: new Date().toISOString() };
    const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), failed].slice(-100);
    await db.from('projects').update({ status: 'manuscript_qa_failed', export_status: 'not_ready', last_qa: failed, qa_history: history, pipeline_state: pipelineStatus('story_and_editorial', 'failed', { failure_reason: 'Manuscript did not satisfy story/publishing QA.', retry_count: attempts - 1 }) }).eq('id', id).eq('user_id', user.id);
    return json({ error: `Publishing QA rejected the full book after ${attempts} attempt(s).`, qa, structure: { page_count: shape.pages.length, illustration_count: shape.illustrated, title_pages: shape.titlePages, copyright_pages: shape.copyrightPages, sequential: shape.sequential } }, 422);
  }

  const words = shape.pages.reduce((n: number, x: any) => n + wordCount(String(x?.content || '')), 0);
  if (limits.usage.words + words > limits.plan.monthly_word_limit) return json({ error: 'This full book would exceed the monthly writing limit for the current plan.' }, 402);

  const cover = await generateQaApprovedCover(user, db, p, limits, artDirection);
  const textCost = fullTextEstimate();
  const estimatedRunCostUsd = Number((textCost + cover.estimated_run_cost_usd).toFixed(2));
  const metadata = {
    ...(candidate.metadata || {}),
    cost_tracking: {
      manuscript_pipeline_estimated_usd: textCost,
      cover_pipeline_estimated_usd: cover.estimated_run_cost_usd,
      total_so_far_estimated_usd: estimatedRunCostUsd,
      manuscript_qa_attempts: attempts,
      cover_qa_attempts: cover.attempts,
      estimate_only: true,
    },
  };
  const qaRecord = { action: 'full_book', stage: 'manuscript_final_qa', score: Number(qa.score || 0), passed: true, issues: qa.issues || [], attempts, checked_at: new Date().toISOString() };
  const coverQaRecord = { action: 'cover', stage: 'actual_cover_visual_qa', score: Number(cover.qa.score || 0), passed: true, issues: cover.qa.issues || [], attempts: cover.attempts, checked_at: new Date().toISOString() };
  const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), qaRecord, coverQaRecord].slice(-100);
  const { data: saved, error: saveError } = await db.from('projects').update({
    manuscript: shape.pages,
    metadata,
    visual_bible: artDirection,
    illustrations: [],
    cover_image_url: cover.url,
    cover_qa: coverQaRecord,
    status: 'illustrating',
    export_status: 'not_ready',
    pipeline_state: pipelineStatus('story_and_editorial', 'passed', { next_stage: 'illustration_generation', retry_count: (attempts - 1) + (cover.attempts - 1) }),
    updated_at: new Date().toISOString(),
    last_qa: coverQaRecord,
    qa_history: history,
  }).eq('id', id).eq('user_id', user.id).select('*').single();
  if (saveError) throw saveError;
  await db.from('usage_events').insert({ user_id: user.id, project_id: id, usage_type: 'words', units: Math.max(1, words) });
  return json({ project: saved, qa, art_direction: artDirection, cover_qa: cover.qa, illustration_pages: shape.pages.filter((x: any) => x.illustrate).map((x: any) => x.page_number), estimated_run_cost_usd: estimatedRunCostUsd, retries: { manuscript: attempts - 1, cover: cover.attempts - 1 } });
}

async function illustration(request: Request, id: string) {
  assertSameOrigin(request);
  const body = await request.json().catch(() => ({}));
  const pageNumber = Number(body.page_number);
  const { user, db } = await storyContext(request);
  const limits = await getPlanAndUsage(user.id);
  if (limits.plan.id === 'free') return json({ error: 'Illustrated full-book finishing is a paid feature.' }, 402);

  const { data: p, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!p) return json({ error: 'Project not found.' }, 404);
  const page = (Array.isArray(p.manuscript) ? p.manuscript : []).find((x: any) => Number(x.page_number) === pageNumber);
  if (!page || page.illustrate !== true) return json({ error: 'That page is not an illustration slot.' }, 422);

  const existing = Array.isArray(p.illustrations) ? p.illustrations : [];
  if (existing.some((x: any) => Number(x.page_number) === pageNumber && x.url && x.qa?.passed === true)) return json({ project: p, skipped: true });

  await db.from('projects').update({ pipeline_state: pipelineStatus('illustration_generation', 'running', { page_number: pageNumber }) }).eq('id', id).eq('user_id', user.id);
  const spec = parse(await generateText(`${canon(p)}\nPAGE:${JSON.stringify(page)}\n\nROLE: CHILDREN'S PICTURE-BOOK ILLUSTRATION DIRECTOR. Create one precise scene specification. Preserve every recurring character model-sheet detail exactly. Return JSON only with keys prompt, character_lock, style_lock, composition, camera, lighting, required_story_elements, forbidden_elements, continuity_references, negative.`), 'Illustration director');

  let finalPrompt = `${spec.prompt}\nCharacter lock: ${spec.character_lock}\nStyle lock: ${spec.style_lock}\nComposition: ${spec.composition}\nCamera: ${spec.camera}\nLighting: ${spec.lighting}\nRequired story elements: ${JSON.stringify(spec.required_story_elements)}\nContinuity references: ${JSON.stringify(spec.continuity_references)}\nAvoid: ${spec.negative}; ${JSON.stringify(spec.forbidden_elements)}\nPRODUCTION REQUIREMENT: finished professional children's picture-book artwork. No readable text, logos, watermarks, signatures, malformed anatomy, duplicate limbs, floating objects, photorealism, 3D render, vector/corporate clip art, UI art, or character redesigns.`;
  let lastQa: Obj = {};
  let passedUrl = '';
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (limits.usage.images + attempts >= limits.plan.monthly_image_limit) return json({ error: 'Monthly image limit reached during illustration QA retries.', qa: lastQa }, 402);
    const image = await generateImage(finalPrompt, 'paid');
    const url = await uploadGeneratedImage(user.id, id, image);
    attempts++;
    await db.from('usage_events').insert({ user_id: user.id, project_id: id, usage_type: 'image', units: 1 });

    lastQa = parse(await analyzeGeneratedImage(url, `${canon(p)}\nPAGE:${JSON.stringify(page)}\nIMAGE SPEC:${JSON.stringify(spec)}\n\nROLE: ACTUAL ILLUSTRATION VISUAL QA. Inspect the generated image itself for correct characters/count, identity and clothing consistency, anatomy, facial integrity, scene and object continuity, art-style consistency, age appropriateness, accidental text/logos/watermarks, professional composition, and whether it matches this exact page. Return JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"","message":"","fix":""}],"summary":""}. Passing requires score >= 90 and no critical or major issue.`), `Illustration visual QA attempt ${attempt}`);
    if (passed(lastQa)) { passedUrl = url; break; }

    if (attempt < MAX_RETRIES) {
      const repair = parse(await generateText(`${canon(p)}\nPAGE:${JSON.stringify(page)}\nCURRENT PROMPT:${JSON.stringify(finalPrompt)}\nVISUAL QA FAILURES:${JSON.stringify(lastQa)}\n\nROLE: SENIOR ILLUSTRATION PROMPT REPAIR EDITOR. Rewrite the prompt to directly correct every visual QA failure while preserving the locked character and style bibles. Return JSON only: {"prompt":""}.`), 'Illustration prompt repair');
      finalPrompt = String(repair.prompt || finalPrompt);
    }
  }

  const estimatedRunCostUsd = Number((attempts * (imageEstimate() + visionQaEstimate())).toFixed(2));
  if (!passedUrl) {
    const failed = { action: 'illustration', stage: 'actual_image_visual_qa', page_number: pageNumber, score: Number(lastQa.score || 0), passed: false, issues: lastQa.issues || [], attempts, checked_at: new Date().toISOString() };
    const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), failed].slice(-100);
    await db.from('projects').update({ status: 'illustration_qa_failed', export_status: 'not_ready', last_qa: failed, qa_history: history, pipeline_state: pipelineStatus('illustration_generation', 'failed', { page_number: pageNumber, failure_reason: `Illustration failed visual QA after ${attempts} attempts.`, retry_count: attempts - 1 }) }).eq('id', id).eq('user_id', user.id);
    return json({ error: `Illustration QA rejected page ${pageNumber} after ${attempts} attempts. Failed images were not attached to the book.`, qa: lastQa, attempts, estimated_run_cost_usd: estimatedRunCostUsd }, 422);
  }

  const qaRecord = { action: 'illustration', stage: 'actual_image_visual_qa', page_number: pageNumber, score: Number(lastQa.score || 0), passed: true, issues: lastQa.issues || [], attempts, checked_at: new Date().toISOString() };
  const illustrations = [...existing.filter((x: any) => Number(x.page_number) !== pageNumber), { page_number: pageNumber, url: passedUrl, prompt: finalPrompt, spec, qa: qaRecord, attempts, estimated_run_cost_usd: estimatedRunCostUsd, created_at: new Date().toISOString() }].sort((a: any, b: any) => a.page_number - b.page_number);
  const requiredPages = (Array.isArray(p.manuscript) ? p.manuscript : []).filter((x: any) => x?.illustrate === true).length;
  const passedIllustrations = illustrations.filter((x: any) => x?.url && x?.qa?.passed === true).length;
  const ready = requiredPages === REQUIRED_ILLUSTRATIONS && passedIllustrations === REQUIRED_ILLUSTRATIONS;
  const history = [...(Array.isArray(p.qa_history) ? p.qa_history : []), qaRecord].slice(-100);
  const { data: saved, error: saveError } = await db.from('projects').update({ illustrations, status: ready ? 'layout_qa_pending' : 'illustrating', export_status: 'not_ready', last_qa: qaRecord, qa_history: history, pipeline_state: pipelineStatus('illustration_generation', ready ? 'passed' : 'running', { page_number: pageNumber, passed_illustrations: passedIllustrations, required_illustrations: REQUIRED_ILLUSTRATIONS, retry_count: attempts - 1 }), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).select('*').single();
  if (saveError) throw saveError;
  return json({ project: saved, url: passedUrl, page_number: pageNumber, qa: lastQa, attempts, ready_for_final_qa: ready, estimated_run_cost_usd: estimatedRunCostUsd });
}

const handler: APIRoute = async ({ request, params }) => {
  try {
    const id = String(params.id || '');
    const body = request.method === 'POST' ? await request.clone().json().catch(() => ({})) : {};
    if (body.step === 'manuscript') return manuscript(request, id);
    if (body.step === 'illustration') return illustration(request, id);
    return json({ error: 'Unknown finishing step.' }, 400);
  } catch (e: any) {
    if (e?.qa) return json({ error: e.message || 'Finishing failed.', qa: e.qa }, e.status || 500);
    return safeError(e);
  }
};
export const POST = handler;
