-- Las OTs internas se imputan a un centro de costo y no tienen orden de venta.
-- NOT VALID conserva los registros legacy sin origen, pero la regla se exige
-- para toda nueva escritura.
ALTER TABLE "taller"."odts"
  DROP CONSTRAINT IF EXISTS "odts_orden_id_required_new";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE connamespace = 'taller'::regnamespace
      AND conname = 'odts_origen_requerido_new'
  ) THEN
    ALTER TABLE "taller"."odts"
      ADD CONSTRAINT "odts_origen_requerido_new"
      CHECK ("orden_id" IS NOT NULL OR "centro_costo_id" IS NOT NULL) NOT VALID;
  END IF;
END $$;
