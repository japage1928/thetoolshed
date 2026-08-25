grant insert on table public.tool_shed_legal_acceptances to authenticated;

drop policy if exists tool_shed_legal_acceptances_own_insert
  on public.tool_shed_legal_acceptances;

create policy tool_shed_legal_acceptances_own_insert
  on public.tool_shed_legal_acceptances
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
