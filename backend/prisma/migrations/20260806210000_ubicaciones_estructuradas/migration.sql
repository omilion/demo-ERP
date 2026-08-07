-- Nomenclatura estructurada de ubicaciones de bodega (5 campos ordinales):
-- Sucursal / Area / Estante / Cuerpo / Nivel. Columnas nullable a proposito:
-- las ubicaciones legacy en texto libre siguen validas sin backfill forzado,
-- solo las ubicaciones nuevas se crean con estos campos poblados.
ALTER TABLE "catalogo"."ubicaciones"
  ADD COLUMN IF NOT EXISTS "sucursal" TEXT,
  ADD COLUMN IF NOT EXISTS "area" TEXT,
  ADD COLUMN IF NOT EXISTS "estante" TEXT,
  ADD COLUMN IF NOT EXISTS "cuerpo" TEXT,
  ADD COLUMN IF NOT EXISTS "nivel" TEXT;
