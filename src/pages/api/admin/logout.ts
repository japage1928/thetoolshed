import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', 'ts_admin_access_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  headers.append('set-cookie', 'ts_admin_access_token=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return new Response(JSON.stringify({ ok: true }), { headers });
};
