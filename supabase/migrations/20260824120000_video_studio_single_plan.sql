-- Align the Video Studio catalog with the single paid offer:
-- $1 introductory access for three days, then $19.99/month.
-- Stripe Price IDs remain environment-specific and are not stored in Postgres.

insert into public.video_studio_plans (id, name, price_cents, monthly_credits, active)
values ('starter', 'Video Studio', 1999, 60, true)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  monthly_credits = excluded.monthly_credits,
  active = excluded.active,
  updated_at = now();

update public.video_studio_plans
set active = false, updated_at = now()
where id = 'creator';

