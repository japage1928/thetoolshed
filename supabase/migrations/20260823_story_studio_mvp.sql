-- Applied to production on 2026-08-23.
-- Story Studio MVP: plan limits, customer profiles, projects, usage metering,
-- and a public bucket for server-generated book artwork.

create schema if not exists story_studio;

create table if not exists story_studio.plans (
  id text primary key,
  name text not null,
  price_cents integer not null default 0,
  active_project_limit integer not null,
  monthly_word_limit integer not null,
  monthly_image_limit integer not null,
  commercial_use boolean not null default false,
  created_at timestamptz not null default now()
);

insert into story_studio.plans (id,name,price_cents,active_project_limit,monthly_word_limit,monthly_image_limit,commercial_use) values
('free','Free',0,1,5000,5,false),
('creator','Creator',1500,5,50000,25,true),
('author','Author',2900,15,150000,75,true),
('studio','Studio',5900,50,400000,200,true)
on conflict (id) do update set name=excluded.name,price_cents=excluded.price_cents,active_project_limit=excluded.active_project_limit,monthly_word_limit=excluded.monthly_word_limit,monthly_image_limit=excluded.monthly_image_limit,commercial_use=excluded.commercial_use;

create table if not exists story_studio.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  plan_id text not null default 'free' references story_studio.plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists story_studio.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_type text not null check (project_type in ('childrens_book','book','short_story')),
  title text not null default 'Untitled Project',
  idea text not null,
  target_audience text,
  tone text,
  status text not null default 'idea',
  story_bible jsonb not null default '{}'::jsonb,
  outline jsonb not null default '{}'::jsonb,
  manuscript jsonb not null default '[]'::jsonb,
  visual_bible jsonb not null default '{}'::jsonb,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists story_studio_projects_user_idx on story_studio.projects(user_id, updated_at desc);

create table if not exists story_studio.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references story_studio.projects(id) on delete set null,
  usage_type text not null check (usage_type in ('words','image')),
  units integer not null check (units > 0),
  created_at timestamptz not null default now()
);
create index if not exists story_studio_usage_user_month_idx on story_studio.usage_events(user_id, created_at desc);

revoke all on schema story_studio from public, anon, authenticated;
revoke all on all tables in schema story_studio from public, anon, authenticated;
revoke all on all sequences in schema story_studio from public, anon, authenticated;
grant usage on schema story_studio to service_role;
grant select,insert,update,delete on all tables in schema story_studio to service_role;
grant usage,select on all sequences in schema story_studio to service_role;
alter default privileges in schema story_studio grant select,insert,update,delete on tables to service_role;
alter default privileges in schema story_studio grant usage,select on sequences to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-studio-images','story-studio-images',true,10485760,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
