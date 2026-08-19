import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const source = String(body?.source ?? 'website').trim().slice(0, 80) || 'website';
    const incentive = String(body?.incentive ?? 'free-ai-prompt-pack').trim().slice(0, 120) || 'free-ai-prompt-pack';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return new Response(JSON.stringify({ ok: false, error: 'Enter a valid email address.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Signup is temporarily unavailable.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/email_subscribers`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ email, source, incentive }),
    });

    if (!response.ok) throw new Error(`Supabase subscriber insert failed: ${response.status}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Signup is temporarily unavailable.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
