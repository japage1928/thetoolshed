-- Command Center SaaS operations layer.
-- The dashboard remains read/trigger-only: n8n calls these service-only
-- functions, and browser roles cannot execute them directly.

create table if not exists public.saas_admin_action_log (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  actor_email text not null,
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  product text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists saas_admin_action_log_user_created_idx
  on public.saas_admin_action_log(user_id, created_at desc);
create index if not exists saas_admin_action_log_status_created_idx
  on public.saas_admin_action_log(status, created_at desc);

alter table public.saas_admin_action_log enable row level security;
revoke all on public.saas_admin_action_log from public, anon, authenticated;
grant select, insert, update on public.saas_admin_action_log to service_role;

create or replace function public.saas_admin_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, story_studio, evergreen_saas
as $$
with
video_balance as (
  select user_id, coalesce(sum(amount), 0)::integer as credits
  from public.video_studio_credit_ledger
  group by user_id
),
video_projects as (
  select user_id, count(*)::integer as projects, max(updated_at) as last_activity_at
  from public.video_studio_projects
  group by user_id
),
video_jobs as (
  select user_id,
    count(*)::integer as generations,
    count(*) filter (where status in ('failed', 'error'))::integer as failed,
    coalesce(sum(credits_used), 0)::integer as credits_used,
    coalesce(sum(actual_api_cost), 0)::numeric as actual_cost,
    max(updated_at) as last_activity_at
  from public.video_studio_generations
  group by user_id
),
video_sub_latest as (
  select distinct on (user_id)
    user_id, id, plan, status, stripe_customer_id, stripe_subscription_id,
    renewal_date, cancel_at_period_end, created_at, updated_at
  from public.video_studio_subscriptions
  order by user_id, updated_at desc
),
legal_latest as (
  select distinct on (user_id)
    user_id, terms_version, privacy_version, acceptable_use_version, accepted_at
  from public.tool_shed_legal_acceptances
  order by user_id, accepted_at desc
),
story_projects as (
  select user_id,
    count(*)::integer as projects,
    count(*) filter (where status in ('failed', 'error'))::integer as failed,
    max(updated_at) as last_activity_at
  from story_studio.projects
  group by user_id
),
story_usage as (
  select user_id,
    coalesce(sum(units) filter (where usage_type = 'words'), 0)::integer as words,
    coalesce(sum(units) filter (where usage_type = 'image'), 0)::integer as images
  from story_studio.usage_events
  where created_at >= date_trunc('month', now())
  group by user_id
),
evergreen_sub_latest as (
  select distinct on (user_id)
    user_id, id, plan_id, provider, provider_customer_id, provider_subscription_id,
    status, period_start, period_end, cancel_at_period_end, created_at, updated_at
  from evergreen_saas.subscriptions
  order by user_id, updated_at desc
),
evergreen_posts as (
  select user_id,
    count(*)::integer as posts,
    count(*) filter (where status = 'POSTED')::integer as published,
    count(*) filter (where status = 'FAILED')::integer as failed,
    count(*) filter (where status in ('SCHEDULED', 'QUEUED', 'RESERVED'))::integer as queued,
    max(updated_at) as last_activity_at
  from evergreen_saas.posts
  group by user_id
),
evergreen_usage as (
  select user_id,
    count(*) filter (where usage_type = 'regular')::integer as regular_posts,
    count(*) filter (where usage_type = 'url')::integer as url_posts
  from evergreen_saas.usage_events
  where created_at >= date_trunc('month', now())
  group by user_id
),
customers as (
  select
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    ll.terms_version,
    ll.privacy_version,
    ll.acceptable_use_version,
    ll.accepted_at as legal_accepted_at,
    vp.plan_id as video_profile_plan,
    vp.internal_beta as video_internal_beta,
    coalesce(vb.credits, 0) as video_credits,
    coalesce(vpr.projects, 0) as video_projects,
    coalesce(vj.generations, 0) as video_generations,
    coalesce(vj.failed, 0) as video_failed,
    coalesce(vj.credits_used, 0) as video_credits_used,
    coalesce(vj.actual_cost, 0) as video_actual_cost,
    vs.id as video_subscription_row_id,
    vs.plan as video_subscription_plan,
    vs.status as video_subscription_status,
    vs.stripe_customer_id as video_stripe_customer_id,
    vs.stripe_subscription_id as video_stripe_subscription_id,
    vs.renewal_date as video_renewal_date,
    vs.cancel_at_period_end as video_cancel_at_period_end,
    sp.plan_id as story_plan,
    coalesce(spr.projects, 0) as story_projects,
    coalesce(su.words, 0) as story_words,
    coalesce(su.images, 0) as story_images,
    eu.id is not null as evergreen_enabled,
    es.id as evergreen_subscription_row_id,
    es.plan_id as evergreen_plan,
    es.status as evergreen_subscription_status,
    es.provider as evergreen_provider,
    es.provider_customer_id as evergreen_customer_id,
    es.provider_subscription_id as evergreen_subscription_id,
    es.period_end as evergreen_period_end,
    es.cancel_at_period_end as evergreen_cancel_at_period_end,
    xc.x_username,
    xc.connection_status as x_connection_status,
    xc.oauth_relay_ready,
    ss.scheduler_enabled,
    ss.next_post_at,
    coalesce(ep.posts, 0) as evergreen_posts,
    coalesce(ep.published, 0) as evergreen_published,
    coalesce(ep.failed, 0) as evergreen_failed,
    coalesce(ep.queued, 0) as evergreen_queued,
    coalesce(eu2.regular_posts, 0) as evergreen_regular_usage,
    coalesce(eu2.url_posts, 0) as evergreen_url_usage,
    greatest(vp.updated_at, vpr.last_activity_at, vj.last_activity_at, sp.updated_at, spr.last_activity_at, eu.updated_at, ep.last_activity_at) as product_last_activity_at
  from auth.users u
  left join legal_latest ll on ll.user_id = u.id
  left join public.video_studio_profiles vp on vp.user_id = u.id
  left join video_balance vb on vb.user_id = u.id
  left join video_projects vpr on vpr.user_id = u.id
  left join video_jobs vj on vj.user_id = u.id
  left join video_sub_latest vs on vs.user_id = u.id
  left join story_studio.profiles sp on sp.user_id = u.id
  left join story_projects spr on spr.user_id = u.id
  left join story_usage su on su.user_id = u.id
  left join evergreen_saas.users eu on eu.id = u.id
  left join evergreen_sub_latest es on es.user_id = u.id
  left join evergreen_saas.x_connections xc on xc.user_id = u.id
  left join evergreen_saas.scheduler_settings ss on ss.user_id = u.id
  left join evergreen_posts ep on ep.user_id = u.id
  left join evergreen_usage eu2 on eu2.user_id = u.id
),
subscription_rows as (
  select
    'video:' || s.id::text as id,
    'video_studio'::text as product,
    s.user_id,
    u.email,
    s.plan as plan_id,
    coalesce(p.name, initcap(replace(s.plan, '_', ' '))) as plan_name,
    coalesce(p.price_cents, 0) as price_cents,
    s.status,
    'stripe'::text as provider,
    s.stripe_customer_id as customer_id,
    s.stripe_subscription_id as subscription_id,
    null::timestamptz as period_start,
    s.renewal_date as period_end,
    s.cancel_at_period_end,
    s.created_at,
    s.updated_at
  from public.video_studio_subscriptions s
  join auth.users u on u.id = s.user_id
  left join public.video_studio_plans p on p.id = s.plan
  union all
  select
    'evergreen:' || s.id::text,
    'evergreen_x',
    s.user_id,
    u.email,
    s.plan_id,
    coalesce(p.name, initcap(replace(s.plan_id, '_', ' '))),
    coalesce(p.price_cents, 0),
    s.status,
    coalesce(s.provider, 'stripe'),
    s.provider_customer_id,
    s.provider_subscription_id,
    s.period_start,
    s.period_end,
    s.cancel_at_period_end,
    s.created_at,
    s.updated_at
  from evergreen_saas.subscriptions s
  join auth.users u on u.id = s.user_id
  left join evergreen_saas.plans p on p.id = s.plan_id
  union all
  select
    'story:' || p.user_id::text,
    'story_studio',
    p.user_id,
    p.email,
    p.plan_id,
    coalesce(pl.name, initcap(replace(p.plan_id, '_', ' '))),
    coalesce(pl.price_cents, 0),
    case when p.plan_id = 'free' then 'free' else 'active' end,
    'entitlement',
    null,
    null,
    null,
    null,
    false,
    p.created_at,
    p.updated_at
  from story_studio.profiles p
  left join story_studio.plans pl on pl.id = p.plan_id
),
activity_rows as (
  select 'video_studio'::text as product, g.user_id, 'generation'::text as event_type,
    g.status, coalesce(p.title, 'Video generation') as title, g.updated_at as happened_at,
    jsonb_build_object('generation_id', g.id, 'credits_used', g.credits_used, 'actual_cost', g.actual_api_cost, 'error', g.error) as detail
  from public.video_studio_generations g
  left join public.video_studio_projects p on p.id = g.project_id
  union all
  select 'story_studio', p.user_id, 'project', p.status, p.title, p.updated_at,
    jsonb_build_object('project_id', p.id, 'project_type', p.project_type, 'export_status', p.export_status)
  from story_studio.projects p
  union all
  select 'evergreen_x', p.user_id, 'post', lower(p.status), left(p.content, 120), p.updated_at,
    jsonb_build_object('post_id', p.id, 'scheduled_at', p.scheduled_at, 'posted_at', p.posted_at, 'error', p.last_error)
  from evergreen_saas.posts p
),
tool_rows as (
  select jsonb_build_array(
    jsonb_build_object(
      'key', 'video_studio', 'name', 'Video Studio',
      'status', case when exists(select 1 from public.video_studio_daily_spend where paused) then 'paused'
                     when exists(select 1 from public.video_studio_generations where status in ('failed','error')) then 'attention' else 'operational' end,
      'users', (select count(*) from public.video_studio_profiles),
      'active_subscriptions', (select count(*) from public.video_studio_subscriptions where status in ('active','trialing')),
      'projects', (select count(*) from public.video_studio_projects),
      'operations', (select count(*) from public.video_studio_generations),
      'failed', (select count(*) from public.video_studio_generations where status in ('failed','error')),
      'usage_primary', (select coalesce(sum(credits_used),0) from public.video_studio_generations),
      'usage_label', 'credits used',
      'cost', (select coalesce(sum(actual_api_cost),0) from public.video_studio_generations),
      'liability', (select coalesce(sum(amount),0) from public.video_studio_credit_ledger)
    ),
    jsonb_build_object(
      'key', 'story_studio', 'name', 'Story Studio', 'status', 'operational',
      'users', (select count(*) from story_studio.profiles),
      'active_subscriptions', (select count(*) from story_studio.profiles where plan_id <> 'free'),
      'projects', (select count(*) from story_studio.projects),
      'operations', (select count(*) from story_studio.usage_events),
      'failed', (select count(*) from story_studio.projects where status in ('failed','error')),
      'usage_primary', (select coalesce(sum(units),0) from story_studio.usage_events where usage_type='words' and created_at >= date_trunc('month',now())),
      'usage_label', 'words this month', 'cost', 0, 'liability', 0
    ),
    jsonb_build_object(
      'key', 'evergreen_x', 'name', 'Evergreen X',
      'status', case when exists(select 1 from evergreen_saas.x_connections where connection_status='reconnect_required' or not oauth_relay_ready) then 'attention'
                     when exists(select 1 from evergreen_saas.posts where status='FAILED') then 'attention' else 'operational' end,
      'users', (select count(*) from evergreen_saas.users),
      'active_subscriptions', (select count(*) from evergreen_saas.subscriptions where status in ('active','trialing')),
      'projects', (select count(*) from evergreen_saas.scheduler_settings where scheduler_enabled),
      'operations', (select count(*) from evergreen_saas.posts),
      'failed', (select count(*) from evergreen_saas.posts where status='FAILED'),
      'usage_primary', (select count(*) from evergreen_saas.posts where status='POSTED'),
      'usage_label', 'posts published', 'cost', 0, 'liability', 0
    )
  ) as data
)
select jsonb_build_object(
  'ok', true,
  'generated_at', now(),
  'overview', jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'verified_users', (select count(*) from auth.users where email_confirmed_at is not null),
    'signed_in_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'suspended_users', (select count(*) from auth.users where banned_until > now()),
    'active_subscriptions', (select count(*) from subscription_rows where status in ('active','trialing')),
    'trials', (select count(*) from subscription_rows where status='trialing'),
    'past_due', (select count(*) from subscription_rows where status in ('past_due','unpaid','incomplete')),
    'canceling', (select count(*) from subscription_rows where cancel_at_period_end),
    'mrr_cents', (select coalesce(sum(price_cents),0) from subscription_rows where status in ('active','trialing')),
    'product_users', (select count(*) from customers where video_profile_plan is not null or story_plan is not null or evergreen_enabled),
    'failed_operations', (select coalesce(sum(video_failed + evergreen_failed),0) from customers),
    'legal_acceptances', (select count(*) from customers where legal_accepted_at is not null)
  ),
  'tools', (select data from tool_rows),
  'customers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'email', c.email,
      'created_at', c.created_at,
      'last_sign_in_at', c.last_sign_in_at,
      'email_verified', c.email_confirmed_at is not null,
      'banned_until', c.banned_until,
      'status', case when c.banned_until > now() then 'suspended' else 'active' end,
      'legal', jsonb_build_object('accepted_at', c.legal_accepted_at, 'terms', c.terms_version, 'privacy', c.privacy_version, 'acceptable_use', c.acceptable_use_version),
      'product_last_activity_at', c.product_last_activity_at,
      'products', jsonb_build_object(
        'video_studio', jsonb_build_object(
          'enabled', c.video_profile_plan is not null,
          'profile_plan', c.video_profile_plan,
          'internal_beta', coalesce(c.video_internal_beta,false),
          'credits', c.video_credits,
          'credits_used', c.video_credits_used,
          'projects', c.video_projects,
          'generations', c.video_generations,
          'failed', c.video_failed,
          'actual_cost', c.video_actual_cost,
          'subscription_row_id', c.video_subscription_row_id,
          'subscription_plan', c.video_subscription_plan,
          'subscription_status', coalesce(c.video_subscription_status,'none'),
          'stripe_customer_id', c.video_stripe_customer_id,
          'stripe_subscription_id', c.video_stripe_subscription_id,
          'renewal_date', c.video_renewal_date,
          'cancel_at_period_end', coalesce(c.video_cancel_at_period_end,false)
        ),
        'story_studio', jsonb_build_object(
          'enabled', c.story_plan is not null,
          'plan', c.story_plan,
          'projects', c.story_projects,
          'words_this_month', c.story_words,
          'images_this_month', c.story_images
        ),
        'evergreen_x', jsonb_build_object(
          'enabled', c.evergreen_enabled,
          'plan', c.evergreen_plan,
          'subscription_status', coalesce(c.evergreen_subscription_status,'none'),
          'provider', c.evergreen_provider,
          'customer_id', c.evergreen_customer_id,
          'subscription_id', c.evergreen_subscription_id,
          'period_end', c.evergreen_period_end,
          'cancel_at_period_end', coalesce(c.evergreen_cancel_at_period_end,false),
          'x_username', c.x_username,
          'connection_status', coalesce(c.x_connection_status,'disconnected'),
          'oauth_ready', coalesce(c.oauth_relay_ready,false),
          'scheduler_enabled', coalesce(c.scheduler_enabled,false),
          'next_post_at', c.next_post_at,
          'posts', c.evergreen_posts,
          'published', c.evergreen_published,
          'failed', c.evergreen_failed,
          'queued', c.evergreen_queued,
          'regular_usage', c.evergreen_regular_usage,
          'url_usage', c.evergreen_url_usage
        )
      )
    ) order by c.created_at desc)
    from customers c
  ), '[]'::jsonb),
  'subscriptions', coalesce((select jsonb_agg(to_jsonb(s) order by s.updated_at desc) from subscription_rows s), '[]'::jsonb),
  'plans', jsonb_build_object(
    'video_studio', coalesce((select jsonb_agg(to_jsonb(p) order by p.price_cents) from public.video_studio_plans p), '[]'::jsonb),
    'story_studio', coalesce((select jsonb_agg(to_jsonb(p) order by p.price_cents) from story_studio.plans p), '[]'::jsonb),
    'evergreen_x', coalesce((select jsonb_agg(to_jsonb(p) order by p.price_cents nulls first) from evergreen_saas.plans p), '[]'::jsonb)
  ),
  'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.happened_at desc) from (select * from activity_rows order by happened_at desc limit 100) a), '[]'::jsonb),
  'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select id,request_id,actor_email,action,user_id,product,status,reason,payload,result,created_at,completed_at from public.saas_admin_action_log order by created_at desc limit 100) l), '[]'::jsonb),
  'alerts', coalesce((
    select jsonb_agg(alert order by priority, created_at desc) from (
      select 1 as priority, s.updated_at as created_at,
        jsonb_build_object('type','billing','severity','critical','title','Subscription requires attention','detail',s.email || ' · ' || s.product || ' · ' || s.status,'user_id',s.user_id,'product',s.product) as alert
      from subscription_rows s where s.status in ('past_due','unpaid','incomplete')
      union all
      select 2, now(), jsonb_build_object('type','connection','severity','warning','title','X account needs reconnect','detail',coalesce(u.email,'Unknown customer'),'user_id',x.user_id,'product','evergreen_x')
      from evergreen_saas.x_connections x join auth.users u on u.id=x.user_id
      where x.connection_status='reconnect_required' or not x.oauth_relay_ready
      union all
      select 2, g.updated_at, jsonb_build_object('type','generation','severity','warning','title','Video generation failed','detail',coalesce(g.error,'No error detail'),'user_id',g.user_id,'product','video_studio')
      from public.video_studio_generations g where g.status in ('failed','error')
      union all
      select 2, p.updated_at, jsonb_build_object('type','publishing','severity','warning','title','Evergreen post failed','detail',coalesce(p.last_error,left(p.content,100)),'user_id',p.user_id,'product','evergreen_x')
      from evergreen_saas.posts p where p.status='FAILED'
      union all
      select 1, d.updated_at, jsonb_build_object('type','spend','severity','critical','title','Video generation spend is paused','detail',coalesce(d.pause_reason,'Daily spend control is paused'),'user_id',null,'product','video_studio')
      from public.video_studio_daily_spend d where d.paused
    ) alerts
  ), '[]'::jsonb)
);
$$;

create or replace function public.saas_admin_apply_action(
  p_request_id text,
  p_actor_email text,
  p_action text,
  p_user_id uuid,
  p_product text,
  p_reason text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, story_studio, evergreen_saas
as $$
declare
  v_log_id uuid;
  v_existing record;
  v_user_email text;
  v_amount integer;
  v_plan text;
  v_result jsonb;
begin
  if coalesce(length(trim(p_request_id)), 0) < 12 then
    raise exception 'A durable request id is required.';
  end if;
  if coalesce(length(trim(p_actor_email)), 0) < 3 then
    raise exception 'The acting administrator is required.';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A reason of at least 5 characters is required.';
  end if;
  if p_action not in ('grant_video_credits','set_story_plan','pause_evergreen_scheduler','resume_evergreen_scheduler','disconnect_evergreen_x','enable_video_beta','disable_video_beta') then
    raise exception 'Unsupported SaaS admin action.';
  end if;

  select email into v_user_email from auth.users where id = p_user_id;
  if v_user_email is null then raise exception 'Customer account was not found.'; end if;

  insert into public.saas_admin_action_log(request_id,actor_email,action,user_id,product,reason,payload)
  values (trim(p_request_id),lower(trim(p_actor_email)),p_action,p_user_id,p_product,trim(p_reason),coalesce(p_payload,'{}'::jsonb))
  on conflict (request_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.saas_admin_action_log where request_id = trim(p_request_id);
    return jsonb_build_object('ok',v_existing.status='completed','duplicate',true,'status',v_existing.status,'result',v_existing.result,'request_id',v_existing.request_id);
  end if;

  begin
    case p_action
      when 'grant_video_credits' then
        if coalesce(p_payload->>'amount','') !~ '^[0-9]+$' then raise exception 'Credit amount must be a whole number.'; end if;
        v_amount := (p_payload->>'amount')::integer;
        if v_amount < 1 or v_amount > 10000 then raise exception 'Credit amount must be between 1 and 10000.'; end if;
        insert into public.video_studio_profiles(user_id) values (p_user_id) on conflict (user_id) do nothing;
        insert into public.video_studio_credit_ledger(user_id,amount,transaction_type,idempotency_key,metadata)
        values (p_user_id,v_amount,'manual_adjustment','admin:' || trim(p_request_id),jsonb_build_object('actor',lower(trim(p_actor_email)),'reason',trim(p_reason),'source','command_center'));
        v_result := jsonb_build_object('message','Video credits granted.','credits',v_amount);

      when 'set_story_plan' then
        v_plan := lower(trim(coalesce(p_payload->>'plan_id','')));
        if not exists(select 1 from story_studio.plans where id=v_plan) then raise exception 'Story Studio plan was not found.'; end if;
        insert into story_studio.profiles(user_id,email,plan_id,updated_at)
        values (p_user_id,v_user_email,v_plan,now())
        on conflict (user_id) do update set email=excluded.email,plan_id=excluded.plan_id,updated_at=now();
        v_result := jsonb_build_object('message','Story Studio plan updated.','plan_id',v_plan);

      when 'pause_evergreen_scheduler' then
        insert into evergreen_saas.users(id,email,updated_at) values (p_user_id,v_user_email,now())
        on conflict (id) do update set email=excluded.email,updated_at=now();
        insert into evergreen_saas.scheduler_settings(user_id,scheduler_enabled,updated_at)
        values (p_user_id,false,now())
        on conflict (user_id) do update set scheduler_enabled=false,reservation_token=null,reservation_expires_at=null,updated_at=now();
        v_result := jsonb_build_object('message','Evergreen X scheduler paused.');

      when 'resume_evergreen_scheduler' then
        insert into evergreen_saas.users(id,email,updated_at) values (p_user_id,v_user_email,now())
        on conflict (id) do update set email=excluded.email,updated_at=now();
        insert into evergreen_saas.scheduler_settings(user_id,scheduler_enabled,updated_at)
        values (p_user_id,true,now())
        on conflict (user_id) do update set scheduler_enabled=true,updated_at=now();
        v_result := jsonb_build_object('message','Evergreen X scheduler resumed.');

      when 'disconnect_evergreen_x' then
        update evergreen_saas.x_connections set
          x_user_id=null,x_username=null,access_token_ciphertext=null,refresh_token_ciphertext=null,
          token_expires_at=null,scopes=null,connection_status='disconnected',last_error=null,
          connected_at=null,token_handle=null,oauth_relay_ready=false,updated_at=now()
        where user_id=p_user_id;
        v_result := jsonb_build_object('message','Evergreen X account disconnected.');

      when 'enable_video_beta' then
        insert into public.video_studio_profiles(user_id,internal_beta,plan_id,updated_at)
        values (p_user_id,true,'internal_beta',now())
        on conflict (user_id) do update set internal_beta=true,plan_id='internal_beta',updated_at=now();
        v_result := jsonb_build_object('message','Video Studio beta access enabled.');

      when 'disable_video_beta' then
        update public.video_studio_profiles set internal_beta=false,updated_at=now() where user_id=p_user_id;
        v_result := jsonb_build_object('message','Video Studio beta access disabled.');
    end case;
  exception when others then
    update public.saas_admin_action_log
    set status='failed',result=jsonb_build_object('error',sqlerrm),completed_at=now()
    where id=v_log_id;
    return jsonb_build_object('ok',false,'request_id',p_request_id,'error',sqlerrm);
  end;

  update public.saas_admin_action_log
  set status='completed',result=v_result,completed_at=now()
  where id=v_log_id;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'result',v_result);
end;
$$;

revoke all on function public.saas_admin_snapshot() from public, anon, authenticated;
revoke all on function public.saas_admin_apply_action(text,text,text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.saas_admin_snapshot() to service_role;
grant execute on function public.saas_admin_apply_action(text,text,text,uuid,text,text,jsonb) to service_role;
