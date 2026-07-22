-- Liga cada GuiaDespacho al Despacho (envio interno) que documenta, para
-- poder tomar las cantidades de packing de ese despacho al emitir la
-- Guia de Despacho Electronica (DTE 52).
ALTER TABLE "bodega"."guias_despachos" ADD COLUMN "despacho_id" INTEGER;

ALTER TABLE "bodega"."guias_despachos"
  ADD CONSTRAINT "guias_despachos_despacho_id_fkey"
  FOREIGN KEY ("despacho_id") REFERENCES "bodega"."despachos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guias_despachos_despacho_id_idx" ON "bodega"."guias_despachos"("despacho_id");
