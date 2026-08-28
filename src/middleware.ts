import { defineMiddleware } from 'astro:middleware';

const ADMIN_COOKIE = 'ts_admin_access_token';
const SAAS_COOKIE = 'ts_saas_access_token';
const SAAS_REFRESH_COOKIE = 'ts_saas_refresh_token';
const LEGAL_VERSION = '2026-08-24';
const CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.stripe.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.stripe.com https://*.link.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://*.stripe.com https://*.link.com; frame-src 'self' https://*.stripe.com https://*.link.com; media-src 'self' blob: https:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests";

function getCookie(request: Request, name: string) { return request.headers.get('cookie')?.match(new RegExp(`${name}=([^;]+)`))?.[1]; }
function authConfig() { return { url: (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, ''), key: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '' }; }
async function getSupabaseUser(token: string | undefined) { const {url,key}=authConfig(); if(!token||!url||!key)return null; try{const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${decodeURIComponent(token)}`}});if(!r.ok)return null;const u=await r.json();return u?.id&&u?.email?u:null;}catch{return null;} }
async function isAdminToken(token: string | undefined) { const {url,key}=authConfig();if(!token||!url||!key)return false;try{const r=await fetch(`${url}/rest/v1/rpc/is_tool_shed_admin`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${decodeURIComponent(token)}`,'content-type':'application/json'},body:'{}'});return r.ok&&(await r.json())===true;}catch{return false;} }
async function hasCurrentLegalAcceptance(token: string | undefined) { const {url,key}=authConfig();if(!token||!url||!key)return false;const q=new URLSearchParams({select:'id',terms_version:`eq.${LEGAL_VERSION}`,privacy_version:`eq.${LEGAL_VERSION}`,acceptable_use_version:`eq.${LEGAL_VERSION}`,limit:'1'});try{const r=await fetch(`${url}/rest/v1/tool_shed_legal_acceptances?${q}`,{headers:{apikey:key,Authorization:`Bearer ${decodeURIComponent(token)}`}});if(!r.ok)return false;const rows=await r.json();return Array.isArray(rows)&&rows.length>0;}catch{return false;} }
async function refreshSaasSession(request: Request) { const refreshToken=getCookie(request,SAAS_REFRESH_COOKIE);const {url,key}=authConfig();if(!refreshToken||!url||!key)return null;try{const r=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({refresh_token:decodeURIComponent(refreshToken)})});const d=await r.json();if(!r.ok||!d.access_token)return null;return{accessToken:String(d.access_token),refreshToken:String(d.refresh_token||decodeURIComponent(refreshToken)),expiresIn:Math.max(60,Number(d.expires_in||3600))};}catch{return null;} }
function sessionCookie(name:string,value:string,maxAge:number){return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax; HttpOnly`;}
function securityHeaders(response:Response){const values={'Content-Security-Policy':CONTENT_SECURITY_POLICY,'Cross-Origin-Opener-Policy':'same-origin-allow-popups','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(self)','Referrer-Policy':'strict-origin-when-cross-origin','Strict-Transport-Security':'max-age=31536000; includeSubDomains','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};for(const[name,value]of Object.entries(values))if(!response.headers.has(name))response.headers.set(name,value);return response;}
function noStore(response:Response){response.headers.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');response.headers.set('Netlify-CDN-Cache-Control','no-store');response.headers.set('Pragma','no-cache');return securityHeaders(response);}

export const onRequest = defineMiddleware(async ({ request, redirect }, next) => {
  const url=new URL(request.url);
  const isAdmin=url.pathname.startsWith('/admin')&&url.pathname!=='/admin/login';
  const isEvergreenApp=url.pathname.startsWith('/app/evergreen-x');
  const isStoryStudioApp=url.pathname.startsWith('/app/story-studio');
  const isVideoStudioApp=url.pathname.startsWith('/app/video-studio');
  const isRetiredVideoStudioRoute=isVideoStudioApp || url.pathname.startsWith('/video-studio');
  if(isRetiredVideoStudioRoute)return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
  const isSaasApp=isEvergreenApp||isStoryStudioApp||isVideoStudioApp;
  const isAccountPage=url.pathname==='/account'||url.pathname.startsWith('/account/');
  const evergreenLaunched=process.env.EVERGREEN_X_LAUNCH_ENABLED==='true';
  if(!isAdmin&&!isSaasApp&&!isAccountPage)return securityHeaders(await next());
  if(isAdmin&&!(await isAdminToken(getCookie(request,ADMIN_COOKIE))))return noStore(redirect('/admin/login',302));
  if(isAccountPage){const user=await getSupabaseUser(getCookie(request,SAAS_COOKIE));if(!user){const refreshed=await refreshSaasSession(request);if(!refreshed)return noStore(await next());const response=noStore(await next());response.headers.append('Set-Cookie',sessionCookie(SAAS_COOKIE,refreshed.accessToken,refreshed.expiresIn));response.headers.append('Set-Cookie',sessionCookie(SAAS_REFRESH_COOKIE,refreshed.refreshToken,60*60*24*30));return response;}return noStore(await next());}
  if(isSaasApp){
    if(isEvergreenApp&&!evergreenLaunched)return noStore(redirect('/tools/evergreen-x-scheduler?coming_soon=1',302));
    const accessToken=getCookie(request,SAAS_COOKIE);const user=await getSupabaseUser(accessToken);
    if(!user){const refreshed=await refreshSaasSession(request);if(!refreshed){const loginPath=isVideoStudioApp?'/video-studio/login':'/account';return noStore(redirect(`${loginPath}?next=${encodeURIComponent(url.pathname+url.search)}`,302));}const destination=`${url.pathname}${url.search}`;const response=await hasCurrentLegalAcceptance(refreshed.accessToken)?noStore(await next()):noStore(redirect(`/account?legal=1&next=${encodeURIComponent(destination)}`,302));response.headers.append('Set-Cookie',sessionCookie(SAAS_COOKIE,refreshed.accessToken,refreshed.expiresIn));response.headers.append('Set-Cookie',sessionCookie(SAAS_REFRESH_COOKIE,refreshed.refreshToken,60*60*24*30));return response;}
    if(!await hasCurrentLegalAcceptance(accessToken)){const destination=`${url.pathname}${url.search}`;return noStore(redirect(`/account?legal=1&next=${encodeURIComponent(destination)}`,302));}
  }
  return noStore(await next());
});