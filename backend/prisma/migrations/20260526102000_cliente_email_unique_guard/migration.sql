UPDATE "clientes"."clientes"
SET "email" = NULL
WHERE "email" IS NOT NULL AND btrim("email") = '';

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT lower(btrim("email")) AS normalized_email
    FROM "clientes"."clientes"
    WHERE "email" IS NOT NULL AND btrim("email") <> ''
    GROUP BY lower(btrim("email"))
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'clientes.email contiene % duplicados; limpiar datos antes de aplicar indice unico', duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "clientes_email_unique_not_empty"
ON "clientes"."clientes" (lower(btrim("email")))
WHERE "email" IS NOT NULL AND btrim("email") <> '';
