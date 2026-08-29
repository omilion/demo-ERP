ALTER TABLE "catalogo"."productos"
  ADD COLUMN "stock_reservado" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stock_danado" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "bodega"."movimientos"
  ADD COLUMN "stock_anterior" INTEGER,
  ADD COLUMN "stock_posterior" INTEGER,
  ADD COLUMN "reservado_delta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "danado_delta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reservado_final" INTEGER,
  ADD COLUMN "danado_final" INTEGER;

ALTER TABLE "catalogo"."productos"
  ADD CONSTRAINT "productos_stock_reservado_no_negativo" CHECK ("stock_reservado" >= 0),
  ADD CONSTRAINT "productos_stock_danado_no_negativo" CHECK ("stock_danado" >= 0),
  ADD CONSTRAINT "productos_stock_comprometido_valido" CHECK (("stock_reservado" + "stock_danado") <= "stock");

CREATE INDEX "productos_stock_operacional_idx"
  ON "catalogo"."productos" ("stock", "stock_reservado", "stock_danado", "stock_critico");

COMMENT ON TABLE "bodega"."movimientos" IS
  'Kardex append-only: la aplicacion solo expone lectura y creacion; cada fila conserva saldos antes/despues.';
