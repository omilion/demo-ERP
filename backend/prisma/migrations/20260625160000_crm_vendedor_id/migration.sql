-- Visibilidad por vendedor en el CRM: cada registro puede tener un vendedor dueño.
-- Permite que un vendedor vea solo sus leads y el admin asigne/los vea todos.
-- Idempotente. Registros legacy quedan en NULL (solo visibles para admin).

ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN IF NOT EXISTS "vendedor_id" INTEGER;

CREATE INDEX IF NOT EXISTS "crm_registros_vendedor_id_idx"
  ON "ventas"."crm_registros" ("vendedor_id");
