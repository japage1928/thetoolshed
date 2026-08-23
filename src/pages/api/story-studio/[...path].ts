import type { APIRoute } from 'astro';
import { assertSameOrigin, generateImage, generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext, uploadGeneratedImage, wordCount } from '../../../lib/story-studio/server';

async function dashboard(request: Request) {
  const { user, db } = await storyContext(request);
  const [{ data: projects, error }, limits] = await Promise.all([
    db.from('projects').select('id,title,project_type,status,cover_image_url,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
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

  if (action === 'cover') {
    if (limits.usage.images >= limits.plan.monthly_image_limit) return json({ error: 'Monthly image limit reached.' }, 402);
    const visual = JSON.stringify(project.visual_bible || {});
    const prompt = `Create a polished book cover illustration. Project type: ${project.project_type}. Title: ${project.title}. Core idea: ${project.idea}. Audience: ${project.target_audience || 'general'}. Tone: ${project.tone || 'appropriate to the story'}. Visual bible: ${visual}. Do not place readable text in the image. Leave composition space for a title overlay.`;
    const imageResponse = await generateImage(prompt);
    const publicUrl = await uploadGeneratedImage(user.id, project.id, imageResponse);
    await db.from('projects').update({ cover_image_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', project.id).eq('user_id', user.id);
    await db.from('usage_events').insert({ user_id: user.id, project_id: project.id, usage_type: 'image', units: 1 });
    return json({ cover_image_url: publicUrl });
  }

  const remainingWords = Math.max(0, limits.plan.monthly_word_limit - limits.usage.words);
  if (remainingWords < 100) return json({ error: 'Monthly writing limit reached.' }, 402);
  const context = `PROJECT\nType: ${project.project_type}\nTitle: ${project.title}\nIdea: ${project.idea}\nAudience: ${project.target_audience || 'not specified'}\nTone: ${project.tone || 'not specified'}\nStory Bible: ${JSON.stringify(project.story_bible || {})}\nOutline: ${JSON.stringify(project.outline || {})}\nExisting manuscript: ${JSON.stringify(project.manuscript || [])}`;
  let prompt = '';
  if (action === 'story_bible') {
    prompt = `${context}\n\nCreate the canonical Story Bible for this project. Return valid JSON only with keys: title, premise, audience, tone, themes, characters, settings, timeline, continuity_rules, visual_direction. Characters should include appearance and personality. For children's books make the visual_direction detailed enough for consistent illustrations.`;
  } else if (action === 'outline') {
    prompt = `${context}\n\nCreate a production-ready outline. Return valid JSON only. For children's books create an 8-page prototype on the Free plan and include a page_plan array with page_number, purpose, text_goal, illustration_goal. For standard books use chapters with chapter_number, title, purpose, beats. For short stories use scenes.`;
  } else if (action === 'next_section') {
    const count = Array.isArray(project.manuscript) ? project.manuscript.length : 0;
    if (limits.plan.id === 'free' && project.project_type === 'childrens_book' && count >= 8) return json({ error: 'Free children’s-book prototypes are limited to 8 pages.' }, 402);
    const maxWords = Math.min(remainingWords, project.project_type === 'childrens_book' ? 130 : project.project_type === 'short_story' ? 900 : 1200);
    prompt = `${context}\n\nWrite the next ${project.project_type === 'childrens_book' ? 'page' : project.project_type === 'book' ? 'chapter' : 'scene'} only. Continue naturally from the manuscript and obey the Story Bible. Keep it under ${maxWords} words. Return valid JSON only with keys: title, content, summary, continuity_updates, illustration_prompt. illustration_prompt may be empty for non-visual scenes.`;
  } else {
    return json({ error: 'Unknown generation action.' }, 400);
  }

  const text = await generateText(prompt);
  const generated = parseJsonText(text);
  const words = wordCount(typeof generated === 'object' && generated && 'content' in generated ? String((generated as any).content || '') : text);
  const chargedWords = Math.max(1, Math.min(words || wordCount(text), remainingWords));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (action === 'story_bible') { update.story_bible = generated; update.visual_bible = (generated as any)?.visual_direction || project.visual_bible; update.status = 'bible'; }
  if (action === 'outline') { update.outline = generated; update.status = 'outlined'; }
  if (action === 'next_section') { update.manuscript = [...(Array.isArray(project.manuscript) ? project.manuscript : []), generated]; update.status = 'drafting'; }
  const { data: saved, error: saveError } = await db.from('projects').update(update).eq('id', project.id).eq('user_id', user.id).select('*').single();
  if (saveError) throw saveError;
  await db.from('usage_events').insert({ user_id: user.id, project_id: project.id, usage_type: 'words', units: chargedWords });
  return json({ project: saved, generated, words: chargedWords });
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
