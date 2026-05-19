ALTER TABLE "bodega"."movimientos"
  ADD COLUMN IF NOT EXISTS "orden_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "odt_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "pago_proveedor_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "origen_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "origen_id" INTEGER;

CREATE INDEX IF NOT EXISTS "movimientos_orden_id_idx" ON "bodega"."movimientos"("orden_id");
CREATE INDEX IF NOT EXISTS "movimientos_odt_id_idx" ON "bodega"."movimientos"("odt_id");
CREATE INDEX IF NOT EXISTS "movimientos_pago_proveedor_id_idx" ON "bodega"."movimientos"("pago_proveedor_id");
CREATE INDEX IF NOT EXISTS "movimientos_origen_tipo_origen_id_idx" ON "bodega"."movimientos"("origen_tipo", "origen_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_orden_id_fkey'
      AND conrelid = '"bodega"."movimientos"'::regclass
  ) THEN
    ALTER TABLE "bodega"."movimientos"
      ADD CONSTRAINT "movimientos_orden_id_fkey"
      FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_odt_id_fkey'
      AND conrelid = '"bodega"."movimientos"'::regclass
  ) THEN
    ALTER TABLE "bodega"."movimientos"
      ADD CONSTRAINT "movimientos_odt_id_fkey"
      FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_pago_proveedor_id_fkey'
      AND conrelid = '"bodega"."movimientos"'::regclass
  ) THEN
    ALTER TABLE "bodega"."movimientos"
      ADD CONSTRAINT "movimientos_pago_proveedor_id_fkey"
      FOREIGN KEY ("pago_proveedor_id") REFERENCES "catalogo"."pagos_proveedores"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
