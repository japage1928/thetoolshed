const COOKIE = 'ts_admin_access_token';

function authConfig() {
  return {
    url: (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  };
}

export async function hasAdminSession(request: Request): Promise<boolean> {
  const token = request.headers.get('cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const { url, key } = authConfig();
  if (!token || !url || !key) return false;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/is_tool_shed_admin`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${decodeURIComponent(token)}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}
