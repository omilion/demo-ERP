-- Campos de receptor, ciudad e items para despachos y guias aislados
ALTER TABLE "bodega"."despachos"
  ADD COLUMN IF NOT EXISTS "ciudad" TEXT,
  ADD COLUMN IF NOT EXISTS "receptor_rut" TEXT,
  ADD COLUMN IF NOT EXISTS "receptor_razon_social" TEXT,
  ADD COLUMN IF NOT EXISTS "receptor_giro" TEXT,
  ADD COLUMN IF NOT EXISTS "items" JSONB DEFAULT '[]'::jsonb;

ALTER TABLE "bodega"."guias_despachos"
  ADD COLUMN IF NOT EXISTS "items" JSONB DEFAULT '[]'::jsonb;

-- Permitir despachos y guias aisladas sin asociar orden_id
ALTER TABLE "bodega"."despachos"
  DROP CONSTRAINT IF EXISTS "despachos_orden_id_required_new";

ALTER TABLE "bodega"."guias_despachos"
  DROP CONSTRAINT IF EXISTS "guias_despachos_orden_id_required_new";

CREATE INDEX IF NOT EXISTS "documentos_guia_despacho_id_idx"
  ON "facturacion"."documentos" ("guia_despacho_id");
