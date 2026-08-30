-- El catálogo histórico contiene códigos repetidos (incluidos valores de
-- relleno). No se puede imponer unicidad retrospectiva sin una decisión de
-- negocio por cada grupo; hacerlo bloquea `prisma migrate deploy`.
--
-- Las altas, actualizaciones del código e importaciones validan la unicidad en
-- la aplicación. Este índice normalizado conserva rendimiento de búsqueda sin
-- modificar ni invalidar productos históricos. Crear la restricción UNIQUE en
-- una migración posterior, después de depurar el catálogo.
CREATE INDEX "productos_codigo_barra_normalizado_idx"
  ON "catalogo"."productos" (LOWER(BTRIM("codigo_barra")))
  WHERE "codigo_barra" IS NOT NULL AND BTRIM("codigo_barra") <> '';
