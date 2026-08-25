import type { APIRoute } from 'astro';
import { getAuthenticatedUser, getUserDb, json, requireUuid, safeError } from '../../../../../lib/video-studio/server';

const allowedHosts = new Set(['files-cdn.x.ai','vidgen.x.ai']);

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Authentication required.' }, 401);
    const db = getUserDb(user.token);
    const generationId = requireUuid(params.id, 'generation');
    const { data, error } = await db
      .from('video_studio_generations')
      .select('id,status,output_payload')
      .eq('id', generationId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'ready') return json({ error: 'Video not available.' }, 404);
    const rawUrl = data.output_payload?.video_url;
    if (typeof rawUrl !== 'string') return json({ error: 'Video asset missing.' }, 404);
    const source = new URL(rawUrl);
    if (source.protocol !== 'https:' || !allowedHosts.has(source.hostname)) return json({ error: 'Video source rejected.' }, 502);
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range) headers.set('range', range);
    const upstream = await fetch(source, { headers, redirect: 'error' });
    if (!upstream.ok && upstream.status !== 206) return json({ error: 'Video source unavailable.' }, 502);
    const responseHeaders = new Headers();
    for (const key of ['content-type','content-length','content-range','accept-ranges']) {
      const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value);
    }
    responseHeaders.set('cache-control','private, no-store');
    responseHeaders.set('x-content-type-options','nosniff');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) { return safeError(error); }
};