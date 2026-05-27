ALTER TABLE "catalogo"."pagos_proveedores"
  ADD COLUMN IF NOT EXISTS "stock_reversado_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eliminado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "user_mod" TEXT,
  ADD COLUMN IF NOT EXISTS "fecham" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "motivo_eliminacion" TEXT;

ALTER TABLE "catalogo"."detalle_facturas_proveedor"
  ADD COLUMN IF NOT EXISTS "nombre" TEXT,
  ADD COLUMN IF NOT EXISTS "unidad_medida" TEXT,
  ADD COLUMN IF NOT EXISTS "categoria_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "subcategoria_id" INTEGER;

CREATE INDEX IF NOT EXISTS "pagos_proveedores_eliminado_idx"
  ON "catalogo"."pagos_proveedores"("eliminado");

CREATE INDEX IF NOT EXISTS "pagos_proveedores_documento_n_doc_sucursal_idx"
  ON "catalogo"."pagos_proveedores"("documento", "n_doc", "sucursal_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        lower(coalesce("documento", '')) AS documento_key,
        lower(coalesce("n_doc", '')) AS n_doc_key,
        coalesce("proveedor_id", -1) AS proveedor_id_key,
        coalesce("codigo_proveedor", -1) AS codigo_proveedor_key,
        coalesce("sucursal_id", -1) AS sucursal_id_key,
        count(*) AS total
      FROM "catalogo"."pagos_proveedores"
      WHERE "eliminado" = false
        AND coalesce("estado", '') <> 'Anulado'
        AND nullif(trim(coalesce("n_doc", '')), '') IS NOT NULL
        AND ("proveedor_id" IS NOT NULL OR "codigo_proveedor" IS NOT NULL)
      GROUP BY 1, 2, 3, 4, 5
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "pagos_proveedores_doc_provider_active_uidx"
      ON "catalogo"."pagos_proveedores"(
        lower(coalesce("documento", '')),
        lower(coalesce("n_doc", '')),
        coalesce("proveedor_id", -1),
        coalesce("codigo_proveedor", -1),
        coalesce("sucursal_id", -1)
      )
      WHERE "eliminado" = false
        AND coalesce("estado", '') <> 'Anulado'
        AND nullif(trim(coalesce("n_doc", '')), '') IS NOT NULL
        AND ("proveedor_id" IS NOT NULL OR "codigo_proveedor" IS NOT NULL);
  END IF;
END $$;
