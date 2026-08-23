import type { APIRoute } from 'astro';
import {
  assertSameOrigin,
  decryptSecret,
  ensureSaasUser,
  getAuthenticatedUser,
  json,
  markXDisconnected,
  safeError,
  xOAuthConfig,
} from '../../../../lib/evergreen-x/server';

async function revoke(token: string) {
  const cfg = xOAuthConfig();
  const body = new URLSearchParams({ token, client_id: cfg.clientId });
  const authorization = cfg.clientSecret ? `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}` : undefined;
  await fetch('https://api.x.com/2/oauth2/revoke', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(authorization ? { authorization } : {}),
    },
    body,
  }).catch(() => null);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Authentication required.' }, 401);
    const db = await ensureSaasUser(user);
    const { data, error } = await db.from('x_connections')
      .select('access_token_ciphertext,refresh_token_ciphertext')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    if (data?.refresh_token_ciphertext) await revoke(decryptSecret(data.refresh_token_ciphertext));
    if (data?.access_token_ciphertext) await revoke(decryptSecret(data.access_token_ciphertext));
    await markXDisconnected(user.id);
    return json({ ok: true });
  } catch (error) {
    return safeError(error);
  }
};
