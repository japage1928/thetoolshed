-- Allow signed-in users to record only their own legal acceptance.
-- The read policy already limits rows to auth.uid() = user_id.

drop policy if exists tool_shed_legal_acceptances_own_insert
  on public.tool_shed_legal_acceptances;

create policy tool_shed_legal_acceptances_own_insert
  on public.tool_shed_legal_acceptances
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant insert on public.tool_shed_legal_acceptances to authenticated;
