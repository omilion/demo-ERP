CREATE TABLE IF NOT EXISTS "catalogo"."producto_proveedores" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "ultima_compra" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "producto_proveedores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "producto_proveedores_producto_id_proveedor_id_key"
  ON "catalogo"."producto_proveedores"("producto_id", "proveedor_id");

CREATE INDEX IF NOT EXISTS "producto_proveedores_producto_id_idx"
  ON "catalogo"."producto_proveedores"("producto_id");

CREATE INDEX IF NOT EXISTS "producto_proveedores_proveedor_id_idx"
  ON "catalogo"."producto_proveedores"("proveedor_id");

ALTER TABLE "catalogo"."producto_proveedores"
  DROP CONSTRAINT IF EXISTS "producto_proveedores_producto_id_fkey";

ALTER TABLE "catalogo"."producto_proveedores"
  ADD CONSTRAINT "producto_proveedores_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalogo"."producto_proveedores"
  DROP CONSTRAINT IF EXISTS "producto_proveedores_proveedor_id_fkey";

ALTER TABLE "catalogo"."producto_proveedores"
  ADD CONSTRAINT "producto_proveedores_proveedor_id_fkey"
  FOREIGN KEY ("proveedor_id") REFERENCES "catalogo"."proveedores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
