-- Dijalankan SEKALI oleh superuser PostgreSQL per lingkungan (bukan oleh aplikasi).
-- Mengganti variabel psql: -v owner_password=... -v app_password=... -v dbname=...
--   psql -v ON_ERROR_STOP=1 -v dbname=teone_dev -v owner_password='…' -v app_password='…' -f db/init-roles.sql
-- Password diberikan lewat variabel psql / secret manager — jangan ditulis di berkas ini.

SELECT format('CREATE ROLE teone_owner LOGIN PASSWORD %L', :'owner_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'teone_owner') \gexec
SELECT format('CREATE ROLE teone_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'teone_app') \gexec

SELECT format('CREATE DATABASE %I OWNER teone_owner', :'dbname')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname') \gexec

\connect :dbname
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO teone_app;
ALTER SCHEMA public OWNER TO teone_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO teone_app;
