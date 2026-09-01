ALTER TABLE "taller"."bodega_taller" ADD COLUMN IF NOT EXISTS "densidad_kg_m3" DOUBLE PRECISION;
ALTER TABLE "taller"."bodega_taller" ADD COLUMN IF NOT EXISTS "espesor_mm" DOUBLE PRECISION;
ALTER TABLE "taller"."bodega_taller" ADD COLUMN IF NOT EXISTS "formato" TEXT;

CREATE TABLE IF NOT EXISTS "taller"."bodega_taller_lotes" (
  "id" SERIAL NOT NULL, "bodega_taller_id" INTEGER NOT NULL, "codigo" TEXT NOT NULL,
  "cantidad_inicial" DOUBLE PRECISION NOT NULL, "cantidad_disponible" DOUBLE PRECISION NOT NULL,
  "estado_calidad" TEXT NOT NULL DEFAULT 'aprobado', "observacion" TEXT,
  "recibido_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bodega_taller_lotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bodega_taller_lotes_bodega_taller_id_fkey" FOREIGN KEY ("bodega_taller_id") REFERENCES "taller"."bodega_taller"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bodega_taller_lotes_bodega_taller_id_codigo_key" ON "taller"."bodega_taller_lotes"("bodega_taller_id", "codigo");
CREATE INDEX IF NOT EXISTS "bodega_taller_lotes_bodega_taller_id_estado_calidad_idx" ON "taller"."bodega_taller_lotes"("bodega_taller_id", "estado_calidad");
ALTER TABLE "taller"."taller_historial_materiales" ADD COLUMN IF NOT EXISTS "lote_codigo" TEXT;
ALTER TABLE "taller"."taller_historial_materiales" ADD COLUMN IF NOT EXISTS "calidad" TEXT;
ALTER TABLE "taller"."taller_historial_materiales" ADD COLUMN IF NOT EXISTS "merma_cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "taller"."taller_historial_materiales" ADD COLUMN IF NOT EXISTS "merma_motivo" TEXT;
