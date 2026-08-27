create table if not exists public.ai_weekly_filters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  published_date date not null,
  one_sentence_week text not null,
  keep_items jsonb not null default '[]'::jsonb,
  skip_items jsonb not null default '[]'::jsonb,
  dont_pay_items jsonb not null default '[]'::jsonb,
  costs_limits text,
  what_im_ignoring text,
  faqs jsonb not null default '[]'::jsonb,
  cta_label text,
  cta_href text,
  author text not null default 'John Page',
  seo_title text,
  meta_description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_weekly_filters enable row level security;

grant select on public.ai_weekly_filters to anon, authenticated;

drop policy if exists "Public can read published AI weekly filters" on public.ai_weekly_filters;
create policy "Public can read published AI weekly filters"
  on public.ai_weekly_filters
  for select
  to anon, authenticated
  using (is_published = true);

create index if not exists ai_weekly_filters_published_date_idx
  on public.ai_weekly_filters (published_date desc);
