import { decryptSecret, getServerDb, getUsableXConnection } from './server';

function messageFromX(data: any, status: number) {
  return data?.detail || data?.title || data?.errors?.[0]?.message || `X API returned HTTP ${status}.`;
}

function isCredentialFailure(status: number, message: string) {
  if (status === 401) return true;
  if (status !== 403) return false;
  return /auth|token|credential|oauth|unauthoriz|access denied|client forbidden/i.test(message);
}

export async function publishToXNormalized(userId: string, content: string) {
  let connection: any;
  try {
    connection = await getUsableXConnection(userId);
  } catch (error) {
    return { ok: false, permanent: true, reconnect: true, code: 'x_reconnect_required', message: (error as Error).message };
  }

  const response = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${decryptSecret(connection.access_token_ciphertext)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: content }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data?.data?.id) return { ok: true, x_post_id: String(data.data.id) };

  const message = messageFromX(data, response.status);
  const reconnect = isCredentialFailure(response.status, message);
  const permanent = reconnect || [400, 403, 404, 409, 422].includes(response.status);

  if (reconnect) {
    const db = getServerDb();
    await db.from('x_connections').update({
      connection_status: 'reconnect_required',
      oauth_relay_ready: false,
      last_error: message,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }

  return {
    ok: false,
    permanent,
    reconnect,
    code: `x_http_${response.status}`,
    message,
    http_status: response.status,
  };
}
