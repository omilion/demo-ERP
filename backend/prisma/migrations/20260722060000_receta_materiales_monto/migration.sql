-- Monto de materiales sin desglose, para las recetas importadas del Excel
-- legacy (espuma y tela vienen totalizadas, sin precio unitario utilizable).
ALTER TABLE "taller"."producto_recetas"
  ADD COLUMN IF NOT EXISTS "materiales_monto" DOUBLE PRECISION NOT NULL DEFAULT 0;
