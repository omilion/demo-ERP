-- Cruce de codigos: el codigo con el que un proveedor identifica un
-- producto en su propia guia/factura casi nunca coincide con nuestro
-- codigo_interno. Se guarda por (producto, proveedor) para resolver
-- automaticamente futuras compras del mismo proveedor.
ALTER TABLE "catalogo"."producto_proveedores"
  ADD COLUMN IF NOT EXISTS "codigo_proveedor" TEXT;

CREATE INDEX IF NOT EXISTS "producto_proveedores_proveedor_id_codigo_proveedor_idx"
  ON "catalogo"."producto_proveedores"("proveedor_id", "codigo_proveedor");
