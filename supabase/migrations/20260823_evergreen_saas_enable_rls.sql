-- SECURITY HARDENING PROPOSAL ONLY.
-- Do not apply blindly to production. The SaaS application uses a server-only
-- service-role client for evergreen_saas. Enabling RLS with no browser policies
-- intentionally blocks anon/authenticated PostgREST access while the service role
-- continues to operate server-side.
--
-- Before applying, verify that no legitimate client-side code depends on direct
-- access to these tables. Rollback instructions are included at the bottom.

ALTER TABLE evergreen_saas.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.x_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.scheduler_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.publish_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_saas.usage_events ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are intentionally created here.
-- Customer access must go through authenticated Tool Shed server routes, which
-- derive user identity from the Supabase Auth session and scope every query by user_id.

-- MANUAL ROLLBACK (only if required after review):
-- ALTER TABLE evergreen_saas.plans DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.subscriptions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.x_connections DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.scheduler_settings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.posts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.publish_attempts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evergreen_saas.usage_events DISABLE ROW LEVEL SECURITY;
