-- La aprobacion de descuentos es una facultad separada de aplicar o administrar
-- descuentos. Se inicia desactivada para todos los usuarios existentes.
ALTER TABLE "auth"."users"
  ADD COLUMN IF NOT EXISTS "permiso_aprobar_descuentos" BOOLEAN NOT NULL DEFAULT false;

-- El historial no se reescribe: cada version conserva quien la creo y quien la
-- emitio. Las reglas anteriores permanecen con autor desconocido (NULL).
ALTER TABLE "ventas"."descuento_reglas"
  ADD COLUMN IF NOT EXISTS "creado_por_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "modificado_por_id" INTEGER;

CREATE INDEX IF NOT EXISTS "descuento_reglas_creado_por_id_idx"
  ON "ventas"."descuento_reglas"("creado_por_id");

CREATE INDEX IF NOT EXISTS "descuento_reglas_modificado_por_id_idx"
  ON "ventas"."descuento_reglas"("modificado_por_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'descuento_reglas_creado_por_id_fkey'
  ) THEN
    ALTER TABLE "ventas"."descuento_reglas"
      ADD CONSTRAINT "descuento_reglas_creado_por_id_fkey"
      FOREIGN KEY ("creado_por_id") REFERENCES "auth"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'descuento_reglas_modificado_por_id_fkey'
  ) THEN
    ALTER TABLE "ventas"."descuento_reglas"
      ADD CONSTRAINT "descuento_reglas_modificado_por_id_fkey"
      FOREIGN KEY ("modificado_por_id") REFERENCES "auth"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
