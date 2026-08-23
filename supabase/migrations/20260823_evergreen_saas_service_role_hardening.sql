-- REVIEW BEFORE APPLYING.
-- Purpose:
-- 1) Keep evergreen_saas inaccessible to browser anon/authenticated roles.
-- 2) Permit the Tool Shed server-only Supabase service role to use the schema.
-- 3) Pin security-sensitive function search_path values to remove mutable-path risk.
--
-- This migration does NOT add evergreen_saas to Supabase/PostgREST exposed schemas.
-- If the application continues using supabase-js `.schema('evergreen_saas')`, add the
-- schema to the project's API exposed-schema list only after this migration is applied.
-- anon/authenticated remain explicitly revoked below.

REVOKE ALL ON SCHEMA evergreen_saas FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA evergreen_saas FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA evergreen_saas FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA evergreen_saas FROM anon, authenticated;

GRANT USAGE ON SCHEMA evergreen_saas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA evergreen_saas TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA evergreen_saas TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evergreen_saas TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA evergreen_saas
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA evergreen_saas
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA evergreen_saas
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER FUNCTION evergreen_saas.detect_url(text)
  SET search_path = evergreen_saas, pg_temp;
ALTER FUNCTION evergreen_saas.set_post_url_flag()
  SET search_path = evergreen_saas, pg_temp;
ALTER FUNCTION evergreen_saas.reserve_due_post(timestamptz)
  SET search_path = evergreen_saas, pg_temp;
ALTER FUNCTION evergreen_saas.complete_publish(uuid, uuid, text)
  SET search_path = evergreen_saas, pg_temp;
ALTER FUNCTION evergreen_saas.release_reservation(uuid, uuid, text, boolean)
  SET search_path = evergreen_saas, pg_temp;

-- Rollback of grants only, if required:
-- REVOKE ALL ON SCHEMA evergreen_saas FROM service_role;
-- REVOKE ALL ON ALL TABLES IN SCHEMA evergreen_saas FROM service_role;
-- REVOKE ALL ON ALL SEQUENCES IN SCHEMA evergreen_saas FROM service_role;
-- REVOKE ALL ON ALL FUNCTIONS IN SCHEMA evergreen_saas FROM service_role;
-- Function search_path hardening is safe to leave in place.
