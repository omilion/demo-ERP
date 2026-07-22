-- taller.telas nacio en 20260514082927_add_legacy_completeness con 8 columnas.
-- Despues se agregaron 6 campos al modelo Tela de schema.prisma sin crear la
-- migracion correspondiente, asi que toda base creada desde el historial (CI y
-- produccion) quedo sin ellas. El cliente Prisma si las consulta, por lo que
-- cualquier query que incluya telas falla con P2022 "column does not exist"
-- (era el 500 de /api/costeo/recetas, que trae la tela de cada linea de receta).
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "proveedor" TEXT;
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "ancho" DOUBLE PRECISION;
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "gramaje" DOUBLE PRECISION;
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "precio" DOUBLE PRECISION;
ALTER TABLE "taller"."telas" ADD COLUMN IF NOT EXISTS "stock_min" DOUBLE PRECISION NOT NULL DEFAULT 0;
