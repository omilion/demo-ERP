ALTER TABLE "bodega"."despachos"
  ADD COLUMN IF NOT EXISTS "odt_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "origen_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "origen_id" INTEGER;

ALTER TABLE "bodega"."guias_despachos"
  ADD COLUMN IF NOT EXISTS "odt_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "origen_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "origen_id" INTEGER;

CREATE INDEX IF NOT EXISTS "despachos_odt_id_idx" ON "bodega"."despachos"("odt_id");
CREATE INDEX IF NOT EXISTS "despachos_origen_tipo_origen_id_idx" ON "bodega"."despachos"("origen_tipo", "origen_id");
CREATE INDEX IF NOT EXISTS "guias_despachos_odt_id_idx" ON "bodega"."guias_despachos"("odt_id");
CREATE INDEX IF NOT EXISTS "guias_despachos_origen_tipo_origen_id_idx" ON "bodega"."guias_despachos"("origen_tipo", "origen_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despachos_odt_id_fkey'
      AND conrelid = '"bodega"."despachos"'::regclass
  ) THEN
    ALTER TABLE "bodega"."despachos"
      ADD CONSTRAINT "despachos_odt_id_fkey"
      FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guias_despachos_odt_id_fkey'
      AND conrelid = '"bodega"."guias_despachos"'::regclass
  ) THEN
    ALTER TABLE "bodega"."guias_despachos"
      ADD CONSTRAINT "guias_despachos_odt_id_fkey"
      FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
