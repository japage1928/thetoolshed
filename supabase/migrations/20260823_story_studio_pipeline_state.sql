-- Story Studio production pipeline observability.
-- Keep machine-readable current-stage state separate from the bounded QA history.

alter table story_studio.projects
  add column if not exists pipeline_state jsonb not null default '{"stage":"intake","status":"pending"}'::jsonb;

alter table story_studio.projects
  add column if not exists cover_qa jsonb;
