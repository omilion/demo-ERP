-- Quien aprueba la calidad de lo que sale de cada taller es su jefe, y hasta ahora no
-- habia forma de saber quien es: el rol `taller` gobierna todos los talleres por
-- igual, sin distinguir cual.
--
-- Queda opcional a proposito. Un taller sin jefe asignado no bloquea la operacion: la
-- coordinacion puede aprobar igual. Un control que nadie puede ejercer detiene el
-- trabajo en vez de ordenarlo.
ALTER TABLE "taller"."talleres"
  ADD COLUMN IF NOT EXISTS "jefe_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = 'taller'::regnamespace AND conname = 'talleres_jefe_id_fkey'
  ) THEN
    ALTER TABLE "taller"."talleres"
      ADD CONSTRAINT "talleres_jefe_id_fkey"
      FOREIGN KEY ("jefe_id") REFERENCES "auth"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "talleres_jefe_id_idx" ON "taller"."talleres" ("jefe_id");
