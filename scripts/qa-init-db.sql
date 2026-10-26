-- ==============================================================================
-- POLINTRACK QA POSTGRESQL INITIALIZATION SCRIPT (DOCKER LOCAL)
-- ==============================================================================
-- Executed automatically by PostgreSQL container entrypoint on initial volume creation.
-- Configures the application role required by canonical RLS policies (QA-01).

\connect polintrack_test;

-- 1. Create application role without superuser, without bypassrls
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'polintrack_admin') THEN
    CREATE ROLE polintrack_admin WITH 
      LOGIN 
      NOSUPERUSER 
      NOCREATEDB 
      NOCREATEROLE 
      NOINHERIT 
      NOREPLICATION 
      NOBYPASSRLS 
      PASSWORD 'PtApp2026_LocalTestAdmin!';
  END IF;
END
$$;

-- 2. Grant database privileges to application role
GRANT CONNECT, TEMPORARY ON DATABASE polintrack_test TO polintrack_admin;

-- 3. Schema permissions
CREATE SCHEMA IF NOT EXISTS public;
GRANT USAGE, CREATE ON SCHEMA public TO polintrack_admin;

-- 4. Default privileges for future migration objects
ALTER DEFAULT PRIVILEGES FOR ROLE qa_root IN SCHEMA public GRANT ALL ON TABLES TO polintrack_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE qa_root IN SCHEMA public GRANT ALL ON SEQUENCES TO polintrack_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE qa_root IN SCHEMA public GRANT ALL ON ROUTINES TO polintrack_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE polintrack_admin IN SCHEMA public GRANT ALL ON TABLES TO polintrack_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE polintrack_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO polintrack_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE polintrack_admin IN SCHEMA public GRANT ALL ON ROUTINES TO polintrack_admin;
