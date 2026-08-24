-- El cargo describe la posicion comercial, no a la persona que la ocupa.
-- Vive junto al codigo de vendedor y no en la ficha de RRHH: cuando cambia
-- quien ocupa el puesto solo se actualizan los datos personales, y la cartera
-- y el cargo siguen con la cuenta.
ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "cargo" TEXT;
