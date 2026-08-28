-- Se ejecuta solo al inicializar un volumen nuevo de Postgres.
-- La base principal (POSTGRES_DB) es plastimar_dev; esta segunda base evita
-- que las suites de integracion limpien o alteren los datos de desarrollo.
SELECT 'CREATE DATABASE plastimar_test OWNER plastimar'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'plastimar_test'
)\gexec
