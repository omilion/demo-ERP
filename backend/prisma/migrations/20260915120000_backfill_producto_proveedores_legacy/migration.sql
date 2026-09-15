-- Los productos legacy guardan el proveedor en productos.proveedor_id.
-- La tabla normalizada se creó después y no recibió un backfill, por lo que
-- el módulo de compras no podía descubrir esos productos.
--
-- Solo insertamos relaciones que no existen. No reactivamos relaciones que
-- alguien haya desactivado ni sobrescribimos costos/cantidades mantenidos
-- manualmente. El stock legacy se atribuye inicialmente a su proveedor
-- directo porque no existe un desglose histórico por proveedor.
INSERT INTO "catalogo"."producto_proveedores" (
  "producto_id",
  "proveedor_id",
  "costo",
  "cantidad",
  "activo"
)
SELECT
  p."id",
  p."proveedor_id",
  COALESCE(p."precio_lista", 0),
  GREATEST(COALESCE(p."stock", 0), 0),
  true
FROM "catalogo"."productos" p
JOIN "catalogo"."proveedores" pr
  ON pr."id" = p."proveedor_id"
WHERE p."proveedor_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "catalogo"."producto_proveedores" pp
    WHERE pp."producto_id" = p."id"
      AND pp."proveedor_id" = p."proveedor_id"
  );
