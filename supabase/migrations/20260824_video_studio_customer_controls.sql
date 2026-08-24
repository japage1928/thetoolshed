-- Customer-controlled project deletion, durable legal acceptance, and efficient
-- account/usage queries.

create table if not exists public.tool_shed_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  acceptable_use_version text not null,
  source text not null check (source in ('email_signup', 'google_oauth', 'account_prompt')),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version, acceptable_use_version)
);

alter table public.tool_shed_legal_acceptances enable row level security;

drop policy if exists tool_shed_legal_acceptances_own_read on public.tool_shed_legal_acceptances;
create policy tool_shed_legal_acceptances_own_read
  on public.tool_shed_legal_acceptances
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tool_shed_legal_acceptances from public, anon, authenticated;
grant select on public.tool_shed_legal_acceptances to authenticated;
grant all on public.tool_shed_legal_acceptances to service_role;

drop policy if exists video_studio_projects_own_delete on public.video_studio_projects;
create policy video_studio_projects_own_delete
  on public.video_studio_projects
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.video_studio_projects to authenticated;

create index if not exists video_studio_credit_ledger_generation_idx
  on public.video_studio_credit_ledger(generation_id);
create index if not exists video_studio_profiles_plan_idx
  on public.video_studio_profiles(plan_id);
create index if not exists video_studio_projects_brand_profile_idx
  on public.video_studio_projects(brand_profile_id);
create index if not exists video_studio_subscriptions_plan_idx
  on public.video_studio_subscriptions(plan);

create or replace function public.video_studio_account_usage()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'available_credits', coalesce((
      select sum(amount) from public.video_studio_credit_ledger
      where user_id = (select auth.uid())
    ), 0),
    'credits_granted', coalesce((
      select sum(amount) from public.video_studio_credit_ledger
      where user_id = (select auth.uid()) and amount > 0
    ), 0),
    'credits_used', coalesce((
      select -sum(amount) from public.video_studio_credit_ledger
      where user_id = (select auth.uid()) and amount < 0
    ), 0),
    'project_count', (
      select count(*) from public.video_studio_projects
      where user_id = (select auth.uid())
    ),
    'generation_count', (
      select count(*) from public.video_studio_generations
      where user_id = (select auth.uid())
    ),
    'completed_generations', (
      select count(*) from public.video_studio_generations
      where user_id = (select auth.uid()) and status = 'ready'
    )
  );
$$;

revoke all on function public.video_studio_account_usage() from public, anon;
grant execute on function public.video_studio_account_usage() to authenticated;
