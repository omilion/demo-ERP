ALTER TABLE "caja"."movimientos_caja"
  ADD COLUMN IF NOT EXISTS "origen_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "origen_id" INTEGER;

CREATE INDEX IF NOT EXISTS "movimientos_caja_turno_id_idx" ON "caja"."movimientos_caja"("turno_id");
CREATE INDEX IF NOT EXISTS "movimientos_caja_orden_id_idx" ON "caja"."movimientos_caja"("orden_id");
CREATE INDEX IF NOT EXISTS "movimientos_caja_gasto_tipo_id_idx" ON "caja"."movimientos_caja"("gasto_tipo_id");
CREATE INDEX IF NOT EXISTS "movimientos_caja_origen_tipo_origen_id_idx" ON "caja"."movimientos_caja"("origen_tipo", "origen_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_caja_orden_id_fkey'
      AND conrelid = '"caja"."movimientos_caja"'::regclass
  ) THEN
    ALTER TABLE "caja"."movimientos_caja"
      ADD CONSTRAINT "movimientos_caja_orden_id_fkey"
      FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
