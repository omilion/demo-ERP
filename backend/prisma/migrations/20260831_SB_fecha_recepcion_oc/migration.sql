-- Primer hito real de recepción: no se sobreescribe en recepciones parciales.
-- Permite medir OC → recepción sin inferir fechas desde updated_at.
ALTER TABLE "bodega"."ordenes_compra_proveedores"
  ADD COLUMN IF NOT EXISTS "fecha_recepcion" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ordenes_compra_proveedores_fecha_recepcion_idx"
  ON "bodega"."ordenes_compra_proveedores" ("fecha_recepcion");
