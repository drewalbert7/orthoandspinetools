-- OST Postgres least-privilege roles + destructive-op guard  (audit items 1, 3-DB-side)
-- Target: orthoandspinetools DB on Postgres 15 (container orthoandspinetools-postgres).
-- Drafted by the Security Officer 2026-10-17. Tested on a throwaway postgres:15.14-alpine only.
--
-- Run as the postgres superuser, inside the container, AFTER a fresh verified dump:
--
--   docker exec -i \
--     -e OST_APP_DB_PASSWORD -e OST_MIGRATOR_DB_PASSWORD -e OST_BACKUP_DB_PASSWORD \
--     orthoandspinetools-postgres \
--     psql -U postgres -d orthoandspinetools -v ON_ERROR_STOP=1 -f - < roles.sql
--
-- Passwords are NEVER literal in this file. Either pass them with
--   psql -v app_password="$OST_APP_DB_PASSWORD" -v migrator_password=... -v backup_password=...
-- or (preferred: keeps them out of `ps`) export the three env vars above and the
-- \getenv fallback below reads them. The script aborts if any is missing or < 24 chars.
--
-- Idempotent: safe to re-run (it also re-sets passwords, so it doubles as a rotation script).
-- Online: no restart. Takes brief ACCESS EXCLUSIVE locks for ALTER ... OWNER and CREATE TRIGGER
-- on each table (milliseconds each on a 14 MB DB). Run in a quiet minute.
-- Rollback: rollback.sql (switch DATABASE_URL back to postgres FIRST).

\set ON_ERROR_STOP on
\if :{?app_password}
\else
  \getenv app_password OST_APP_DB_PASSWORD
\endif
\if :{?migrator_password}
\else
  \getenv migrator_password OST_MIGRATOR_DB_PASSWORD
\endif
\if :{?backup_password}
\else
  \getenv backup_password OST_BACKUP_DB_PASSWORD
\endif
\if :{?app_password}
\else
  \echo 'roles.sql: app_password missing (psql -v or OST_APP_DB_PASSWORD)'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif
\if :{?migrator_password}
\else
  \echo 'roles.sql: migrator_password missing (psql -v or OST_MIGRATOR_DB_PASSWORD)'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif
\if :{?backup_password}
\else
  \echo 'roles.sql: backup_password missing (psql -v or OST_BACKUP_DB_PASSWORD)'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif

-- Length / sanity checks without echoing values.
SELECT (length(:'app_password') >= 24 AND length(:'migrator_password') >= 24
        AND length(:'backup_password') >= 24
        AND :'app_password' <> :'migrator_password'
        AND :'app_password' <> :'backup_password'
        AND :'migrator_password' <> :'backup_password') AS pw_ok \gset
\if :pw_ok
\else
  \echo 'roles.sql: passwords must be >= 24 chars and all different. Nothing changed.'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif

SELECT current_database() = 'orthoandspinetools' AS db_ok, current_setting('server_version_num')::int >= 150000 AS ver_ok \gset
\if :db_ok
\else
  \echo 'roles.sql: connect to database orthoandspinetools. Nothing changed.'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif
\if :ver_ok
\else
  \echo 'roles.sql: needs Postgres >= 15 (pg_read_all_data, \getenv). Nothing changed.'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql aborted, nothing changed (see message above)'; END $$;
\endif

SET password_encryption = 'scram-sha-256';
-- Keep secrets out of the server log if a statement below errors.
SET log_min_error_statement = 'panic';
SET log_statement = 'none';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ost_app') THEN
    CREATE ROLE ost_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ost_migrator') THEN
    CREATE ROLE ost_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ost_backup') THEN
    CREATE ROLE ost_backup LOGIN;
  END IF;
END $$;

-- App: runtime DML only. Used by backend + bot-analytics DATABASE_URL.
ALTER ROLE ost_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 40;
-- Migrator: owns the app schema objects; used ONLY by `prisma migrate deploy` (scripts/db-migrate.sh).
ALTER ROLE ost_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 5;
-- Backup: read-only, for pg_dump.
ALTER ROLE ost_backup   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 3;

ALTER ROLE ost_app      PASSWORD :'app_password';
ALTER ROLE ost_migrator PASSWORD :'migrator_password';
ALTER ROLE ost_backup   PASSWORD :'backup_password';

-- Session defaults (per role, this DB only).
ALTER ROLE ost_app    IN DATABASE orthoandspinetools SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE ost_backup IN DATABASE orthoandspinetools SET default_transaction_read_only = on;

GRANT pg_read_all_data TO ost_backup;
-- Belt and braces: nobody but postgres may hold these.
DO $$
DECLARE r text; g text;
BEGIN
  FOREACH r IN ARRAY ARRAY['ost_app','ost_migrator','ost_backup'] LOOP
    FOREACH g IN ARRAY ARRAY['pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program'] LOOP
      IF pg_has_role(r, g, 'MEMBER') THEN EXECUTE format('REVOKE %I FROM %I', g, r); END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Database + schema level
-- ---------------------------------------------------------------------------
REVOKE ALL ON DATABASE orthoandspinetools FROM PUBLIC;           -- default PUBLIC had CONNECT + TEMP
GRANT CONNECT ON DATABASE orthoandspinetools TO ost_app, ost_backup;
GRANT CONNECT, TEMPORARY ON DATABASE orthoandspinetools TO ost_migrator;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;                      -- maintenance DB: superuser only

REVOKE CREATE ON SCHEMA public FROM PUBLIC;                       -- already the PG15 default; enforce
REVOKE ALL ON SCHEMA public FROM ost_app, ost_backup;
GRANT USAGE ON SCHEMA public TO ost_app, ost_backup;
GRANT USAGE, CREATE ON SCHEMA public TO ost_migrator;

-- ---------------------------------------------------------------------------
-- 3. Hand every app object from postgres to ost_migrator.
--    REASSIGN OWNED BY postgres is not allowed (bootstrap superuser), so loop.
--    Extension members (pg_trgm functions/operators) stay with postgres.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  -- tables, partitioned tables, views, matviews, foreign tables (owned sequences follow their table)
  FOR r IN
    SELECT c.oid, c.relkind, format('%I.%I', n.nspname, c.relname) AS fq
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
      AND pg_get_userbyid(c.relowner) <> 'ost_migrator'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO ost_migrator',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                     WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, r.fq);
  END LOOP;
  -- standalone sequences
  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS fq
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND pg_get_userbyid(c.relowner) <> 'ost_migrator'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype IN ('a','i','e'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO ost_migrator', r.fq);
  END LOOP;
  -- functions / procedures (not extension members)
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> 'ost_migrator'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                      AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO ost_migrator',
      CASE r.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END, r.sig);
  END LOOP;
  -- enum / domain / composite types (skip array + table row types + extension members)
  FOR r IN
    SELECT t.oid, t.typtype, format('%I.%I', n.nspname, t.typname) AS fq
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e','d','c','r') AND t.typelem = 0
      AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
      AND pg_get_userbyid(t.typowner) <> 'ost_migrator'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass
                      AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO ost_migrator',
      CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, r.fq);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Object privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, ost_app, ost_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ost_app, ost_backup;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ost_app;
-- Explicit: no TRUNCATE / REFERENCES / TRIGGER for the app (also not granted above).
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ost_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ost_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ost_app;

-- The app never needs Prisma's migration ledger.
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON public._prisma_migrations FROM ost_app;
  END IF;
END $$;

-- Future objects created by migrations (ost_migrator) or by a break-glass hotfix run as postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE ost_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ost_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ost_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ost_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ost_migrator IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ost_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres     IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ost_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres     IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ost_app;
-- (ost_backup gets future tables automatically through pg_read_all_data.)

-- ---------------------------------------------------------------------------
-- 5. Destructive-op guard (defence in depth; also stops a superuser by accident)
--    * ost_app: ALL DDL blocked, always (it owns nothing anyway).
--    * everyone (superuser included): dropping a table, column, schema, view, matview, foreign table or
--      extension (DROP ..., DROP OWNED, CASCADE, ALTER TABLE ... DROP COLUMN) and TRUNCATE are blocked unless the session sets the break-glass GUC:
--          SET LOCAL ost.allow_destructive = '<CEO approval ref>';   -- inside the migration txn
--      or  PGOPTIONS='-c ost.allow_destructive=<ref>' psql ...
--      Each override is logged at WARNING with the ref and role.
--    * DROP DATABASE cannot be caught by event triggers; it is prevented for the app by
--      NOCREATEDB + not-owner, and for humans by the CI guard + AGENTS rule.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS ost_guard AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA ost_guard FROM PUBLIC;
GRANT USAGE ON SCHEMA ost_guard TO ost_migrator;

CREATE OR REPLACE FUNCTION ost_guard.override_ref() RETURNS text
LANGUAGE sql STABLE AS $f$
  SELECT nullif(btrim(coalesce(current_setting('ost.allow_destructive', true), '')), '')
$f$;

CREATE OR REPLACE FUNCTION ost_guard.block_ddl_start() RETURNS event_trigger
LANGUAGE plpgsql AS $f$
BEGIN
  -- The app role may run no DDL at all (it also owns nothing and has no CREATE).
  IF current_user = 'ost_app' OR session_user = 'ost_app' THEN
    RAISE EXCEPTION 'ost_guard: DDL (%) is not allowed for ost_app', tg_tag
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$f$;

-- DROP TABLE/SCHEMA/VIEW/OWNED/EXTENSION and ALTER TABLE ... DROP COLUMN are all caught at sql_drop,
-- which sees the actual objects (so temp-table drops and DROP INDEX/CONSTRAINT stay allowed).
-- Raising here aborts the statement and its transaction; nothing is dropped.
CREATE OR REPLACE FUNCTION ost_guard.block_sql_drop() RETURNS event_trigger
LANGUAGE plpgsql AS $f$
DECLARE ref text := ost_guard.override_ref(); o record;
BEGIN
  FOR o IN SELECT * FROM pg_event_trigger_dropped_objects()
           WHERE NOT is_temporary
             AND object_type IN ('table','table column','schema','view','materialized view','foreign table','extension')
             AND schema_name IS DISTINCT FROM 'pg_toast'
  LOOP
    IF ref IS NULL OR lower(ref) IN ('off','false','0','no') THEN
      RAISE EXCEPTION 'ost_guard: dropping % % blocked. Needs Drew''s OK via CEO; then SET LOCAL ost.allow_destructive = ''<approval ref>''',
        o.object_type, o.object_identity USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE WARNING 'ost_guard: dropped % % by override ref=% role=%', o.object_type, o.object_identity, ref, session_user;
  END LOOP;
END
$f$;

CREATE OR REPLACE FUNCTION ost_guard.block_truncate() RETURNS trigger
LANGUAGE plpgsql AS $f$
DECLARE ref text := ost_guard.override_ref();
BEGIN
  IF current_user = 'ost_app' OR session_user = 'ost_app'
     OR ref IS NULL OR lower(ref) IN ('off','false','0','no') THEN
    RAISE EXCEPTION 'ost_guard: TRUNCATE %.% blocked. Needs Drew''s OK via CEO', tg_table_schema, tg_table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RAISE WARNING 'ost_guard: TRUNCATE %.% allowed by override ref=% role=%', tg_table_schema, tg_table_name, ref, session_user;
  RETURN NULL;
END
$f$;

-- New tables created by future migrations get the TRUNCATE guard automatically.
CREATE OR REPLACE FUNCTION ost_guard.attach_truncate_guard() RETURNS event_trigger
LANGUAGE plpgsql AS $f$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM pg_event_trigger_ddl_commands()
           WHERE object_type = 'table' AND schema_name = 'public' AND command_tag IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = c.objid AND tgname = 'ost_guard_no_truncate') THEN
      EXECUTE format('CREATE TRIGGER ost_guard_no_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION ost_guard.block_truncate()', c.object_identity);
      EXECUTE format('ALTER TABLE %s ENABLE ALWAYS TRIGGER ost_guard_no_truncate', c.object_identity);
    END IF;
  END LOOP;
END
$f$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ost_guard FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ost_guard.block_truncate(), ost_guard.override_ref() TO ost_migrator;

DROP EVENT TRIGGER IF EXISTS ost_guard_ddl_start;
DROP EVENT TRIGGER IF EXISTS ost_guard_sql_drop;
DROP EVENT TRIGGER IF EXISTS ost_guard_attach_truncate;
CREATE EVENT TRIGGER ost_guard_ddl_start ON ddl_command_start EXECUTE FUNCTION ost_guard.block_ddl_start();
CREATE EVENT TRIGGER ost_guard_sql_drop  ON sql_drop          EXECUTE FUNCTION ost_guard.block_sql_drop();
CREATE EVENT TRIGGER ost_guard_attach_truncate ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  EXECUTE FUNCTION ost_guard.attach_truncate_guard();

-- Attach the TRUNCATE guard to every existing table (ENABLE ALWAYS: also fires under session_replication_role=replica).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.oid, format('%I.%I', n.nspname, c.relname) AS fq
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = r.oid AND tgname = 'ost_guard_no_truncate') THEN
      EXECUTE format('CREATE TRIGGER ost_guard_no_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION ost_guard.block_truncate()', r.fq);
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ALWAYS TRIGGER ost_guard_no_truncate', r.fq);
  END LOOP;
END $$;

COMMIT;

\echo 'roles.sql: done. Now run verify.sql, then switch DATABASE_URL (see README step 4).'
