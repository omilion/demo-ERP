ALTER TABLE "facturacion"."documentos"
  ADD COLUMN IF NOT EXISTS "detalles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "comisiones" JSONB NOT NULL DEFAULT '[]'::jsonb;
