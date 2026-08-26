-- La relacion Orden -> Cliente ya existia en la base como foreign key con
-- RESTRICT, pero el modelo de Prisma no la declaraba: solo tenia `clienteId`
-- suelto. Al declararla, falta el indice que Prisma espera para navegarla en
-- ambos sentidos (cliente.ordenes).
--
-- La tabla ronda las 16 mil filas, asi que la creacion del indice es inmediata.
CREATE INDEX IF NOT EXISTS "ordenes_cliente_id_idx" ON "ventas"."ordenes"("cliente_id");
