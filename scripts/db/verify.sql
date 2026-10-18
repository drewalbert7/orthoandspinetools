-- Read-only checks after roles.sql. Prints PASS/FAIL lines; exits non-zero on any FAIL.
--   docker exec -i orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -v ON_ERROR_STOP=1 -At -f - < verify.sql
\set ON_ERROR_STOP on
CREATE TEMP TABLE _v(check_name text, ok boolean, detail text);

INSERT INTO _v SELECT 'roles exist', count(*) = 3, string_agg(rolname, ',')
  FROM pg_roles WHERE rolname IN ('ost_app','ost_migrator','ost_backup');
INSERT INTO _v SELECT 'no elevated attrs on ost_*', bool_and(NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)), string_agg(rolname, ',')
  FROM pg_roles WHERE rolname IN ('ost_app','ost_migrator','ost_backup');
INSERT INTO _v SELECT 'ost_backup in pg_read_all_data', pg_has_role('ost_backup','pg_read_all_data','MEMBER'), '';
INSERT INTO _v SELECT 'ost_app not in any pg_* write role',
  NOT (pg_has_role('ost_app','pg_write_all_data','MEMBER') OR pg_has_role('ost_app','pg_read_server_files','MEMBER')), '';
INSERT INTO _v SELECT 'app objects owned by ost_migrator', count(*) = 0, coalesce(string_agg(relname, ','), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')
    AND pg_get_userbyid(c.relowner) <> 'ost_migrator'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e');
INSERT INTO _v SELECT 'ost_app owns nothing', count(*) = 0, '' FROM pg_class WHERE relowner = 'ost_app'::regrole;
INSERT INTO _v SELECT 'PUBLIC has no CREATE on schema public', NOT has_schema_privilege('public', 'public', 'CREATE'), '';
INSERT INTO _v SELECT 'ost_app no CREATE on schema public', NOT has_schema_privilege('ost_app', 'public', 'CREATE'), '';
INSERT INTO _v SELECT 'ost_app no TEMP on db', NOT has_database_privilege('ost_app', current_database(), 'TEMP'), '';
INSERT INTO _v SELECT 'ost_app DML on every app table', count(*) = 0, coalesce(string_agg(tablename, ','), '')
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
   AND NOT (has_table_privilege('ost_app', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE'));
INSERT INTO _v SELECT 'ost_app no TRUNCATE/TRIGGER/REFERENCES anywhere', count(*) = 0, coalesce(string_agg(tablename, ','), '')
  FROM pg_tables WHERE schemaname = 'public'
   AND has_table_privilege('ost_app', format('%I.%I', schemaname, tablename), 'TRUNCATE,TRIGGER,REFERENCES');
INSERT INTO _v SELECT 'ost_backup SELECT on every table', count(*) = 0, coalesce(string_agg(tablename, ','), '')
  FROM pg_tables WHERE schemaname = 'public' AND NOT has_table_privilege('ost_backup', format('%I.%I', schemaname, tablename), 'SELECT');
INSERT INTO _v SELECT 'ost_backup no write', count(*) = 0, coalesce(string_agg(tablename, ','), '')
  FROM pg_tables WHERE schemaname = 'public' AND has_table_privilege('ost_backup', format('%I.%I', schemaname, tablename), 'INSERT,UPDATE,DELETE,TRUNCATE');
INSERT INTO _v SELECT 'event triggers enabled', count(*) = 3, string_agg(evtname || ':' || evtenabled::text, ',')
  FROM pg_event_trigger WHERE evtname LIKE 'ost_guard_%' AND evtenabled = 'O';
INSERT INTO _v SELECT 'truncate guard on every table (ENABLE ALWAYS)', count(*) = 0, coalesce(string_agg(c.relname, ','), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'ost_guard_no_truncate' AND t.tgenabled = 'A');
INSERT INTO _v SELECT 'PUBLIC cannot CONNECT to app db', NOT EXISTS (
  SELECT 1 FROM pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
  WHERE d.datname = current_database() AND a.grantee = 0 AND a.privilege_type = 'CONNECT'), '';
INSERT INTO _v SELECT 'superuser count', count(*) = 1, string_agg(rolname, ',') FROM pg_roles WHERE rolsuper;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || '  ' || check_name || CASE WHEN detail <> '' AND NOT ok THEN '  [' || detail || ']' ELSE '' END FROM _v;
SELECT count(*) FILTER (WHERE NOT ok) = 0 AS all_ok FROM _v \gset
\if :all_ok
  \echo 'verify.sql: ALL PASS'
\else
  DO $$ BEGIN RAISE EXCEPTION 'verify.sql: failures above'; END $$;
\endif
