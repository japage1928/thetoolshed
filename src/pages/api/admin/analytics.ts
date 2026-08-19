import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createSign } from 'node:crypto';

const COOKIE = 'ts_admin_access_token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
function base64url(value: string | Buffer) { return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
async function getGoogleAccessToken() {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('GA4 service account credentials are not configured.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned);
  const jwt = `${unsigned}.${base64url(signer.sign(privateKey))}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!tokenResponse.ok) throw new Error(`Google token request failed: ${tokenResponse.status}`);
  return (await tokenResponse.json()).access_token as string;
}
async function runReport(accessToken: string, propertyId: string, body: Record<string, unknown>) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`GA4 report failed: ${response.status} ${await response.text()}`);
  return response.json();
}
export const GET: APIRoute = async ({ request }) => {
  try {
    const token = request.headers.get('cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!token || !supabaseUrl || !supabaseKey) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(decodeURIComponent(token));
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) return json({ configured: false, error: 'GA4_PROPERTY_ID is not configured.' }, 503);
    const googleToken = await getGoogleAccessToken();
    const dateRanges = [{ startDate: '28daysAgo', endDate: 'today' }];
    const overview = await runReport(googleToken, propertyId, { dateRanges, metrics: [{ name: 'activeUsers' }, { name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'eventCount' }] });
    const pages = await runReport(googleToken, propertyId, { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 });
    const channels = await runReport(googleToken, propertyId, { dateRanges, dimensions: [{ name: 'defaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 });
    const metricValues = overview.rows?.[0]?.metricValues?.map((x: { value?: string }) => Number(x.value || 0)) || [];
    return json({ configured: true, measurementId: 'G-3CCH0VWGCF', range: 'Last 28 days', overview: { activeUsers: metricValues[0] || 0, totalUsers: metricValues[1] || 0, sessions: metricValues[2] || 0, pageViews: metricValues[3] || 0, events: metricValues[4] || 0 }, pages: (pages.rows || []).map((row: any) => ({ path: row.dimensionValues?.[0]?.value || '/', views: Number(row.metricValues?.[0]?.value || 0), users: Number(row.metricValues?.[1]?.value || 0) })), channels: (channels.rows || []).map((row: any) => ({ channel: row.dimensionValues?.[0]?.value || 'Unknown', sessions: Number(row.metricValues?.[0]?.value || 0), users: Number(row.metricValues?.[1]?.value || 0) })), generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('GA4 admin report error', error);
    return json({ configured: true, error: error instanceof Error ? error.message : 'Unable to load GA4 data.' }, 500);
  }
};
