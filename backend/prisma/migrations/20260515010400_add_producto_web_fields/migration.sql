-- AlterTable
ALTER TABLE "catalogo"."productos"
  ADD COLUMN IF NOT EXISTS "foto_url" TEXT,
  ADD COLUMN IF NOT EXISTS "foto_url_grande" TEXT,
  ADD COLUMN IF NOT EXISTS "descripcion_web" TEXT,
  ADD COLUMN IF NOT EXISTS "precio_web" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "orden_web" INTEGER,
  ADD COLUMN IF NOT EXISTS "destacado_web" BOOLEAN NOT NULL DEFAULT false;
