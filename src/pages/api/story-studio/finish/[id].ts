import type { APIRoute } from 'astro';
import { assertSameOrigin, generateImage, generateText, getPlanAndUsage, json, parseJsonText, safeError, storyContext, uploadGeneratedImage, wordCount } from '../../../../lib/story-studio/server';

type Obj = Record<string, any>;
const asObj = (value: unknown, label: string) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${label} returned invalid JSON.`), { status: 502 }); return value as Obj; };
const parse = (text: string, label: string) => asObj(parseJsonText(text), label);
const canon = (p: Obj) => `TITLE: ${p.title}\nIDEA: ${p.idea}\nAUDIENCE: ${p.target_audience || 'Ages 4–8'}\nTONE: ${p.tone || 'warm, engaging'}\nSTORY BIBLE: ${JSON.stringify(p.story_bible || {})}\nOUTLINE: ${JSON.stringify(p.outline || {})}`;

async function manuscript(request: Request, id: string) {
  assertSameOrigin(request);
  const { user, db } = await storyContext(request); const limits = await getPlanAndUsage(user.id);
  if (limits.plan.id === 'free') return json({ error: 'Full-book finishing and KDP export are paid features.' }, 402);
  const { data: p, error } = await db.from('projects').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(); if (error) throw error; if (!p) return json({ error: 'Project not found.' }, 404);
  if (p.project_type !== 'childrens_book') return json({ error: 'Publisher-ready finishing currently supports children’s books first.' }, 422);
  const prompt = `${canon(p)}\n\nROLE: SENIOR CHILDREN'S BOOK AUTHOR AND BOOK ARCHITECT. Produce a complete 24-page, 8.5 x 8.5 inch children's book manuscript ready for illustration and page layout. The story must have a clear beginning, escalation, emotional turn, climax, satisfying resolution, and age-appropriate language. Preserve exact recurring character facts. Select exactly 12 pages for full-page illustrations, distributed across the story. Every page must contain page_number, title, content, summary, continuity_updates, illustration_prompt, and illustrate. illustration_prompt must be highly visual when illustrate=true and an empty string when false. Also create metadata for publication.\n\nReturn valid JSON only with exactly this schema: {"pages":[{"page_number":1,"title":"","content":"","summary":"","continuity_updates":[],"illustration_prompt":"","illustrate":true}],"metadata":{"subtitle":"","author":"","description":"","keywords":[],"categories":[],"language":"English","back_cover_copy":""},"production_notes":{"reading_level":"","illustration_count":12,"trim_size":"8.5 x 8.5","page_count":24}}. pages must contain exactly 24 items and exactly 12 must have illustrate=true.`;
  const draft = parse(await generateText(prompt), 'Writer');
  const qa = parse(await generateText(`${canon(p)}\n\nROLE: INDEPENDENT PUBLISHING QA. Audit this proposed 24-page children's book for continuity, plot logic, age fit, repetition, weak endings, unsafe content, page count, and illustration distribution. Return JSON only: {"passed":true,"score":0,"issues":[],"summary":""}. Passing requires exactly 24 pages, exactly 12 illustration pages, score >= 90, and no major continuity issue.\n\nCANDIDATE:${JSON.stringify(draft)}`), 'QA');
  const pages = Array.isArray(draft.pages) ? draft.pages : []; const illustrated = pages.filter((x:any) => x?.illustrate === true).length; const score = Number(qa.score || 0);
  if (pages.length !== 24 || illustrated !== 12 || qa.passed !== true || score < 90) return json({ error: `Publishing QA rejected the full book (score ${score}/100, ${pages.length} pages, ${illustrated} illustration slots). Nothing was saved.`, qa }, 422);
  const words = pages.reduce((n:number, x:any) => n + wordCount(String(x?.content || '')), 0);
  if (limits.usage.words + words > limits.plan.monthly_word_limit) return json({ error: 'This full book would exceed the monthly writing limit for the current plan.' }, 402);
  const { data: saved, error: saveError } = await db.from('projects').update({ manuscript: pages, metadata: draft.metadata || {}, status: 'illustrating', export_status: 'not_ready', updated_at: new Date().toISOString(), last_qa: { action:'full_book', score, passed:true, issues:qa.issues || [], checked_at:new Date().toISOString() } }).eq('id', id).eq('user_id', user.id).select('*').single(); if (saveError) throw saveError;
  await db.from('usage_events').insert({ user_id:user.id, project_id:id, usage_type:'words', units:Math.max(1, words) });
  return json({ project:saved, qa, illustration_pages:pages.filter((x:any)=>x.illustrate).map((x:any)=>x.page_number) });
}

async function illustration(request: Request, id: string) {
  assertSameOrigin(request); const body = await request.json().catch(()=>({})); const pageNumber = Number(body.page_number);
  const { user, db } = await storyContext(request); const limits = await getPlanAndUsage(user.id); if (limits.plan.id === 'free') return json({ error:'Illustrated full-book finishing is a paid feature.' },402);
  if (limits.usage.images >= limits.plan.monthly_image_limit) return json({ error:'Monthly image limit reached.' },402);
  const { data:p, error } = await db.from('projects').select('*').eq('id',id).eq('user_id',user.id).maybeSingle(); if(error) throw error; if(!p) return json({error:'Project not found.'},404);
  const page = (Array.isArray(p.manuscript)?p.manuscript:[]).find((x:any)=>Number(x.page_number)===pageNumber); if(!page || page.illustrate!==true) return json({error:'That page is not an illustration slot.'},422);
  const existing = Array.isArray(p.illustrations)?p.illustrations:[]; if(existing.some((x:any)=>Number(x.page_number)===pageNumber && x.url)) return json({ project:p, skipped:true });
  const specText = await generateText(`${canon(p)}\nVISUAL BIBLE:${JSON.stringify(p.visual_bible || {})}\nPAGE:${JSON.stringify(page)}\n\nROLE: CHILDREN'S BOOK ILLUSTRATION DIRECTOR. Create one precise production prompt for this page. Lock recurring character identity, age/species, face, hair/fur, clothing, proportions, palette, medium, lighting, camera, setting and props. No readable text, letters, logos or watermarks. Return JSON only: {"prompt":"","character_lock":"","style_lock":"","negative":""}.`);
  const spec = parse(specText,'Illustration prompter'); const finalPrompt = `${spec.prompt}\nCharacter lock: ${spec.character_lock}\nStyle lock: ${spec.style_lock}\nAvoid: ${spec.negative}\nNo readable text, letters, logos, watermarks, signatures, or typography.`;
  const image = await generateImage(finalPrompt); const url = await uploadGeneratedImage(user.id,id,image); const illustrations = [...existing.filter((x:any)=>Number(x.page_number)!==pageNumber), { page_number:pageNumber, url, prompt:finalPrompt, created_at:new Date().toISOString() }].sort((a:any,b:any)=>a.page_number-b.page_number);
  const ready = illustrations.filter((x:any)=>x.url).length >= 10; const { data:saved, error:saveError } = await db.from('projects').update({ illustrations, status:ready?'ready_to_export':'illustrating', export_status:ready?'ready':'not_ready', updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',user.id).select('*').single(); if(saveError) throw saveError;
  await db.from('usage_events').insert({user_id:user.id,project_id:id,usage_type:'image',units:1}); return json({project:saved,url,page_number:pageNumber,ready_to_export:ready});
}

const handler: APIRoute = async ({request,params}) => { try { const id=String(params.id||''); const body = request.method==='POST' ? await request.clone().json().catch(()=>({})) : {}; if(body.step==='manuscript') return manuscript(request,id); if(body.step==='illustration') return illustration(request,id); return json({error:'Unknown finishing step.'},400); } catch(e){ return safeError(e); } };
export const POST = handler;
