-- La etapa siguiente declara que recibio de la anterior: es la inspeccion de calidad
-- hecha por quien ya tiene el trabajo en la mano. Se registra por cantidad y no por
-- si/no, porque el defecto real es parcial y el resto sigue su camino.
CREATE TABLE IF NOT EXISTS "taller"."odt_etapa_recepciones" (
  "id"                 SERIAL PRIMARY KEY,
  "odt_item_taller_id" INTEGER NOT NULL,
  "cantidad_revisada"  DOUBLE PRECISION NOT NULL,
  "cantidad_aceptada"  DOUBLE PRECISION NOT NULL,
  "cantidad_rechazada" DOUBLE PRECISION NOT NULL,
  "defecto"            TEXT,
  "causa"              TEXT,
  "decision"           TEXT NOT NULL,
  "usuario"            TEXT NOT NULL,
  "usuario_id"         INTEGER,
  "ip_equipo"          TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "odt_etapa_recepciones_etapa_fkey"
    FOREIGN KEY ("odt_item_taller_id")
    REFERENCES "taller"."odt_item_talleres"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "odt_etapa_recepciones_etapa_fecha_idx"
  ON "taller"."odt_etapa_recepciones" ("odt_item_taller_id", "created_at");

-- Las cantidades tienen que cuadrar entre si: lo revisado es lo aceptado mas lo
-- rechazado. Sin esto, una recepcion mal capturada deja un saldo que nadie concilia.
ALTER TABLE "taller"."odt_etapa_recepciones"
  ADD CONSTRAINT "odt_etapa_recepciones_cantidades_cuadran"
  CHECK ("cantidad_aceptada" + "cantidad_rechazada" = "cantidad_revisada"
         AND "cantidad_aceptada" >= 0 AND "cantidad_rechazada" >= 0);
