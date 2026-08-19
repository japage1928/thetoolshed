import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => new Response(JSON.stringify({ ok: true }), {
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': 'ts_admin_access_token=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  },
});
