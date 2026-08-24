-- Internal operations tables are owned by server-side automation.
--
-- Access model, reviewed table-by-table:
--   * n8n uses the PostgreSQL owner connection and is not subject to RLS.
--   * service_role retains its existing privileges and bypasses RLS.
--   * anon/authenticated browser roles must not read or mutate these tables.
--
-- No permissive policies are intentionally created. This keeps the Data API
-- closed while preserving the existing n8n automation path.

-- Company execution and governance
alter table public.company_agent_runs enable row level security;
revoke all privileges on table public.company_agent_runs from anon, authenticated;

alter table public.company_agents enable row level security;
revoke all privileges on table public.company_agents from anon, authenticated;

alter table public.company_approvals enable row level security;
revoke all privileges on table public.company_approvals from anon, authenticated;

alter table public.company_autonomy_objectives enable row level security;
revoke all privileges on table public.company_autonomy_objectives from anon, authenticated;

alter table public.company_decisions enable row level security;
revoke all privileges on table public.company_decisions from anon, authenticated;

alter table public.company_entity_links enable row level security;
revoke all privileges on table public.company_entity_links from anon, authenticated;

alter table public.company_event_types enable row level security;
revoke all privileges on table public.company_event_types from anon, authenticated;

alter table public.company_interdepartment_requests enable row level security;
revoke all privileges on table public.company_interdepartment_requests from anon, authenticated;

alter table public.company_maintenance_incidents enable row level security;
revoke all privileges on table public.company_maintenance_incidents from anon, authenticated;

alter table public.company_objectives enable row level security;
revoke all privileges on table public.company_objectives from anon, authenticated;

alter table public.company_projects enable row level security;
revoke all privileges on table public.company_projects from anon, authenticated;

alter table public.company_source_registry enable row level security;
revoke all privileges on table public.company_source_registry from anon, authenticated;

alter table public.company_structure enable row level security;
revoke all privileges on table public.company_structure from anon, authenticated;

alter table public.company_tasks enable row level security;
revoke all privileges on table public.company_tasks from anon, authenticated;

alter table public.workflow_health enable row level security;
revoke all privileges on table public.workflow_health from anon, authenticated;

-- Company research, products, production, and experiments
alter table public.company_content_topics enable row level security;
revoke all privileges on table public.company_content_topics from anon, authenticated;

alter table public.company_experiments enable row level security;
revoke all privileges on table public.company_experiments from anon, authenticated;

alter table public.company_external_tactics enable row level security;
revoke all privileges on table public.company_external_tactics from anon, authenticated;

alter table public.company_opportunities enable row level security;
revoke all privileges on table public.company_opportunities from anon, authenticated;

alter table public.company_product_backlog enable row level security;
revoke all privileges on table public.company_product_backlog from anon, authenticated;

alter table public.company_production_daily enable row level security;
revoke all privileges on table public.company_production_daily from anon, authenticated;

alter table public.company_production_targets enable row level security;
revoke all privileges on table public.company_production_targets from anon, authenticated;

alter table public.company_products enable row level security;
revoke all privileges on table public.company_products from anon, authenticated;

-- Finance and internal cost controls
alter table public.company_ai_rate_card enable row level security;
revoke all privileges on table public.company_ai_rate_card from anon, authenticated;

alter table public.company_finance_accounts enable row level security;
revoke all privileges on table public.company_finance_accounts from anon, authenticated;

alter table public.company_finance_journal enable row level security;
revoke all privileges on table public.company_finance_journal from anon, authenticated;

alter table public.company_finance_ledger_lines enable row level security;
revoke all privileges on table public.company_finance_ledger_lines from anon, authenticated;

-- Developer Studio automation
alter table public.developer_studio_projects enable row level security;
revoke all privileges on table public.developer_studio_projects from anon, authenticated;

alter table public.developer_studio_events enable row level security;
revoke all privileges on table public.developer_studio_events from anon, authenticated;

-- Communications, leads, and publishing operations
alter table public.email_events enable row level security;
revoke all privileges on table public.email_events from anon, authenticated;

alter table public.email_outbox enable row level security;
revoke all privileges on table public.email_outbox from anon, authenticated;

alter table public.email_suppressions enable row level security;
revoke all privileges on table public.email_suppressions from anon, authenticated;

alter table public.newsletter_content_queue enable row level security;
revoke all privileges on table public.newsletter_content_queue from anon, authenticated;

alter table public.sales_leads enable row level security;
revoke all privileges on table public.sales_leads from anon, authenticated;

-- Private analytics ingestion and reporting
alter table public.google_analytics_daily enable row level security;
revoke all privileges on table public.google_analytics_daily from anon, authenticated;

alter table public.x_account_analytics_daily enable row level security;
revoke all privileges on table public.x_account_analytics_daily from anon, authenticated;

alter table public.x_post_analytics_daily enable row level security;
revoke all privileges on table public.x_post_analytics_daily from anon, authenticated;
