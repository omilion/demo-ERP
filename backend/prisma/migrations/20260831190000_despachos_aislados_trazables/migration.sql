-- Un despacho sigue ligado a una venta salvo la excepción explícita de bodega.
-- NOT VALID conserva filas históricas, pero PostgreSQL exige la regla en toda
-- escritura nueva y evita despachos huérfanos sin motivo.
ALTER TABLE "bodega"."despachos"
  DROP CONSTRAINT IF EXISTS "despachos_orden_id_required_new";

ALTER TABLE "bodega"."despachos"
  ADD CONSTRAINT "despachos_origen_requerido_new"
  CHECK (
    "orden_id" IS NOT NULL
    OR (
      "origen_tipo" = 'manual'
      AND "motivo_operacion" IS NOT NULL
      AND btrim("motivo_operacion") <> ''
    )
  ) NOT VALID;
