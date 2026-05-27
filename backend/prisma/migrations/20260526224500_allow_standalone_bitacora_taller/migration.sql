-- Legacy bitacora_taller is a daily activity log and many valid rows do not
-- belong to an ODT. Keep the optional FK for traced rows, but allow standalone
-- rows created from the module itself and imported from legacy.

ALTER TABLE "taller"."bitacora_taller"
  ALTER COLUMN "odt_id" DROP NOT NULL;

ALTER TABLE "taller"."bitacora_taller"
  DROP CONSTRAINT IF EXISTS "bitacora_taller_odt_id_required_new";
