-- Confirmacion de picking por linea (gate para packing) y dimensiones de bulto
ALTER TABLE "ventas"."orden_items"
  ADD COLUMN IF NOT EXISTS "picking_confirmado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "picking_observacion" TEXT,
  ADD COLUMN IF NOT EXISTS "picking_confirmado_por" TEXT,
  ADD COLUMN IF NOT EXISTS "picking_confirmado_at" TIMESTAMP(3);

ALTER TABLE "bodega"."packing_bultos"
  ADD COLUMN IF NOT EXISTS "dimensiones" TEXT,
  ADD COLUMN IF NOT EXISTS "peso" DOUBLE PRECISION;
