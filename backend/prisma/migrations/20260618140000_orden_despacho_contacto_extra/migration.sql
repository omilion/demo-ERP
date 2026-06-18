-- Despacho a nivel de venta: separa el telefono del contacto y agrega datos
-- extra de direccion. Idempotente para CI/dev y `prisma migrate deploy`.

ALTER TABLE "ventas"."ordenes"
  ADD COLUMN IF NOT EXISTS "direccion_despacho_extra" TEXT,
  ADD COLUMN IF NOT EXISTS "telefono_contacto_despacho" TEXT;
