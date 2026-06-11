ALTER TABLE "catalogo"."productos"
  ADD COLUMN IF NOT EXISTS "precio_licitacion" DOUBLE PRECISION;
