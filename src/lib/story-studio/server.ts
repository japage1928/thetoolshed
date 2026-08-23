import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '../evergreen-x/server';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403 });
  }
}

export function safeError(error: unknown) {
  const err = error as Error & { status?: number };
  return json({ error: err?.message || 'Unexpected server error.' }, err?.status || 500);
}

function baseClient() {
  const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Story Studio database credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function storyDb() {
  return baseClient().schema('story_studio');
}

export async function storyContext(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const db = storyDb();
  const { error } = await db.from('profiles').upsert({
    user_id: user.id,
    email: user.email,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return { user, db };
}

export async function getPlanAndUsage(userId: string) {
  const db = storyDb();
  const { data: profile, error: profileError } = await db.from('profiles').select('plan_id').eq('user_id', userId).single();
  if (profileError) throw profileError;
  const { data: plan, error: planError } = await db.from('plans').select('*').eq('id', profile.plan_id).single();
  if (planError) throw planError;
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data: usage, error: usageError } = await db.from('usage_events').select('usage_type,units').eq('user_id', userId).gte('created_at', start.toISOString());
  if (usageError) throw usageError;
  const words = (usage || []).filter((r) => r.usage_type === 'words').reduce((sum, r) => sum + Number(r.units || 0), 0);
  const images = (usage || []).filter((r) => r.usage_type === 'image').reduce((sum, r) => sum + Number(r.units || 0), 0);
  return { plan, usage: { words, images } };
}

function findText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  for (const key of ['output_text', 'text', 'content', 'output', 'response', 'message']) {
    const found = findText(obj[key]);
    if (found) return found;
  }
  for (const child of Object.values(obj)) {
    if (Array.isArray(child)) {
      for (const item of child) { const found = findText(item); if (found) return found; }
    }
  }
  return null;
}

export async function generateText(prompt: string) {
  const url = process.env.STORY_STUDIO_TEXT_WEBHOOK_URL;
  if (!url) throw Object.assign(new Error('Story Studio text engine is not configured.'), { status: 503 });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error(`Writing engine failed (${response.status}).`), { status: 502 });
  let parsed: unknown = raw;
  try { parsed = JSON.parse(raw); } catch { /* plain text is valid */ }
  const text = findText(parsed) || raw.trim();
  if (!text) throw Object.assign(new Error('Writing engine returned an empty response.'), { status: 502 });
  return text;
}

export async function generateImage(prompt: string) {
  const url = process.env.STORY_STUDIO_IMAGE_WEBHOOK_URL;
  if (!url) throw Object.assign(new Error('Story Studio image engine is not configured.'), { status: 503 });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
  if (!response.ok) throw Object.assign(new Error(`Image engine failed (${response.status}).`), { status: 502 });
  return response;
}

export async function uploadGeneratedImage(userId: string, projectId: string, response: Response) {
  const type = response.headers.get('content-type') || 'image/png';
  const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const client = baseClient();
  const { error } = await client.storage.from('story-studio-images').upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw error;
  return client.storage.from('story-studio-images').getPublicUrl(path).data.publicUrl;
}

export function parseJsonText(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { return { raw: text }; }
}

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
