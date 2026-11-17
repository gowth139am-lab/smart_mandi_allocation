-- Optional, privileged DBA setup. Deliberately not run by application startup.
-- Creates a NOLOGIN role for narrowly scoped, read-only sales reporting.
-- Run only in an approved non-protected database after reviewing its target.
-- PostgreSQL roles are cluster-wide; the grants below apply only to this database.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'smart_mandi_test_market_prices' THEN
        RAISE EXCEPTION 'Refusing to provision reporting role in database %', current_database();
    END IF;
END
$$;

DO $$
DECLARE
    existing_role_oid OID;
BEGIN
    SELECT oid INTO existing_role_oid
    FROM pg_roles
    WHERE rolname = 'smart_mandi_report_reader';

    IF existing_role_oid IS NULL THEN
        EXECUTE 'CREATE ROLE smart_mandi_report_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
    ELSE
        IF EXISTS (
            SELECT 1
            FROM pg_roles
            WHERE oid = existing_role_oid
              AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
        ) OR EXISTS (
            SELECT 1
            FROM pg_auth_members
            WHERE roleid = existing_role_oid OR member = existing_role_oid
        ) THEN
            RAISE EXCEPTION 'Existing smart_mandi_report_reader role has unexpected attributes or memberships; no grants applied';
        END IF;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO smart_mandi_report_reader;
GRANT SELECT ON TABLE
    public.sales,
    public.sale_items,
    public.payments,
    public.produce_lots,
    public.crops,
    public.markets,
    public.sale_summary_view
TO smart_mandi_report_reader;

-- No LOGIN, write privileges, sequence privileges, schema CREATE, or membership
-- in this role are granted here. A DBA must separately approve any role membership.

-- Read-only verification after an explicitly approved execution:
-- SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
-- FROM pg_roles WHERE rolname = 'smart_mandi_report_reader';
-- SELECT table_schema, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE grantee = 'smart_mandi_report_reader'
-- ORDER BY table_name, privilege_type;

COMMIT;
