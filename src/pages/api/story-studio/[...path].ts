import type { APIRoute } from 'astro';
import { assertSameOrigin, generateImage, generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext, uploadGeneratedImage, wordCount } from '../../../lib/story-studio/server';

type JsonObject = Record<string, any>;

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`${label} returned invalid structured output.`), { status: 502 });
  }
  const object = value as JsonObject;
  if (Object.keys(object).length === 1 && typeof object.raw === 'string') {
    throw Object.assign(new Error(`${label} returned malformed JSON.`), { status: 502 });
  }
  return object;
}

function parseObject(text: string, label: string) {
  return asObject(parseJsonText(text), label);
}

function ensureKeys(candidate: JsonObject, keys: string[], label: string) {
  const missing = keys.filter((key) => candidate[key] === undefined || candidate[key] === null);
  if (missing.length) throw Object.assign(new Error(`${label} is missing required fields: ${missing.join(', ')}.`), { status: 502 });
}

function scoreOf(qa: JsonObject) {
  const score = Number(qa.score);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
}

function passedQa(qa: JsonObject, threshold = 90) {
  return qa.passed === true && scoreOf(qa) >= threshold;
}

function qaRecord(action: string, qa: JsonObject, attempts: number, pipeline: string) {
  return {
    action,
    pipeline,
    passed: qa.passed === true,
    score: scoreOf(qa),
    issues: Array.isArray(qa.issues) ? qa.issues.slice(0, 20) : [],
    attempts,
    checked_at: new Date().toISOString(),
  };
}

function strictJsonRules(requiredKeys: string[]) {
  return `\n\nOUTPUT CONTRACT:\n- Return exactly one valid JSON object and nothing else.\n- No markdown fences, commentary, preamble, or trailing text.\n- Use these required top-level keys: ${requiredKeys.join(', ')}.\n- Never omit a required key.\n- Never invent facts that conflict with the supplied project canon.\n- Treat the Story Bible and existing manuscript as authoritative canon.`;
}

async function runEditorialPipeline(params: {
  action: string;
  context: string;
  draftPrompt: string;
  requiredKeys: string[];
}) {
  const { action, context, draftPrompt, requiredKeys } = params;
  const draft = parseObject(await generateText(`${draftPrompt}${strictJsonRules(requiredKeys)}`), 'Writer');

  const edited = parseObject(await generateText(`${context}\n\nROLE: SENIOR DEVELOPMENTAL + COPY EDITOR.\nReview the candidate below as if it will be published. Fix continuity errors, weak structure, repetition, unclear prose, age/audience mismatch, tone drift, factual contradictions, and schema defects. Preserve the author's intent and do not add unsupported canon. For children's material, ensure vocabulary, sentence length, emotional intensity, and themes are appropriate to the stated audience. Return the corrected production candidate using the exact same schema.\n\nCANDIDATE:\n${JSON.stringify(draft)}${strictJsonRules(requiredKeys)}`), 'Editor');
  ensureKeys(edited, requiredKeys, 'Editor output');

  const qaPrompt = (candidate: JsonObject) => `${context}\n\nROLE: INDEPENDENT PUBLICATION QA GATE.\nAudit the candidate against the project idea, audience, tone, Story Bible, outline, existing manuscript, and required output schema. Be strict. Check continuity, character facts, timeline, plot logic, prose quality, repetition, unresolved contradictions, audience/reading-level fit, safety for the target audience, and whether the candidate actually advances the outline. Do not approve merely because it is readable.\n\nCANDIDATE:\n${JSON.stringify(candidate)}\n\nReturn JSON only with this exact schema: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"short_code","message":"specific problem","fix":"specific correction"}],"summary":"brief QA summary"}. A passing result requires score >= 90 and no critical or major issue. Never include the candidate itself.`;

  let finalCandidate = edited;
  let qa = parseObject(await generateText(qaPrompt(finalCandidate)), 'QA');
  let attempts = 1;

  if (!passedQa(qa)) {
    const repaired = parseObject(await generateText(`${context}\n\nROLE: SENIOR REVISION EDITOR.\nThe independent QA gate rejected the candidate. Repair every listed critical and major issue and as many minor issues as possible without violating canon or changing the requested scope. Return only the repaired production candidate using the required schema.\n\nREJECTED CANDIDATE:\n${JSON.stringify(finalCandidate)}\n\nQA FINDINGS:\n${JSON.stringify(qa)}${strictJsonRules(requiredKeys)}`), 'Revision editor');
    ensureKeys(repaired, requiredKeys, 'Repaired output');
    finalCandidate = repaired;
    qa = parseObject(await generateText(qaPrompt(finalCandidate)), 'Final QA');
    attempts = 2;
  }

  if (!passedQa(qa, 85)) {
    throw Object.assign(new Error(`QA rejected this generation (score ${scoreOf(qa)}/100). Nothing was saved.`), { status: 422 });
  }

  return { generated: finalCandidate, qa, attempts };
}

async function buildImagePrompt(project: JsonObject, context: string) {
  const required = ['positive_prompt', 'negative_constraints', 'composition', 'character_lock', 'style_lock'];
  const visualBible = JSON.stringify(project.visual_bible || {});
  const initial = parseObject(await generateText(`${context}\n\nROLE: SENIOR BOOK ILLUSTRATION PROMPT DIRECTOR.\nCreate a production image specification for the book cover. Convert canon into a precise visual prompt. Lock recurring character identity, age, species, face, hair/fur, clothing, proportions, props, setting, art medium, palette, lighting, mood, camera/framing, and composition. The image itself must contain no readable title text. Respect the target audience. Do not introduce characters, objects, costumes, or locations that conflict with canon.\n\nVISUAL BIBLE:\n${visualBible}${strictJsonRules(required)}`), 'Image prompter');

  const edited = parseObject(await generateText(`${context}\n\nROLE: SENIOR ILLUSTRATION PROMPT EDITOR.\nAudit and improve this image specification for consistency, renderability, visual hierarchy, cover composition, and identity locking. Remove ambiguity and contradictions. Preserve canon exactly. Return the same schema only.\n\nIMAGE SPECIFICATION:\n${JSON.stringify(initial)}${strictJsonRules(required)}`), 'Image prompt editor');
  ensureKeys(edited, required, 'Image prompt editor output');

  const qaPrompt = (candidate: JsonObject) => `${context}\n\nROLE: VISUAL CONTINUITY QA GATE.\nAudit this image specification before any paid image generation occurs. Check every character and setting detail against the Story Bible and Visual Bible. Check audience suitability, composition, missing identity anchors, contradictory style instructions, accidental readable-text requests, and prompt ambiguity.\n\nIMAGE SPECIFICATION:\n${JSON.stringify(candidate)}\n\nReturn JSON only: {"passed":true,"score":0,"issues":[{"severity":"critical|major|minor","code":"short_code","message":"specific problem","fix":"specific correction"}],"summary":"brief QA summary"}. Passing requires score >= 90 and no critical or major issue.`;

  let finalSpec = edited;
  let qa = parseObject(await generateText(qaPrompt(finalSpec)), 'Image prompt QA');
  let attempts = 1;
  if (!passedQa(qa)) {
    finalSpec = parseObject(await generateText(`${context}\n\nROLE: ILLUSTRATION PROMPT REPAIR EDITOR.\nRepair the rejected image specification using every QA finding. Do not change canon. Return the exact required schema only.\n\nSPECIFICATION:\n${JSON.stringify(finalSpec)}\n\nQA FINDINGS:\n${JSON.stringify(qa)}${strictJsonRules(required)}`), 'Image prompt repair');
    ensureKeys(finalSpec, required, 'Repaired image prompt');
    qa = parseObject(await generateText(qaPrompt(finalSpec)), 'Final image prompt QA');
    attempts = 2;
  }
  if (!passedQa(qa, 85)) throw Object.assign(new Error(`Image prompt QA rejected generation (score ${scoreOf(qa)}/100). No image credits were spent.`), { status: 422 });

  const negative = Array.isArray(finalSpec.negative_constraints) ? finalSpec.negative_constraints.join('; ') : String(finalSpec.negative_constraints || '');
  const prompt = `${String(finalSpec.positive_prompt)}\nComposition: ${String(finalSpec.composition)}\nCharacter identity lock: ${String(finalSpec.character_lock)}\nStyle lock: ${String(finalSpec.style_lock)}\nAvoid: ${negative}\nNo readable text, letters, logos, watermarks, signatures, or typography.`;
  return { prompt, spec: finalSpec, qa, attempts };
}

async function dashboard(request: Request) {
  const { user, db } = await storyContext(request);
  const [{ data: projects, error }, limits] = await Promise.all([
    db.from('projects').select('id,title,project_type,status,cover_image_url,last_qa,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
    getPlanAndUsage(user.id),
  ]);
  if (error) throw error;
  return json({ user: { email: user.email }, projects: projects || [], plan: limits.plan, usage: limits.usage });
}

async function createProject(request: Request) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request);
  const body = await request.json().catch(() => ({}));
  const projectType = ['childrens_book', 'book', 'short_story'].includes(body.project_type) ? body.project_type : '';
  const idea = typeof body.idea === 'string' ? body.idea.trim().slice(0, 12000) : '';
  if (!projectType || !idea) return json({ error: 'Choose a project type and enter your idea.' }, 400);
  const { plan } = await getPlanAndUsage(user.id);
  const { count, error: countError } = await db.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
  if (countError) throw countError;
  if ((count || 0) >= plan.active_project_limit) return json({ error: `Your ${plan.name} plan allows ${plan.active_project_limit} active project${plan.active_project_limit === 1 ? '' : 's'}.` }, 402);
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 180) : 'Untitled Project';
  const { data, error } = await db.from('projects').insert({ user_id: user.id, project_type: projectType, idea, title, target_audience: String(body.target_audience || '').slice(0, 180), tone: String(body.tone || '').slice(0, 180) }).select('*').single();
  if (error) throw error;
  return json({ project: data }, 201);
}

async function getProject(request: Request, id: string) {
  const { user, db } = await storyContext(request);
  const { data, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? json({ project: data }) : json({ error: 'Project not found.' }, 404);
}

async function removeProject(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request);
  const { error } = await db.from('projects').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return json({ ok: true });
}

async function generate(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request);
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const { data: project, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!project) return json({ error: 'Project not found.' }, 404);
  const limits = await getPlanAndUsage(user.id);
  const context = `PROJECT CANON\nType: ${project.project_type}\nTitle: ${project.title}\nIdea: ${project.idea}\nAudience: ${project.target_audience || 'not specified'}\nTone: ${project.tone || 'not specified'}\nStory Bible: ${JSON.stringify(project.story_bible || {})}\nVisual Bible: ${JSON.stringify(project.visual_bible || {})}\nOutline: ${JSON.stringify(project.outline || {})}\nExisting manuscript: ${JSON.stringify(project.manuscript || [])}`;

  if (action === 'cover') {
    if (limits.usage.images >= limits.plan.monthly_image_limit) return json({ error: 'Monthly image limit reached.' }, 402);
    const imagePrompt = await buildImagePrompt(project, context);
    const imageResponse = await generateImage(imagePrompt.prompt);
    const publicUrl = await uploadGeneratedImage(user.id, project.id, imageResponse);
    const qa = qaRecord('cover_prompt', imagePrompt.qa, imagePrompt.attempts, 'image_prompt_editor_qa');
    const history = [...(Array.isArray(project.qa_history) ? project.qa_history : []), qa].slice(-100);
    await db.from('projects').update({ cover_image_url: publicUrl, last_qa: qa, qa_history: history, updated_at: new Date().toISOString() }).eq('id', project.id).eq('user_id', user.id);
    await db.from('usage_events').insert({ user_id: user.id, project_id: project.id, usage_type: 'image', units: 1 });
    return json({ cover_image_url: publicUrl, image_spec: imagePrompt.spec, qa });
  }

  const remainingWords = Math.max(0, limits.plan.monthly_word_limit - limits.usage.words);
  if (remainingWords < 100) return json({ error: 'Monthly writing limit reached.' }, 402);

  let draftPrompt = '';
  let requiredKeys: string[] = [];
  if (action === 'story_bible') {
    requiredKeys = ['title', 'premise', 'audience', 'tone', 'themes', 'characters', 'settings', 'timeline', 'continuity_rules', 'visual_direction'];
    draftPrompt = `${context}\n\nROLE: STORY ARCHITECT. Build the canonical Story Bible before prose generation. Define concrete character identities, motivations, appearance, relationships, setting facts, timeline rules, unresolved constraints, themes, audience guardrails, and continuity rules. Every recurring visual attribute must be stable enough to reuse across illustrations. Do not write the manuscript yet.`;
  } else if (action === 'outline') {
    requiredKeys = project.project_type === 'childrens_book' ? ['title', 'story_arc', 'page_plan'] : project.project_type === 'book' ? ['title', 'story_arc', 'chapters'] : ['title', 'story_arc', 'scenes'];
    draftPrompt = `${context}\n\nROLE: STORY ARCHITECT. Create a production-ready outline that obeys the Story Bible and has a clear beginning, escalation, climax, and resolution. For children's books create an 8-page prototype on the Free plan and a page_plan where every item contains page_number, purpose, text_goal, illustration_goal, continuity_requirements. For standard books use chapters with chapter_number, title, purpose, beats, continuity_requirements. For short stories use scenes with scene_number, purpose, beats, continuity_requirements.`;
  } else if (action === 'next_section') {
    const count = Array.isArray(project.manuscript) ? project.manuscript.length : 0;
    if (limits.plan.id === 'free' && project.project_type === 'childrens_book' && count >= 8) return json({ error: 'Free children’s-book prototypes are limited to 8 pages.' }, 402);
    const maxWords = Math.min(remainingWords, project.project_type === 'childrens_book' ? 130 : project.project_type === 'short_story' ? 900 : 1200);
    requiredKeys = ['title', 'content', 'summary', 'continuity_updates', 'illustration_prompt'];
    draftPrompt = `${context}\n\nROLE: PUBLISHING-QUALITY WRITER. Write only the next ${project.project_type === 'childrens_book' ? 'page' : project.project_type === 'book' ? 'chapter' : 'scene'} in the approved outline. Continue naturally from the existing manuscript. Obey all canon, character identity, timeline, point of view, tone, audience constraints, and unresolved threads. Avoid filler, repetition, generic AI phrasing, sudden exposition dumps, and continuity drift. Keep the content under ${maxWords} words. The summary must state what changed in canon. continuity_updates must contain only genuinely new facts introduced by this section. illustration_prompt should describe the exact visual moment for this section and may be empty only when a visual is inappropriate.`;
  } else {
    return json({ error: 'Unknown generation action.' }, 400);
  }

  const pipeline = await runEditorialPipeline({ action, context, draftPrompt, requiredKeys });
  const generated = pipeline.generated;
  const words = wordCount(typeof generated.content === 'string' ? generated.content : JSON.stringify(generated));
  const chargedWords = Math.max(1, Math.min(words, remainingWords));
  const qa = qaRecord(action, pipeline.qa, pipeline.attempts, 'writer_editor_qa');
  const history = [...(Array.isArray(project.qa_history) ? project.qa_history : []), qa].slice(-100);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), last_qa: qa, qa_history: history };
  if (action === 'story_bible') { update.story_bible = generated; update.visual_bible = generated.visual_direction || project.visual_bible; update.status = 'bible'; }
  if (action === 'outline') { update.outline = generated; update.status = 'outlined'; }
  if (action === 'next_section') { update.manuscript = [...(Array.isArray(project.manuscript) ? project.manuscript : []), generated]; update.status = 'drafting'; }
  const { data: saved, error: saveError } = await db.from('projects').update(update).eq('id', project.id).eq('user_id', user.id).select('*').single();
  if (saveError) throw saveError;
  await db.from('usage_events').insert({ user_id: user.id, project_id: project.id, usage_type: 'words', units: chargedWords });
  return json({ project: saved, generated, words: chargedWords, qa });
}

async function route(request: Request, path: string) {
  const method = request.method.toUpperCase();
  if (path === 'dashboard' && method === 'GET') return dashboard(request);
  if (path === 'projects' && method === 'POST') return createProject(request);
  const match = path.match(/^projects\/([0-9a-f-]{36})(?:\/(generate))?$/i);
  if (match && !match[2] && method === 'GET') return getProject(request, match[1]);
  if (match && !match[2] && method === 'DELETE') return removeProject(request, match[1]);
  if (match && match[2] === 'generate' && method === 'POST') return generate(request, match[1]);
  return json({ error: 'Not found.' }, 404);
}

const handler: APIRoute = async ({ request, params }) => {
  try { return await route(request, params.path || ''); }
  catch (error) { return safeError(error); }
};
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
