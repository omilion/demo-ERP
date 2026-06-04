ALTER TABLE "bodega"."despacho_tracking_eventos"
  ADD COLUMN IF NOT EXISTS "tipo_incidente" TEXT,
  ADD COLUMN IF NOT EXISTS "accion_tomada" TEXT,
  ADD COLUMN IF NOT EXISTS "responsable" TEXT,
  ADD COLUMN IF NOT EXISTS "fecha_compromiso" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "despacho_tracking_eventos_estado_fecha_compromiso_idx"
  ON "bodega"."despacho_tracking_eventos"("estado", "fecha_compromiso");
