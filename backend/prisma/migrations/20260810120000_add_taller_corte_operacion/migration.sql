ALTER TABLE "taller"."bitacora_taller"
  ADD COLUMN IF NOT EXISTS "ip_equipo" TEXT;

CREATE TABLE IF NOT EXISTS "taller"."odt_avances" (
  "id" SERIAL NOT NULL,
  "odt_item_taller_id" INTEGER NOT NULL,
  "cantidad_terminada" DOUBLE PRECISION NOT NULL,
  "fecha_trabajo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observacion" TEXT,
  "usuario" TEXT NOT NULL,
  "ip_equipo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "odt_avances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "taller"."taller_evidencias" (
  "id" SERIAL NOT NULL,
  "odt_id" INTEGER NOT NULL,
  "odt_item_taller_id" INTEGER NOT NULL,
  "archivo_url" TEXT NOT NULL,
  "nombre_archivo" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "usuario" TEXT NOT NULL,
  "ip_equipo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "taller_evidencias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "odt_avances_odt_item_taller_id_fecha_trabajo_idx"
  ON "taller"."odt_avances" ("odt_item_taller_id", "fecha_trabajo");
CREATE INDEX IF NOT EXISTS "taller_evidencias_odt_id_created_at_idx"
  ON "taller"."taller_evidencias" ("odt_id", "created_at");
CREATE INDEX IF NOT EXISTS "taller_evidencias_odt_item_taller_id_created_at_idx"
  ON "taller"."taller_evidencias" ("odt_item_taller_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odt_avances_odt_item_taller_id_fkey') THEN
    ALTER TABLE "taller"."odt_avances"
      ADD CONSTRAINT "odt_avances_odt_item_taller_id_fkey"
      FOREIGN KEY ("odt_item_taller_id") REFERENCES "taller"."odt_item_talleres"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taller_evidencias_odt_id_fkey') THEN
    ALTER TABLE "taller"."taller_evidencias"
      ADD CONSTRAINT "taller_evidencias_odt_id_fkey"
      FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taller_evidencias_odt_item_taller_id_fkey') THEN
    ALTER TABLE "taller"."taller_evidencias"
      ADD CONSTRAINT "taller_evidencias_odt_item_taller_id_fkey"
      FOREIGN KEY ("odt_item_taller_id") REFERENCES "taller"."odt_item_talleres"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "taller"."talleres" ("nombre", "activo")
VALUES ('Taller de Corte', true)
ON CONFLICT ("nombre") DO UPDATE SET "activo" = true;
