-- OTs internas: no provienen de una venta, pero deben imputarse a un centro de costo.
CREATE TABLE IF NOT EXISTS "taller"."centros_costo" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "centros_costo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "centros_costo_codigo_key" ON "taller"."centros_costo"("codigo");
CREATE INDEX IF NOT EXISTS "centros_costo_activo_idx" ON "taller"."centros_costo"("activo");

ALTER TABLE "taller"."odts" ADD COLUMN IF NOT EXISTS "centro_costo_id" INTEGER;
CREATE INDEX IF NOT EXISTS "odts_centro_costo_id_idx" ON "taller"."odts"("centro_costo_id");

DO $$ BEGIN
  ALTER TABLE "taller"."odts"
    ADD CONSTRAINT "odts_centro_costo_id_fkey"
    FOREIGN KEY ("centro_costo_id") REFERENCES "taller"."centros_costo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
