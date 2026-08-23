import type { APIRoute } from 'astro';
import { assertSameOrigin, json, safeError, storyContext } from '../../../lib/story-studio/server';

const TEST_WEBHOOK = 'https://japage628.app.n8n.cloud/webhook/tool-shed-story-studio-run-test-book-7g4mY2qP9vL6sR1x';

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const { user } = await storyContext(request);
    const configured = String(process.env.STORY_STUDIO_ADMIN_EMAIL || '').trim();
    if (!configured) return json({ error: 'Story Studio admin email is not configured. Set STORY_STUDIO_ADMIN_EMAIL before running the test book.' }, 503);
    const adminEmail = configured.toLowerCase();
    if (String(user.email || '').toLowerCase() !== adminEmail) return json({ error: 'Admin access required.' }, 403);
    const response = await fetch(TEST_WEBHOOK, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ source:'story-studio-dashboard', admin_email:configured, requested_at:new Date().toISOString() }) });
    if (!response.ok) return json({ error:`Test workflow failed to start (${response.status}).` }, 502);
    return json({ ok:true, message:'Test book generated and emailed to the configured Story Studio admin inbox.' });
  } catch (e) { return safeError(e); }
};
