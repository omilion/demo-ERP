-- Vincula un Trabajador (ficha RRHH) con su cuenta de login (auth.users),
-- para poder saber "quien soy yo" en el taller cuando se asigna una tarea.
-- Antes el dropdown de asignar operario guardaba el id de Trabajador en un
-- campo (odt_item_talleres.operario_responsable_id) que apunta a auth.users
-- - ids de tablas distintas, sin relacion real. Aditivo y nullable: no rompe
-- datos existentes.
ALTER TABLE "rrhh"."trabajadores"
  ADD COLUMN IF NOT EXISTS "usuario_id" INTEGER;

ALTER TABLE "rrhh"."trabajadores"
  ADD CONSTRAINT "trabajadores_usuario_id_key" UNIQUE ("usuario_id");

ALTER TABLE "rrhh"."trabajadores"
  ADD CONSTRAINT "trabajadores_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
