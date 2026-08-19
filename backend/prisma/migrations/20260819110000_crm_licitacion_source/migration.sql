-- Vincula cada oportunidad CRM importada con su cotización de licitación de
-- origen. La relación es uno a uno para que el sincronizador sea idempotente.
ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN "cotizacion_licitacion_id" INTEGER;

CREATE UNIQUE INDEX "crm_registros_cotizacion_licitacion_id_key"
  ON "ventas"."crm_registros"("cotizacion_licitacion_id");

ALTER TABLE "ventas"."crm_registros"
  ADD CONSTRAINT "crm_registros_cotizacion_licitacion_id_fkey"
  FOREIGN KEY ("cotizacion_licitacion_id")
  REFERENCES "ventas"."cotizacion_licitacion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
