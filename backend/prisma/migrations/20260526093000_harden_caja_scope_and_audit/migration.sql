ALTER TABLE "caja"."turnos"
  ADD COLUMN IF NOT EXISTS "cerrado_por_id" INTEGER;

ALTER TABLE "caja"."movimientos_caja"
  ADD COLUMN IF NOT EXISTS "sucursal_id" INTEGER;

UPDATE "caja"."movimientos_caja" mc
SET "sucursal_id" = c."sucursal_id"
FROM "caja"."turnos" t
JOIN "caja"."cajas" c ON c."id" = t."caja_id"
WHERE mc."turno_id" = t."id"
  AND mc."sucursal_id" IS NULL;

CREATE INDEX IF NOT EXISTS "movimientos_caja_sucursal_id_idx"
  ON "caja"."movimientos_caja"("sucursal_id");

ALTER TABLE "caja"."cierres_caja"
  ADD COLUMN IF NOT EXISTS "cerrado_por_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "cerrado_por_nombre" TEXT;
