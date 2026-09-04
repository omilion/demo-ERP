-- Eliminar constraint residual bitacora_taller_odt_id_required_new de forma segura e idempotente.
-- La bitacora general de taller admite registros operativos diarios independientes sin ODT obligatoria.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bitacora_taller_odt_id_required_new'
      AND conrelid = 'taller.bitacora_taller'::regclass
  ) THEN
    ALTER TABLE "taller"."bitacora_taller"
      DROP CONSTRAINT "bitacora_taller_odt_id_required_new";
  END IF;
END $$;
