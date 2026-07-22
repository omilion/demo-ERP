-- Permite empacar (packing) directamente contra una Guia de Despacho, antes
-- de que esa guia tenga un Despacho (orden de transporte) asignado. El flujo
-- real: se elige que enviar y se genera la guia -> queda pendiente -> despues
-- se crea el despacho y se le asignan las guias pendientes.
ALTER TABLE "bodega"."packing_eventos" ADD COLUMN "guia_despacho_id" INTEGER;

ALTER TABLE "bodega"."packing_eventos"
  ADD CONSTRAINT "packing_eventos_guia_despacho_id_fkey"
  FOREIGN KEY ("guia_despacho_id") REFERENCES "bodega"."guias_despachos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "packing_eventos_guia_despacho_id_idx" ON "bodega"."packing_eventos"("guia_despacho_id");
