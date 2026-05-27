ALTER TABLE "bodega"."despachos"
  ADD COLUMN IF NOT EXISTS "eliminado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "user_mod" TEXT,
  ADD COLUMN IF NOT EXISTS "fecham" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "motivo_eliminacion" TEXT;

ALTER TABLE "bodega"."guias_despachos"
  ADD COLUMN IF NOT EXISTS "eliminado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "user_mod" TEXT,
  ADD COLUMN IF NOT EXISTS "fecham" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "motivo_eliminacion" TEXT;

CREATE INDEX IF NOT EXISTS "despachos_eliminado_idx" ON "bodega"."despachos"("eliminado");
CREATE INDEX IF NOT EXISTS "guias_despachos_eliminado_idx" ON "bodega"."guias_despachos"("eliminado");
