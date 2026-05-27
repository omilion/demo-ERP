ALTER TABLE "ventas"."cobranza_historico"
  ADD COLUMN IF NOT EXISTS "orden_id" INTEGER;

CREATE INDEX IF NOT EXISTS "cobranza_historico_orden_id_idx"
  ON "ventas"."cobranza_historico"("orden_id");

ALTER TABLE "ventas"."cotizacion_licitacion"
  ADD COLUMN IF NOT EXISTS "orden_id" INTEGER;

CREATE INDEX IF NOT EXISTS "cotizacion_licitacion_orden_id_idx"
  ON "ventas"."cotizacion_licitacion"("orden_id");
