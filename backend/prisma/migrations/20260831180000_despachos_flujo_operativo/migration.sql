-- Los despachos aislados no pertenecen a una venta; se acotan a la sucursal
-- que los creó y guardan su motivo sin inventar una orden comercial.
ALTER TABLE "bodega"."despachos"
  ADD COLUMN IF NOT EXISTS "sucursal_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "motivo_operacion" TEXT;

ALTER TABLE "bodega"."guias_despachos"
  ADD COLUMN IF NOT EXISTS "sucursal_id" INTEGER;

CREATE INDEX IF NOT EXISTS "despachos_sucursal_id_idx"
  ON "bodega"."despachos" ("sucursal_id");

CREATE INDEX IF NOT EXISTS "guias_despachos_sucursal_id_idx"
  ON "bodega"."guias_despachos" ("sucursal_id");
