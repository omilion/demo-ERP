CREATE UNIQUE INDEX "productos_codigo_barra_unico_idx"
  ON "catalogo"."productos" (LOWER(BTRIM("codigo_barra")))
  WHERE "codigo_barra" IS NOT NULL AND BTRIM("codigo_barra") <> '';
