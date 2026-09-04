-- Reparar calculo de neto e iva en pagos_proveedores para variantes de 'factura' (minusculas o con espacios).
-- Solo recalcula neto e iva de filas de facturas con total > 0 que habian quedado con iva = 0.
-- No modifica abonos, ni monto_pagado, ni saldo actual.
UPDATE "catalogo"."pagos_proveedores"
SET
  "neto" = round(("total" / 1.19)::numeric, 2),
  "iva"  = round(("total" - ("total" / 1.19))::numeric, 2)
WHERE "total" > 0
  AND "documento" IS NOT NULL
  AND LOWER(BTRIM("documento")) = 'factura'
  AND (COALESCE("iva", 0) = 0 OR "neto" = round("total"::numeric, 2));
