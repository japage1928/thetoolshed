-- Story Studio publisher-ready expansion.
alter table story_studio.projects drop constraint if exists projects_project_type_check;
alter table story_studio.projects add constraint projects_project_type_check check (project_type in ('childrens_book','book','short_story','comic_book'));
alter table story_studio.projects add column if not exists illustrations jsonb not null default '[]'::jsonb;
alter table story_studio.projects add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table story_studio.projects add column if not exists export_status text not null default 'not_ready';
alter table story_studio.projects add column if not exists export_last_created_at timestamptz;

update story_studio.plans set monthly_image_limit = 1, monthly_word_limit = 2500 where id = 'free';
update story_studio.plans set commercial_use = true where id in ('creator','author','studio');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-studio-exports','story-studio-exports',false,52428800,array['application/zip'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
