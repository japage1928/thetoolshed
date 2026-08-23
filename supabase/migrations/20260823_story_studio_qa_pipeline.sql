-- Applied to production on 2026-08-23.
-- Stores the most recent Story Studio QA result and a bounded QA audit history.

alter table story_studio.projects
  add column if not exists qa_history jsonb not null default '[]'::jsonb;

alter table story_studio.projects
  add column if not exists last_qa jsonb;
