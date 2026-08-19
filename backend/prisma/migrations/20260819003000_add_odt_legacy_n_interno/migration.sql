-- Referencia estable al n_interno legacy (tabla MySQL `taller`), para poder
-- reconciliar/backfillear ODTs sin depender de texto libre en `descripcion`.
-- Idempotente: aplicada a mano en prod antes del deploy via CI.
ALTER TABLE "taller"."odts" ADD COLUMN IF NOT EXISTS "legacy_n_interno" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'taller' AND indexname = 'odts_legacy_n_interno_key'
  ) THEN
    CREATE UNIQUE INDEX "odts_legacy_n_interno_key" ON "taller"."odts"("legacy_n_interno");
  END IF;
END $$;
