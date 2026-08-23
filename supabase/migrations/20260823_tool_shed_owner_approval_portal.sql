-- Applied to production on 2026-08-23.
-- Creates a private owner/admin registry and authenticated SECURITY DEFINER RPCs
-- for listing and resolving company_autonomy_queue items awaiting human approval.
-- The admin registry was seeded from the single Auth user that existed before
-- customer registration is opened. Browser roles receive no access to private tables.

create schema if not exists private;

create table if not exists private.tool_shed_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into private.tool_shed_admin_users(user_id)
select id from auth.users
on conflict (user_id) do nothing;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- RPC definitions are maintained in the applied Supabase migration
-- tool_shed_owner_approval_portal. See Supabase migration history for the
-- authoritative function bodies: is_tool_shed_admin,
-- admin_list_approval_queue, and admin_resolve_approval.
