CREATE TABLE IF NOT EXISTS "catalogo"."ubicaciones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ubicaciones_nombre_key"
  ON "catalogo"."ubicaciones"("nombre");

ALTER TABLE "catalogo"."productos"
  ADD COLUMN IF NOT EXISTS "ubicacion_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "descripcion_licitacion" TEXT,
  ADD COLUMN IF NOT EXISTS "link_compra" TEXT,
  ADD COLUMN IF NOT EXISTS "edad" TEXT,
  ADD COLUMN IF NOT EXISTS "materialidad" TEXT;

CREATE INDEX IF NOT EXISTS "productos_ubicacion_id_idx"
  ON "catalogo"."productos"("ubicacion_id");

ALTER TABLE "catalogo"."productos"
  DROP CONSTRAINT IF EXISTS "productos_ubicacion_id_fkey";

ALTER TABLE "catalogo"."productos"
  ADD CONSTRAINT "productos_ubicacion_id_fkey"
  FOREIGN KEY ("ubicacion_id") REFERENCES "catalogo"."ubicaciones"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "catalogo"."ubicaciones" ("nombre")
SELECT DISTINCT btrim("ubicacion")
FROM "catalogo"."productos"
WHERE "ubicacion" IS NOT NULL AND btrim("ubicacion") <> ''
ON CONFLICT ("nombre") DO NOTHING;

UPDATE "catalogo"."productos" p
SET "ubicacion_id" = u."id"
FROM "catalogo"."ubicaciones" u
WHERE p."ubicacion_id" IS NULL
  AND p."ubicacion" IS NOT NULL
  AND btrim(p."ubicacion") = u."nombre";
