-- Los ambientes fiscales oficiales no pueden repetir el mismo tipo/folio.
-- Los documentos QA históricos usan ambientes con prefijo `qa-` y contienen
-- duplicados intencionales; no se los modifica en un deploy productivo.
-- Así protegemos certificación y producción sin ocultar ni borrar evidencia QA.
CREATE UNIQUE INDEX IF NOT EXISTS "documentos_tipo_dte_ambiente_folio_oficial_unico_idx"
  ON "facturacion"."documentos" ("tipo_dte", "ambiente", "folio")
  WHERE "folio" IS NOT NULL
    AND "ambiente" IN ('certificacion', 'produccion');
