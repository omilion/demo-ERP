-- El modelo CrmRegistro declara `comentarios` pero la columna nunca se creo en
-- la tabla, dejando toda lectura del CRM con error P2022 (500). Se agrega aqui.
ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN IF NOT EXISTS "comentarios" TEXT;
