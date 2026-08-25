-- Bind product identity to one project/source/reference revision and make
-- generation readiness an explicit, server-enforced state machine.

create extension if not exists pgcrypto;

alter table public.video_studio_projects
  add column if not exists product_identity_project_id uuid,
  add column if not exists product_identity_source_fingerprint text,
  add column if not exists product_identity_fingerprint text,
  add column if not exists product_identity_verified_at timestamptz,
  add column if not exists reference_revision integer not null default 0,
  add column if not exists product_identity_verified_reference_revision integer,
  add column if not exists product_identity_requires_reference boolean not null default true;

alter table public.video_studio_projects
  drop constraint if exists video_studio_projects_status_check;

-- Map legacy states before installing the new constraint.
update public.video_studio_projects p
set status = case
  when exists (
    select 1 from public.video_studio_generations g
    where g.project_id = p.id and g.status = 'ready'
  ) then 'completed'
  when exists (
    select 1 from public.video_studio_generations g
    where g.project_id = p.id and g.status in ('reserved','queued','planning','generating','qa','repairing')
  ) then 'generating'
  when p.status = 'failed' then 'failed'
  when p.product_identity_status = 'verified' then 'identity_required'
  else 'identity_required'
end;

-- A legacy label is not proof under the new binding model. Keep the extracted
-- fields available for the user to review, but never expose them as verified.
update public.video_studio_projects
set product_identity_status = 'pending',
    product_identity_confidence = 0,
    product_identity_source = 'unverified';

alter table public.video_studio_projects
  add constraint video_studio_projects_status_check
  check (status in (
    'draft', 'identity_required', 'identity_verified', 'ready_to_generate',
    'generating', 'completed', 'failed'
  ));

alter table public.video_studio_projects
  drop constraint if exists video_studio_projects_identity_binding_fkey;
alter table public.video_studio_projects
  add constraint video_studio_projects_identity_binding_fkey
  foreign key (product_identity_project_id)
  references public.video_studio_projects(id)
  on delete cascade;

create or replace function public.video_studio_source_fingerprint(
  p_project_id uuid,
  p_source_type text,
  p_source_url text,
  p_creative_brief text
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        p_project_id::text,
        p_source_type,
        case when p_source_type = 'url' then coalesce(p_source_url, '') else coalesce(p_creative_brief, '') end
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.video_studio_identity_fingerprint(p_identity jsonb)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.digest(coalesce(p_identity, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;

create or replace function public.video_studio_guard_project_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- A new project always starts clean. Extraction/verification is a separate,
    -- project-scoped action after the row has its final UUID.
    new.product_identity := '{}'::jsonb;
    new.product_identity_confidence := 0;
    new.product_identity_status := 'pending';
    new.product_identity_source := 'unverified';
    new.product_identity_project_id := null;
    new.product_identity_source_fingerprint := null;
    new.product_identity_fingerprint := null;
    new.product_identity_verified_at := null;
    new.product_identity_verified_reference_revision := null;
    new.product_identity_requires_reference := true;
    new.status := 'identity_required';
    return new;
  end if;

  if new.source_type is distinct from old.source_type
    or new.source_url is distinct from old.source_url
    or (new.source_type <> 'url' and new.creative_brief is distinct from old.creative_brief) then
    new.product_identity := '{}'::jsonb;
    new.product_identity_confidence := 0;
    new.product_identity_status := 'pending';
    new.product_identity_source := 'unverified';
    new.product_identity_project_id := null;
    new.product_identity_source_fingerprint := null;
    new.product_identity_fingerprint := null;
    new.product_identity_verified_at := null;
    new.product_identity_verified_reference_revision := null;
    new.product_identity_requires_reference := true;
    new.status := 'identity_required';
    return new;
  end if;

  -- Reference changes invalidate confidence and verification until the current
  -- revision is explicitly verified again.
  if new.reference_revision is distinct from old.reference_revision
    and new.product_identity_verified_reference_revision is not distinct from old.product_identity_verified_reference_revision then
    new.product_identity_confidence := 0;
    new.product_identity_status := 'needs_reference';
    new.product_identity_project_id := null;
    new.product_identity_source_fingerprint := null;
    new.product_identity_fingerprint := null;
    new.product_identity_verified_at := null;
    new.product_identity_verified_reference_revision := null;
    new.status := 'identity_required';
    return new;
  end if;

  -- Any material identity write that does not also provide a matching new
  -- identity fingerprint is stale by definition.
  if new.product_identity is distinct from old.product_identity
    and new.product_identity_fingerprint is not distinct from old.product_identity_fingerprint then
    new.product_identity_confidence := 0;
    new.product_identity_status := 'pending';
    new.product_identity_project_id := null;
    new.product_identity_source_fingerprint := null;
    new.product_identity_fingerprint := null;
    new.product_identity_verified_at := null;
    new.product_identity_verified_reference_revision := null;
    new.status := 'identity_required';
  end if;

  return new;
end;
$$;

drop trigger if exists video_studio_projects_guard_identity on public.video_studio_projects;
create trigger video_studio_projects_guard_identity
before insert or update on public.video_studio_projects
for each row execute function public.video_studio_guard_project_identity();

create or replace function public.video_studio_invalidate_identity_for_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  update public.video_studio_projects
  set reference_revision = reference_revision + 1
  where id = target_project_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists video_studio_reference_images_invalidate_identity on public.video_studio_reference_images;
create trigger video_studio_reference_images_invalidate_identity
after insert or delete on public.video_studio_reference_images
for each row execute function public.video_studio_invalidate_identity_for_reference();

drop policy if exists video_studio_reference_images_own_insert on public.video_studio_reference_images;
create policy video_studio_reference_images_own_insert
on public.video_studio_reference_images
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.video_studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  )
);

grant select, insert, delete on public.video_studio_reference_images to authenticated;

-- Authenticated users may only access object paths rooted at their own user id.
drop policy if exists video_studio_references_own_select on storage.objects;
create policy video_studio_references_own_select on storage.objects
for select to authenticated
using (
  bucket_id = 'video-studio-references'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists video_studio_references_own_insert on storage.objects;
create policy video_studio_references_own_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'video-studio-references'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists video_studio_references_own_delete on storage.objects;
create policy video_studio_references_own_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'video-studio-references'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.video_studio_verify_project_identity(
  p_project_id uuid,
  p_identity jsonb,
  p_confidence numeric,
  p_source text,
  p_requires_reference boolean
)
returns public.video_studio_projects
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare current_user_id uuid := auth.uid();
declare target public.video_studio_projects%rowtype;
declare reference_count integer;
declare has_source_image boolean;
declare passed boolean;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_source not in ('unverified','url_extraction','user_confirmed','url_plus_reference') then
    raise exception 'invalid identity source';
  end if;
  if p_confidence < 0 or p_confidence > 1 then raise exception 'invalid identity confidence'; end if;

  select * into target
  from public.video_studio_projects
  where id = p_project_id and user_id = current_user_id
  for update;
  if target.id is null then raise exception 'project not found'; end if;

  select count(*) into reference_count
  from public.video_studio_reference_images
  where project_id = target.id and user_id = current_user_id;

  has_source_image := nullif(btrim(coalesce(p_identity->>'primaryImageUrl', '')), '') is not null;
  passed := p_confidence >= 0.8
    and nullif(btrim(coalesce(p_identity->>'name', '')), '') is not null
    and (not p_requires_reference or reference_count > 0 or has_source_image);

  update public.video_studio_projects
  set product_identity = coalesce(p_identity, '{}'::jsonb),
      product_identity_confidence = case when passed then p_confidence else 0 end,
      product_identity_status = case when passed then 'verified' else 'needs_reference' end,
      product_identity_source = case when passed then p_source else 'unverified' end,
      product_identity_project_id = case when passed then target.id else null end,
      product_identity_source_fingerprint = case when passed then public.video_studio_source_fingerprint(target.id, target.source_type, target.source_url, target.creative_brief) else null end,
      product_identity_fingerprint = case when passed then public.video_studio_identity_fingerprint(coalesce(p_identity, '{}'::jsonb)) else null end,
      product_identity_verified_at = case when passed then now() else null end,
      product_identity_verified_reference_revision = case when passed then target.reference_revision else null end,
      product_identity_requires_reference = p_requires_reference,
      status = case when passed then 'ready_to_generate' else 'identity_required' end
  where id = target.id
  returning * into target;

  return target;
end;
$$;

-- One active generation per project is a database invariant, independent of
-- client idempotency-key behavior.
create unique index if not exists video_studio_one_active_generation_per_project
on public.video_studio_generations(project_id)
where status in ('reserved','queued','planning','generating','qa','repairing');

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
set search_path = public, extensions, pg_temp
as $$
declare current_user_id uuid := auth.uid();
declare existing_id uuid;
declare created_id uuid;
declare available bigint;
declare daily_estimate numeric(12,4);
declare daily_paused boolean;
declare target public.video_studio_projects%rowtype;
declare current_source_fingerprint text;
declare current_identity_fingerprint text;
begin
  if current_user_id is null or current_user_id <> p_user_id then raise exception 'authentication required'; end if;
  if p_estimated_credits <= 0 then raise exception 'estimated credits must be positive'; end if;
  if p_estimated_api_cost <= 0 then raise exception 'estimated API cost must be positive'; end if;
  if p_max_daily_spend <= 0 then raise exception 'daily spend limit must be positive'; end if;
  if p_resolution not in ('480p', '720p', '1080p') then raise exception 'invalid resolution'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));

  select id into existing_id from public.video_studio_generations
  where user_id = current_user_id and request_key = p_request_key;
  if existing_id is not null then
    return query select existing_id, false, p_estimated_credits, 'duplicate'::text;
    return;
  end if;

  select id into existing_id from public.video_studio_generations
  where project_id = p_project_id
    and status in ('reserved','queued','planning','generating','qa','repairing')
  limit 1;
  if existing_id is not null then
    return query select existing_id, false, p_estimated_credits, 'duplicate_project'::text;
    return;
  end if;

  select * into target from public.video_studio_projects
  where id = p_project_id and user_id = current_user_id
  for update;
  if target.id is null then raise exception 'project not found'; end if;

  current_source_fingerprint := public.video_studio_source_fingerprint(target.id, target.source_type, target.source_url, target.creative_brief);
  current_identity_fingerprint := public.video_studio_identity_fingerprint(target.product_identity);

  if target.status <> 'ready_to_generate'
    or target.product_identity_status <> 'verified'
    or target.product_identity_confidence < 0.8
    or target.product_identity_project_id is distinct from target.id
    or target.product_identity_source_fingerprint is distinct from current_source_fingerprint
    or target.product_identity_fingerprint is distinct from current_identity_fingerprint
    or target.product_identity_verified_reference_revision is distinct from target.reference_revision
    or target.product_identity_verified_at is null
    or nullif(btrim(coalesce(target.product_identity->>'name', '')), '') is null then
    raise exception 'product identity is stale, incomplete, or belongs to a different project or source';
  end if;

  if target.product_identity_requires_reference
    and nullif(btrim(coalesce(target.product_identity->>'primaryImageUrl', '')), '') is null
    and not exists (
      select 1 from public.video_studio_reference_images r
      where r.project_id = target.id and r.user_id = current_user_id
    ) then
    raise exception 'a current-project reference image is required';
  end if;

  select coalesce(sum(amount), 0) into available
  from public.video_studio_credit_ledger where user_id = current_user_id;
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
    p_project_id, current_user_id, p_request_key, p_duration_seconds, p_resolution,
    p_estimated_credits, p_estimated_api_cost, 'reserved', 'n8n-router', 'auto'
  ) returning id into created_id;

  insert into public.video_studio_credit_ledger(
    user_id, amount, transaction_type, generation_id, idempotency_key
  ) values (
    current_user_id, -p_estimated_credits, 'generation_reservation', created_id,
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

create or replace function public.video_studio_mark_generation_queued(
  p_generation_id uuid,
  p_workflow_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.video_studio_generations
  set status = 'queued', workflow_payload = coalesce(p_workflow_payload, '{}'::jsonb), updated_at = now()
  where id = p_generation_id and user_id = auth.uid() and status = 'reserved';
  return found;
end;
$$;

create or replace function public.video_studio_fail_own_generation(
  p_generation_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.video_studio_generations
    where id = p_generation_id and user_id = auth.uid()
  ) then raise exception 'generation not found'; end if;
  return public.video_studio_fail_generation(p_generation_id, p_reason);
end;
$$;

create or replace function public.video_studio_complete_generation(
  p_generation_id uuid,
  p_provider text,
  p_model text,
  p_output_payload jsonb,
  p_actual_credits integer,
  p_actual_api_cost numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target public.video_studio_generations%rowtype;
declare delta integer;
begin
  select * into target from public.video_studio_generations where id = p_generation_id for update;
  if target.id is null then return false; end if;
  if target.status = 'ready' then return true; end if;
  if target.status in ('failed','canceled') then return false; end if;
  if nullif(btrim(coalesce(p_output_payload->>'video_url', '')), '') is null then
    raise exception 'completed generation requires a video URL';
  end if;

  delta := target.credits_reserved - greatest(0, p_actual_credits);
  if delta <> 0 then
    insert into public.video_studio_credit_ledger(
      user_id, amount, transaction_type, generation_id, idempotency_key, metadata
    ) values (
      target.user_id, delta,
      case when delta > 0 then 'generation_refund' else 'generation_reservation' end,
      target.id, 'generation_reconcile:' || target.id::text,
      jsonb_build_object('reserved', target.credits_reserved, 'actual', greatest(0, p_actual_credits))
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.video_studio_generations
  set status = 'ready', provider = left(coalesce(p_provider, provider), 100),
      model = left(coalesce(p_model, model), 120), output_payload = p_output_payload,
      credits_used = greatest(0, p_actual_credits), actual_api_cost = greatest(0, p_actual_api_cost),
      error = null, updated_at = now()
  where id = target.id;
  update public.video_studio_projects set status = 'completed' where id = target.project_id;
  update public.video_studio_daily_spend
  set actual_cost = actual_cost + greatest(0, p_actual_api_cost), updated_at = now()
  where spend_date = target.created_at::date;
  return true;
end;
$$;

revoke all on function public.video_studio_source_fingerprint(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.video_studio_identity_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.video_studio_guard_project_identity() from public, anon, authenticated;
revoke all on function public.video_studio_invalidate_identity_for_reference() from public, anon, authenticated;

revoke all on function public.video_studio_verify_project_identity(uuid,jsonb,numeric,text,boolean) from public, anon;
grant execute on function public.video_studio_verify_project_identity(uuid,jsonb,numeric,text,boolean) to authenticated;

revoke all on function public.video_studio_reserve_generation(uuid,uuid,text,integer,integer,text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.video_studio_reserve_generation(uuid,uuid,text,integer,integer,text,numeric,numeric) to authenticated, service_role;

revoke all on function public.video_studio_mark_generation_queued(uuid,jsonb) from public, anon;
grant execute on function public.video_studio_mark_generation_queued(uuid,jsonb) to authenticated;
revoke all on function public.video_studio_fail_own_generation(uuid,text) from public, anon;
grant execute on function public.video_studio_fail_own_generation(uuid,text) to authenticated;

revoke all on function public.video_studio_complete_generation(uuid,text,text,jsonb,integer,numeric) from public, anon, authenticated;
grant execute on function public.video_studio_complete_generation(uuid,text,text,jsonb,integer,numeric) to service_role;

-- The migration deliberately leaves previously verified identities invalidated.
-- They must pass the current source/reference checks before generation.
