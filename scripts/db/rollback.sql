-- Rollback for roles.sql (audit item 1 + DB-side guard). Run as postgres in orthoandspinetools.
--
-- PRECONDITION (the script refuses otherwise): backend + bot-analytics are back on the
-- previous DATABASE_URL (user postgres) and recreated, so no session uses ost_app/ost_migrator.
--
--   docker exec -i orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -v ON_ERROR_STOP=1 -f - < rollback.sql
--
-- Result: ownership back to postgres, guard removed, the three roles dropped, PUBLIC
-- CONNECT/TEMP restored on the DBs (the pre-change state). PUBLIC still has no CREATE on
-- schema public (that was already the PG15 state before roles.sql).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_stat_activity
   WHERE usename IN ('ost_app','ost_migrator','ost_backup') AND pid <> pg_backend_pid();
  IF n > 0 THEN
    RAISE EXCEPTION 'rollback.sql: % session(s) still connected as ost_app/ost_migrator/ost_backup. Switch DATABASE_URL back and recreate backend + bot-analytics first.', n;
  END IF;
END $$;

-- 1. Guard off first (it would block DROP SCHEMA below).
DROP EVENT TRIGGER IF EXISTS ost_guard_ddl_start;
DROP EVENT TRIGGER IF EXISTS ost_guard_sql_drop;
DROP EVENT TRIGGER IF EXISTS ost_guard_attach_truncate;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT format('%I.%I', n.nspname, c.relname) AS fq
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE t.tgname = 'ost_guard_no_truncate'
  LOOP
    EXECUTE format('DROP TRIGGER ost_guard_no_truncate ON %s', r.fq);
  END LOOP;
END $$;
DROP SCHEMA IF EXISTS ost_guard CASCADE;

-- 2. Ownership back to postgres (objects only; nothing is dropped).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ost_migrator') THEN
    EXECUTE 'REASSIGN OWNED BY ost_migrator TO postgres';
  END IF;
END $$;

-- 3. Remove grants/default privileges held by the roles, then the roles.
--    (DROP OWNED here only drops privileges: they own nothing after step 2.)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['ost_app','ost_migrator','ost_backup'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('DROP OWNED BY %I', r);
    END IF;
  END LOOP;
END $$;

-- 4. Pre-change DB ACLs (NULL acl = PUBLIC CONNECT+TEMP).
GRANT CONNECT, TEMPORARY ON DATABASE orthoandspinetools TO PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE postgres TO PUBLIC;
COMMIT;

-- Roles are cluster-wide; DROP ROLE also needs DROP OWNED in every DB where they hold
-- privileges. Only orthoandspinetools + postgres(db ACL, revoked above) are involved.
DROP ROLE IF EXISTS ost_app;
DROP ROLE IF EXISTS ost_migrator;
DROP ROLE IF EXISTS ost_backup;
\echo 'rollback.sql: done.'
