-- Detalle libre de la materia prima (marca, formato, observacion).
ALTER TABLE "taller"."bodega_taller"
  ADD COLUMN IF NOT EXISTS "detalle" TEXT;
