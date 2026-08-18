ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN IF NOT EXISTS "orden_compra_online_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "origen_dato" TEXT,
  ADD COLUMN IF NOT EXISTS "codigo_vendedor_legacy" TEXT,
  ADD COLUMN IF NOT EXISTS "es_historico" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "crm_registros_orden_compra_online_id_key"
  ON "ventas"."crm_registros"("orden_compra_online_id");
CREATE INDEX IF NOT EXISTS "crm_registros_origen_dato_idx"
  ON "ventas"."crm_registros"("origen_dato");
CREATE INDEX IF NOT EXISTS "crm_registros_es_historico_idx"
  ON "ventas"."crm_registros"("es_historico");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_registros_orden_compra_online_id_fkey'
  ) THEN
    ALTER TABLE "ventas"."crm_registros"
      ADD CONSTRAINT "crm_registros_orden_compra_online_id_fkey"
      FOREIGN KEY ("orden_compra_online_id")
      REFERENCES "ventas"."orden_compra_online"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
