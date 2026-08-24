-- Video Studio internal-beta foundation for the existing Tool Shed Supabase project.
-- Billing and paid generation remain disabled by Netlify feature flags.

create table if not exists public.video_studio_plans (
  id text primary key,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  monthly_credits integer not null check (monthly_credits >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.video_studio_plans (id, name, price_cents, monthly_credits, active) values
  ('internal_beta', 'Internal Beta', 0, 0, true),
  ('starter', 'Starter', 2000, 60, false),
  ('creator', 'Creator', 4000, 140, false)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  monthly_credits = excluded.monthly_credits,
  active = excluded.active,
  updated_at = now();

create table if not exists public.video_studio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan_id text not null default 'internal_beta' references public.video_studio_plans(id),
  internal_beta boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  source_type text not null check (source_type in ('url', 'brief')),
  source_url text,
  creative_brief text,
  objective text not null default 'Create qualified product interest',
  platform text not null default 'TikTok / Reels / Shorts',
  aspect_ratio text not null default '9:16' check (aspect_ratio in ('9:16', '1:1', '16:9')),
  duration_seconds integer not null default 30 check (duration_seconds in (15, 30, 45, 60)),
  resolution text not null default '480p' check (resolution in ('480p', '720p', '1080p')),
  status text not null default 'draft' check (status in ('draft', 'planning', 'generating', 'repairing', 'ready', 'failed', 'archived')),
  brand_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'url' and source_url ~* '^https://[^[:space:]]+$' and length(source_url) <= 2048 and creative_brief is null)
    or (source_type = 'brief' and length(btrim(creative_brief)) between 12 and 4000 and source_url is null)
  )
);
create index if not exists video_studio_projects_user_updated_idx
  on public.video_studio_projects(user_id, updated_at desc);

create table if not exists public.video_studio_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_studio_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null,
  provider text not null default 'unassigned',
  model text not null default 'auto',
  duration_seconds integer not null check (duration_seconds between 6 and 120),
  resolution text not null check (resolution in ('480p', '720p', '1080p')),
  credits_reserved integer not null default 0 check (credits_reserved >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  estimated_api_cost numeric(12,4) not null default 0 check (estimated_api_cost >= 0),
  actual_api_cost numeric(12,4) not null default 0 check (actual_api_cost >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'queued', 'planning', 'generating', 'qa', 'repairing', 'ready', 'failed', 'canceled')),
  workflow_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_key)
);
create index if not exists video_studio_generations_project_created_idx
  on public.video_studio_generations(project_id, created_at desc);
create index if not exists video_studio_generations_status_created_idx
  on public.video_studio_generations(status, created_at);

create table if not exists public.video_studio_generation_scenes (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.video_studio_generations(id) on delete cascade,
  scene_number integer not null check (scene_number > 0),
  provider text,
  model text,
  prompt jsonb not null default '{}'::jsonb,
  qa_result jsonb not null default '{}'::jsonb,
  repair_count integer not null default 0 check (repair_count >= 0),
  status text not null default 'planned' check (status in ('planned', 'generating', 'qa', 'repairing', 'approved', 'failed')),
  credits_used integer not null default 0 check (credits_used >= 0),
  actual_api_cost numeric(12,4) not null default 0 check (actual_api_cost >= 0),
  asset_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generation_id, scene_number)
);

create table if not exists public.video_studio_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'internal_beta' references public.video_studio_plans(id),
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  renewal_date timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_studio_subscriptions_user_idx
  on public.video_studio_subscriptions(user_id, updated_at desc);

create table if not exists public.video_studio_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  transaction_type text not null check (transaction_type in (
    'internal_beta_grant', 'paid_trial', 'subscription_renewal', 'credit_pack',
    'referral_reward', 'generation_reservation', 'generation_refund', 'manual_adjustment'
  )),
  generation_id uuid references public.video_studio_generations(id) on delete set null,
  payment_id text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists video_studio_credit_ledger_user_created_idx
  on public.video_studio_credit_ledger(user_id, created_at desc);

create table if not exists public.video_studio_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text not null,
  tone text,
  logo_url text,
  colors jsonb not null default '[]'::jsonb,
  default_links jsonb not null default '{}'::jsonb,
  preferred_platforms text[] not null default '{}',
  affiliate_disclosure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_studio_brand_profiles_user_idx
  on public.video_studio_brand_profiles(user_id, updated_at desc);

alter table public.video_studio_projects
  drop constraint if exists video_studio_projects_brand_profile_id_fkey;
alter table public.video_studio_projects
  add constraint video_studio_projects_brand_profile_id_fkey
  foreign key (brand_profile_id) references public.video_studio_brand_profiles(id) on delete set null;

create table if not exists public.video_studio_stripe_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.video_studio_daily_spend (
  spend_date date primary key,
  estimated_cost numeric(12,4) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(12,4) not null default 0 check (actual_cost >= 0),
  generation_count integer not null default 0 check (generation_count >= 0),
  paused boolean not null default false,
  pause_reason text,
  updated_at timestamptz not null default now()
);

create or replace function public.video_studio_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'video_studio_plans', 'video_studio_profiles', 'video_studio_projects',
    'video_studio_generations', 'video_studio_generation_scenes',
    'video_studio_subscriptions', 'video_studio_brand_profiles', 'video_studio_daily_spend'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.video_studio_touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  end loop;
end;
$$;

create or replace function public.video_studio_reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'video_studio_credit_ledger is append-only; insert a correcting transaction instead';
end;
$$;

drop trigger if exists video_studio_credit_ledger_immutable on public.video_studio_credit_ledger;
create trigger video_studio_credit_ledger_immutable
before update or delete on public.video_studio_credit_ledger
for each row execute function public.video_studio_reject_ledger_mutation();

create or replace function public.video_studio_bootstrap_profile()
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  insert into public.video_studio_profiles(user_id, display_name)
  select current_user_id, nullif(raw_user_meta_data->>'full_name', '')
  from auth.users where id = current_user_id
  on conflict (user_id) do nothing;
  return current_user_id;
end;
$$;

create or replace function public.video_studio_credit_balance()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount), 0)::bigint
  from public.video_studio_credit_ledger
  where user_id = auth.uid();
$$;

create or replace function public.video_studio_reserve_generation(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text,
  p_estimated_credits integer,
  p_duration_seconds integer,
  p_resolution text,
  p_estimated_api_cost numeric,
  p_max_daily_spend numeric
)
returns table(generation_id uuid, reserved boolean, credits integer, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare existing_id uuid;
declare created_id uuid;
declare available bigint;
declare daily_estimate numeric(12,4);
declare daily_paused boolean;
begin
  if p_estimated_credits <= 0 then raise exception 'estimated credits must be positive'; end if;
  if p_estimated_api_cost <= 0 then raise exception 'estimated API cost must be positive'; end if;
  if p_max_daily_spend <= 0 then raise exception 'daily spend limit must be positive'; end if;
  if p_resolution not in ('480p', '720p', '1080p') then raise exception 'invalid resolution'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select id into existing_id from public.video_studio_generations
  where user_id = p_user_id and request_key = p_request_key;
  if existing_id is not null then
    return query select existing_id, false, p_estimated_credits, 'duplicate'::text;
    return;
  end if;

  if not exists (
    select 1 from public.video_studio_projects
    where id = p_project_id and user_id = p_user_id
  ) then raise exception 'project not found'; end if;

  select coalesce(sum(amount), 0) into available
  from public.video_studio_credit_ledger where user_id = p_user_id;
  if available < p_estimated_credits then raise exception 'insufficient credits'; end if;

  insert into public.video_studio_daily_spend(spend_date)
  values (current_date)
  on conflict (spend_date) do nothing;
  select estimated_cost, paused into daily_estimate, daily_paused
  from public.video_studio_daily_spend
  where spend_date = current_date
  for update;
  if daily_paused then
    return query select null::uuid, false, p_estimated_credits, 'daily_spend_paused'::text;
    return;
  end if;
  if daily_estimate + p_estimated_api_cost > p_max_daily_spend then
    update public.video_studio_daily_spend
    set paused = true,
      pause_reason = 'Automatic circuit breaker: estimated daily generation cost reached the configured limit.'
    where spend_date = current_date;
    return query select null::uuid, false, p_estimated_credits, 'daily_spend_limit'::text;
    return;
  end if;

  insert into public.video_studio_generations(
    project_id, user_id, request_key, duration_seconds, resolution,
    credits_reserved, estimated_api_cost, status, provider, model
  ) values (
    p_project_id, p_user_id, p_request_key, p_duration_seconds, p_resolution,
    p_estimated_credits, p_estimated_api_cost, 'reserved', 'n8n-router', 'auto'
  ) returning id into created_id;

  insert into public.video_studio_credit_ledger(
    user_id, amount, transaction_type, generation_id, idempotency_key
  ) values (
    p_user_id, -p_estimated_credits, 'generation_reservation', created_id,
    'generation_reservation:' || created_id::text
  );

  update public.video_studio_daily_spend
  set estimated_cost = estimated_cost + p_estimated_api_cost,
    generation_count = generation_count + 1
  where spend_date = current_date;

  update public.video_studio_projects set status = 'generating' where id = p_project_id;
  return query select created_id, true, p_estimated_credits, 'reserved'::text;
end;
$$;

create or replace function public.video_studio_fail_generation(p_generation_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target public.video_studio_generations%rowtype;
begin
  select * into target from public.video_studio_generations where id = p_generation_id for update;
  if target.id is null then return false; end if;
  if target.status in ('ready', 'failed', 'canceled') then return false; end if;
  update public.video_studio_generations
  set status = 'failed', error = left(coalesce(p_reason, 'Generation failed.'), 1000)
  where id = p_generation_id;
  insert into public.video_studio_credit_ledger(
    user_id, amount, transaction_type, generation_id, idempotency_key, metadata
  ) values (
    target.user_id, target.credits_reserved, 'generation_refund', target.id,
    'generation_refund:' || target.id::text,
    jsonb_build_object('reason', left(coalesce(p_reason, 'Generation failed.'), 500))
  ) on conflict (idempotency_key) do nothing;
  update public.video_studio_projects set status = 'failed' where id = target.project_id;
  return true;
end;
$$;

create or replace function public.video_studio_claim_stripe_event(p_event_id text, p_event_type text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inserted_count integer;
declare existing_status text;
begin
  insert into public.video_studio_stripe_events(event_id, event_type, status)
  values (p_event_id, p_event_type, 'processing')
  on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return true; end if;
  select status into existing_status from public.video_studio_stripe_events where event_id = p_event_id for update;
  if existing_status = 'failed' then
    update public.video_studio_stripe_events
    set status = 'processing', error = null, received_at = now(), processed_at = null
    where event_id = p_event_id;
    return true;
  end if;
  return false;
end;
$$;

-- Give accounts that already existed when the internal beta was installed a
-- one-time, non-purchased test-credit allocation. Future accounts receive no
-- credits until the owner grants them or verified test-mode billing is enabled.
insert into public.video_studio_profiles(user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.video_studio_credit_ledger(
  user_id, amount, transaction_type, idempotency_key, metadata
)
select id, 30, 'internal_beta_grant', 'internal_beta_seed:' || id::text,
  jsonb_build_object('reason', 'Initial internal-beta testing allocation')
from auth.users
on conflict (idempotency_key) do nothing;

alter table public.video_studio_plans enable row level security;
alter table public.video_studio_profiles enable row level security;
alter table public.video_studio_projects enable row level security;
alter table public.video_studio_generations enable row level security;
alter table public.video_studio_generation_scenes enable row level security;
alter table public.video_studio_subscriptions enable row level security;
alter table public.video_studio_credit_ledger enable row level security;
alter table public.video_studio_brand_profiles enable row level security;
alter table public.video_studio_stripe_events enable row level security;
alter table public.video_studio_daily_spend enable row level security;

drop policy if exists video_studio_plans_read on public.video_studio_plans;
create policy video_studio_plans_read on public.video_studio_plans
for select to anon, authenticated using (active = true);

drop policy if exists video_studio_profiles_own_read on public.video_studio_profiles;
create policy video_studio_profiles_own_read on public.video_studio_profiles
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists video_studio_projects_own_read on public.video_studio_projects;
create policy video_studio_projects_own_read on public.video_studio_projects
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists video_studio_projects_own_insert on public.video_studio_projects;
create policy video_studio_projects_own_insert on public.video_studio_projects
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (
    brand_profile_id is null
    or exists (
      select 1 from public.video_studio_brand_profiles b
      where b.id = brand_profile_id and b.user_id = (select auth.uid())
    )
  )
);

drop policy if exists video_studio_generations_own_read on public.video_studio_generations;
create policy video_studio_generations_own_read on public.video_studio_generations
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists video_studio_scenes_own_read on public.video_studio_generation_scenes;
create policy video_studio_scenes_own_read on public.video_studio_generation_scenes
for select to authenticated using (exists (
  select 1 from public.video_studio_generations g
  where g.id = generation_id and g.user_id = (select auth.uid())
));

drop policy if exists video_studio_subscriptions_own_read on public.video_studio_subscriptions;
create policy video_studio_subscriptions_own_read on public.video_studio_subscriptions
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists video_studio_ledger_own_read on public.video_studio_credit_ledger;
create policy video_studio_ledger_own_read on public.video_studio_credit_ledger
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists video_studio_brand_profiles_own_all on public.video_studio_brand_profiles;
create policy video_studio_brand_profiles_own_all on public.video_studio_brand_profiles
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.video_studio_plans, public.video_studio_profiles,
  public.video_studio_projects, public.video_studio_generations,
  public.video_studio_generation_scenes, public.video_studio_subscriptions,
  public.video_studio_credit_ledger, public.video_studio_brand_profiles,
  public.video_studio_stripe_events, public.video_studio_daily_spend
from anon, authenticated;

grant select on public.video_studio_plans to anon, authenticated;
grant select on public.video_studio_profiles to authenticated;
grant select, insert on public.video_studio_projects to authenticated;
grant select on public.video_studio_generations, public.video_studio_generation_scenes,
  public.video_studio_subscriptions, public.video_studio_credit_ledger to authenticated;
grant select, insert, update, delete on public.video_studio_brand_profiles to authenticated;

grant select, insert, update, delete on public.video_studio_plans,
  public.video_studio_profiles, public.video_studio_projects,
  public.video_studio_generations, public.video_studio_generation_scenes,
  public.video_studio_subscriptions, public.video_studio_credit_ledger,
  public.video_studio_brand_profiles, public.video_studio_stripe_events,
  public.video_studio_daily_spend to service_role;

revoke all on function public.video_studio_bootstrap_profile() from public, anon;
grant execute on function public.video_studio_bootstrap_profile() to authenticated;
revoke all on function public.video_studio_credit_balance() from public, anon;
grant execute on function public.video_studio_credit_balance() to authenticated;
revoke all on function public.video_studio_reserve_generation(uuid, uuid, text, integer, integer, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.video_studio_reserve_generation(uuid, uuid, text, integer, integer, text, numeric, numeric) to service_role;
revoke all on function public.video_studio_fail_generation(uuid, text) from public, anon, authenticated;
grant execute on function public.video_studio_fail_generation(uuid, text) to service_role;
revoke all on function public.video_studio_claim_stripe_event(text, text) from public, anon, authenticated;
grant execute on function public.video_studio_claim_stripe_event(text, text) to service_role;
revoke all on function public.video_studio_reject_ledger_mutation() from public, anon, authenticated;
revoke all on function public.video_studio_touch_updated_at() from public, anon, authenticated;
