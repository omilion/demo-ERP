CREATE TABLE "bodega"."despacho_tracking_eventos" (
  "id" SERIAL NOT NULL,
  "despacho_id" INTEGER NOT NULL,
  "estado" TEXT NOT NULL,
  "transporte" TEXT,
  "ubicacion" TEXT,
  "observacion" TEXT,
  "fecha_evento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usuario" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "despacho_tracking_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "despacho_tracking_eventos_despacho_id_fecha_evento_idx"
  ON "bodega"."despacho_tracking_eventos"("despacho_id", "fecha_evento");

CREATE INDEX "despacho_tracking_eventos_estado_idx"
  ON "bodega"."despacho_tracking_eventos"("estado");

ALTER TABLE "bodega"."despacho_tracking_eventos"
  ADD CONSTRAINT "despacho_tracking_eventos_despacho_id_fkey"
  FOREIGN KEY ("despacho_id") REFERENCES "bodega"."despachos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
