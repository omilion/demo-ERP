CREATE TABLE "bodega"."packing_bultos" (
  "id" SERIAL NOT NULL,
  "orden_id" INTEGER NOT NULL,
  "despacho_id" INTEGER,
  "numero" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'Preparado',
  "observacion" TEXT,
  "usuario" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "packing_bultos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bodega"."packing_eventos" (
  "id" SERIAL NOT NULL,
  "orden_id" INTEGER NOT NULL,
  "orden_item_id" INTEGER NOT NULL,
  "despacho_id" INTEGER,
  "bulto_id" INTEGER,
  "cantidad_anterior" INTEGER NOT NULL,
  "cantidad_nueva" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "accion" TEXT NOT NULL DEFAULT 'ajuste',
  "observacion" TEXT,
  "usuario" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packing_eventos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "packing_bultos_orden_id_numero_key" ON "bodega"."packing_bultos"("orden_id", "numero");
CREATE INDEX "packing_bultos_despacho_id_idx" ON "bodega"."packing_bultos"("despacho_id");

CREATE INDEX "packing_eventos_orden_id_created_at_idx" ON "bodega"."packing_eventos"("orden_id", "created_at");
CREATE INDEX "packing_eventos_orden_item_id_created_at_idx" ON "bodega"."packing_eventos"("orden_item_id", "created_at");
CREATE INDEX "packing_eventos_despacho_id_idx" ON "bodega"."packing_eventos"("despacho_id");
CREATE INDEX "packing_eventos_bulto_id_idx" ON "bodega"."packing_eventos"("bulto_id");

ALTER TABLE "bodega"."packing_bultos"
  ADD CONSTRAINT "packing_bultos_orden_id_fkey"
  FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bodega"."packing_bultos"
  ADD CONSTRAINT "packing_bultos_despacho_id_fkey"
  FOREIGN KEY ("despacho_id") REFERENCES "bodega"."despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bodega"."packing_eventos"
  ADD CONSTRAINT "packing_eventos_orden_id_fkey"
  FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bodega"."packing_eventos"
  ADD CONSTRAINT "packing_eventos_orden_item_id_fkey"
  FOREIGN KEY ("orden_item_id") REFERENCES "ventas"."orden_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bodega"."packing_eventos"
  ADD CONSTRAINT "packing_eventos_despacho_id_fkey"
  FOREIGN KEY ("despacho_id") REFERENCES "bodega"."despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bodega"."packing_eventos"
  ADD CONSTRAINT "packing_eventos_bulto_id_fkey"
  FOREIGN KEY ("bulto_id") REFERENCES "bodega"."packing_bultos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
